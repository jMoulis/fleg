import { expect, test, type Page } from "@playwright/test";

import {
  dailyImportCommitResponseSchema,
  dailyImportPreviewResponseSchema,
} from "@/domain/imports/daily-schemas";
import {
  inventoryCommitResponseSchema,
  inventoryCountResponseSchema,
  inventoryWorkspaceResponseSchema,
} from "@/domain/inventory/schemas";
import {
  orderSuggestionResponseSchema,
  orderSuggestionWorkspaceResponseSchema,
} from "@/domain/ordering/schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { getDemoStorePair } from "./demo-store";

const fixtureByProject = {
  "mobile-390": {
    orderDate: "2027-03-12",
    productLabel: "Produit commande V3-06 mobile",
    itm8: "639001",
    ean: "6390000000001",
  },
  "desktop-1440": {
    orderDate: "2027-03-19",
    productLabel: "Produit commande V3-06 desktop",
    itm8: "614401",
    ean: "6144000000001",
  },
} as const;

function shiftDate(businessDate: string, offset: number) {
  const date = new Date(`${businessDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function frenchDate(businessDate: string) {
  const [year, month, day] = businessDate.split("-");
  return `${day}/${month}/${year}`;
}

function dailyQuantity(businessDate: string) {
  const weekday = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
  if (weekday === 6) return 10;
  if (weekday === 0) return 12;
  return 8;
}

function dailyHistoryCsv(fixture: (typeof fixtureByProject)[keyof typeof fixtureByProject]) {
  const asOf = shiftDate(fixture.orderDate, -1);
  const rows = Array.from({ length: 84 }, (_, index) => {
    const businessDate = shiftDate(asOf, index - 83);
    const quantity = dailyQuantity(businessDate);
    return `${frenchDate(businessDate)};${fixture.itm8};${fixture.ean};${fixture.productLabel};${quantity};${quantity * 2},00;${quantity},00`;
  });
  const unavailableCatalogueRows = Array.from({ length: 30 }, (_, index) => {
    const sequence = index + 1;
    const itm8 = String(Number(fixture.itm8) + 1_000 + sequence);
    const ean = String(Number(fixture.ean) + 1_000 + sequence);
    return `${frenchDate(asOf)};${itm8};${ean};Produit indisponible UX ${sequence} ${fixture.productLabel};1;2,00;1,00`;
  });
  return [
    "Date;ITM8 Prio;EAN Prio;Libellé;Quantité;Valeur prix vente;Val Marge",
    ...rows,
    ...unavailableCatalogueRows,
  ].join("\n");
}

async function importDailyHistory(input: {
  fixture: (typeof fixtureByProject)[keyof typeof fixtureByProject];
  page: Page;
  projectName: string;
  storeId: string;
}) {
  const previewResponse = await input.page.request.post(
    `/api/stores/${input.storeId}/imports/daily/preview`,
    {
      multipart: {
        file: {
          name: `v3-06-${input.projectName}.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(dailyHistoryCsv(input.fixture)),
        },
      },
    },
  );
  const previewPayload: unknown = await previewResponse.json();
  expect(previewResponse.status(), JSON.stringify(previewPayload)).toBe(200);
  const preview = dailyImportPreviewResponseSchema.parse(previewPayload);
  expect(preview.coverage.status).toBe("complete");

  const commitResponse = await input.page.request.post(
    `/api/stores/${input.storeId}/imports/daily/${preview.importId}/commit`,
    {
      data: {
        resolutions: preview.unresolvedAliases.map((alias) => ({
          externalKey: alias.externalKey,
          action: "create" as const,
          canonicalLabel: alias.sourceLabel,
        })),
      },
    },
  );
  const commitPayload: unknown = await commitResponse.json();
  expect(commitResponse.status(), JSON.stringify(commitPayload)).toBe(200);
  expect(
    dailyImportCommitResponseSchema.parse(commitPayload).importedFactCount,
  ).toBeGreaterThan(0);
}

async function commitMorningStock(input: {
  businessDate: string;
  page: Page;
  productId: string;
  storeId: string;
}) {
  const createResponse = await input.page.request.post(
    `/api/stores/${input.storeId}/inventory/counts`,
    {
      data: {
        businessDate: input.businessDate,
        idempotencyKey: crypto.randomUUID(),
      },
    },
  );
  const createPayload: unknown = await createResponse.json();
  expect(createResponse.status(), JSON.stringify(createPayload)).toBe(201);
  const count = inventoryCountResponseSchema.parse(createPayload).count;
  const targetLine = {
    productId: input.productId,
    familyCode: "3400" as const,
    stockUnit: "piece" as const,
    packSize: 10,
    reserveCaseCount: 0,
    shelfQuantity: 4,
  };
  const lines = count.lines.some(
    ({ productId }) => productId === input.productId,
  )
    ? count.lines.map((line) =>
        line.productId === input.productId ? targetLine : line,
      )
    : [...count.lines, targetLine];
  const saveResponse = await input.page.request.patch(
    `/api/stores/${input.storeId}/inventory/counts/${count.id}`,
    {
      data: {
        idempotencyKey: crypto.randomUUID(),
        basedOnRevision: count.revision,
        lines,
      },
    },
  );
  const savePayload: unknown = await saveResponse.json();
  expect(saveResponse.status(), JSON.stringify(savePayload)).toBe(200);
  const saved = inventoryCountResponseSchema.parse(savePayload).count;
  const commitResponse = await input.page.request.post(
    `/api/stores/${input.storeId}/inventory/counts/${saved.id}/commit`,
    {
      data: {
        idempotencyKey: crypto.randomUUID(),
        basedOnRevision: saved.revision,
      },
    },
  );
  const commitPayload: unknown = await commitResponse.json();
  expect(commitResponse.status(), JSON.stringify(commitPayload)).toBe(200);
  inventoryCommitResponseSchema.parse(commitPayload);
  const workspaceResponse = await input.page.request.get(
    `/api/stores/${input.storeId}/inventory/counts?businessDate=${input.businessDate}`,
  );
  expect(workspaceResponse.status()).toBe(200);
  const workspace = inventoryWorkspaceResponseSchema.parse(
    await workspaceResponse.json(),
  ).workspace;
  expect(
    workspace.products.find(({ id }) => id === input.productId)?.daySnapshot,
  ).toMatchObject({
    businessDate: input.businessDate,
    packSize: 10,
    onHandQuantity: 4,
  });
}

test("V3-06 prépare et valide une commande flux tendu couvrant le week-end", async ({
  page,
}, testInfo) => {
  const projectName = testInfo.project.name as keyof typeof fixtureByProject;
  const fixture = fixtureByProject[projectName];
  const stores = await getDemoStorePair(page);
  await importDailyHistory({
    fixture,
    page,
    projectName,
    storeId: stores.primary.id,
  });
  const productsResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/products/options`,
  );
  expect(productsResponse.status()).toBe(200);
  const product = productOptionsResponseSchema
    .parse(await productsResponse.json())
    .products.find(({ label }) => label === fixture.productLabel);
  expect(product).toBeDefined();
  if (!product) throw new Error("Le produit V3-06 n’a pas été importé");

  await commitMorningStock({
    businessDate: fixture.orderDate,
    page,
    productId: product.id,
    storeId: stores.primary.id,
  });

  const saturdayDate = shiftDate(fixture.orderDate, 1);
  const sundayDate = shiftDate(fixture.orderDate, 2);
  await page.goto(
    `/${stores.primary.organizationSlug}/stores/${stores.primary.id}/orders?orderDate=${fixture.orderDate}`,
  );
  await expect(
    page.getByRole("heading", { name: "Commande du matin" }),
  ).toBeVisible();
  await expect(page.getByText("Le matin, dans l’ordre")).toBeVisible();
  await expect(page.getByText(/couvre les ventes du samedi et du dimanche/)).toBeVisible();

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/order-suggestions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /Préparer la proposition|Recalculer/ })
    .click();
  const createResponse = await createResponsePromise;
  const createPayload: unknown = await createResponse.json();
  expect(createResponse.status(), JSON.stringify(createPayload)).toBe(201);
  const suggestion = orderSuggestionResponseSchema.parse(createPayload)
    .suggestion;
  expect(suggestion).toMatchObject({
    orderDate: fixture.orderDate,
    deliveryDate: saturdayDate,
    coverageDates: [saturdayDate, sundayDate],
    status: "draft",
    config: { targetClosingStockRatio: 0, cutoffLocalTime: "09:30" },
  });
  const line = suggestion.lines.find(
    ({ productId }) => productId === product.id,
  );
  expect(line).toMatchObject({
    status: "ready",
    morningOnHandQuantity: 4,
    coveredDemandQuantity: 22,
    netNeedQuantity: 18,
    suggestedCaseCount: 2,
    suggestedOrderQuantity: 20,
    projectedClosingStockQuantity: 2,
    forecastConfidence: "high",
  });
  expect(suggestion.limitations).toContain(
    "Cette proposition ne crée et ne transmet aucune commande fournisseur.",
  );

  await expect(
    page.getByRole("button", { name: /^Calculées/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const approvedCaseInput = page.getByLabel("Colis validés").first();
  await approvedCaseInput.fill("3");
  await expect(
    page.getByRole("button", { name: "Valider la proposition" }),
  ).toBeDisabled();
  await page
    .getByLabel("Motif de l’écart")
    .fill("Prudence opérationnelle locale");
  await expect(
    page.getByRole("button", { name: "Valider la proposition" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /^Toutes les lignes/ }).click();
  await expect(
    page
      .locator('[data-order-page-size="25"]')
      .locator(':scope > [data-slot="card"]'),
  ).toHaveCount(25);
  const pagination = page.getByRole("navigation", {
    name: "Pagination des lignes de commande avant la liste",
  });
  await expect(pagination.getByText(/^Page 1\//)).toBeVisible();
  await pagination.getByRole("button", { name: "Page suivante" }).click();
  await expect(pagination.getByText(/^Page 2\//)).toBeVisible();
  await page.getByRole("button", { name: /^Calculées/ }).click();
  await expect(page.getByLabel("Colis validés").first()).toHaveValue("3");
  await expect(page.getByLabel("Motif de l’écart")).toHaveValue(
    "Prudence opérationnelle locale",
  );

  const replay = await page.request.post(
    `/api/stores/${stores.primary.id}/order-suggestions`,
    { data: createResponse.request().postDataJSON() },
  );
  expect(replay.status()).toBe(201);
  expect(
    orderSuggestionResponseSchema.parse(await replay.json()).suggestion.id,
  ).toBe(suggestion.id);

  const saturdayWorkspace = await page.request.get(
    `/api/stores/${stores.primary.id}/order-suggestions?orderDate=${shiftDate(fixture.orderDate, 1)}`,
  );
  expect(saturdayWorkspace.status()).toBe(200);
  expect(
    orderSuggestionWorkspaceResponseSchema.parse(await saturdayWorkspace.json())
      .cycle,
  ).toMatchObject({
    orderWeekday: "saturday",
    deliveryDate: shiftDate(fixture.orderDate, 3),
    coverageDates: [shiftDate(fixture.orderDate, 3)],
  });
  const sundayCreate = await page.request.post(
    `/api/stores/${stores.primary.id}/order-suggestions`,
    {
      data: {
        orderDate: sundayDate,
        idempotencyKey: crypto.randomUUID(),
      },
    },
  );
  expect(sundayCreate.status()).toBe(400);

  const unjustifiedOverride = await page.request.post(
    `/api/stores/${stores.primary.id}/order-suggestions/${suggestion.id}/approve`,
    {
      data: {
        idempotencyKey: crypto.randomUUID(),
        basedOnGeneratedAt: suggestion.generatedAt,
        note: null,
        lines: [
          {
            productId: product.id,
            approvedCaseCount: 3,
            overrideReason: null,
          },
        ],
      },
    },
  );
  expect(unjustifiedOverride.status()).toBe(400);

  const approvalResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/order-suggestions/${suggestion.id}/approve`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Valider la proposition" }).click();
  const approvalResponse = await approvalResponsePromise;
  const approvalPayload: unknown = await approvalResponse.json();
  expect(approvalResponse.status(), JSON.stringify(approvalPayload)).toBe(200);
  const approved = orderSuggestionResponseSchema.parse(approvalPayload)
    .suggestion;
  expect(approved).toMatchObject({
    id: suggestion.id,
    status: "approved",
    decision: {
      lines: [
        {
          productId: product.id,
          suggestedCaseCount: 2,
          approvedCaseCount: 3,
          approvedOrderQuantity: 30,
          overrideReason: "Prudence opérationnelle locale",
        },
      ],
    },
  });
  await expect(page.getByText("Validée", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucune transmission fournisseur")).toBeVisible();

  const foreignApproval = await page.request.post(
    `/api/stores/${stores.control.id}/order-suggestions/${suggestion.id}/approve`,
    { data: approvalResponse.request().postDataJSON() },
  );
  expect(foreignApproval.status()).toBe(404);
});
