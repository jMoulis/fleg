import { expect, test, type Page } from "@playwright/test";

import {
  businessContextResponseSchema,
  promotionObservationResponseSchema,
  weatherObservationResponseSchema,
} from "@/domain/context-observations/schemas";
import {
  dailyImportCommitResponseSchema,
  dailyImportPreviewResponseSchema,
} from "@/domain/imports/daily-schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { getDemoStorePair } from "./demo-store";

const fixtureByProject = {
  "mobile-390": {
    businessDate: "2026-09-08",
    sourceDate: "08/09/2026",
    itm8: "539001",
    ean: "3390000000001",
    productLabel: "Produit contexte V3-05 mobile",
  },
  "desktop-1440": {
    businessDate: "2026-09-09",
    sourceDate: "09/09/2026",
    itm8: "514401",
    ean: "3144000000001",
    productLabel: "Produit contexte V3-05 desktop",
  },
} as const;

async function importContextProduct(
  page: Page,
  storeId: string,
  projectName: keyof typeof fixtureByProject,
) {
  const fixture = fixtureByProject[projectName];
  const csv = [
    "Date;ITM8 Prio;EAN Prio;Libellé;Quantité;Valeur prix vente;Val Marge",
    `${fixture.sourceDate};${fixture.itm8};${fixture.ean};${fixture.productLabel};2;20,00;6,00`,
    `${fixture.sourceDate};;;Total;2;20,00;6,00`,
  ].join("\n");
  const previewResponse = await page.request.post(
    `/api/stores/${storeId}/imports/daily/preview`,
    {
      multipart: {
        file: {
          name: `context-v3-05-${projectName}.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        },
      },
    },
  );
  const previewPayload: unknown = await previewResponse.json();
  expect(previewResponse.status(), JSON.stringify(previewPayload)).toBe(200);
  const preview = dailyImportPreviewResponseSchema.parse(previewPayload);

  const commitResponse = await page.request.post(
    `/api/stores/${storeId}/imports/daily/${preview.importId}/commit`,
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

  return fixture;
}

test("V3-05 joint des preuves promotionnelles et météo sans combler les absences", async ({
  page,
}, testInfo) => {
  const projectName = testInfo.project.name as keyof typeof fixtureByProject;
  const stores = await getDemoStorePair(page);
  const fixture = await importContextProduct(
    page,
    stores.primary.id,
    projectName,
  );
  const businessDate = fixture.businessDate;
  const productsResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/products/options`,
  );
  expect(productsResponse.status()).toBe(200);
  const products = productOptionsResponseSchema.parse(
    await productsResponse.json(),
  ).products;
  const product = products.find(
    (candidate) => candidate.label === fixture.productLabel,
  );
  expect(product).toBeDefined();
  if (!product) {
    throw new Error(`Produit de recette introuvable: ${fixture.productLabel}`);
  }

  const beforeResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/context?from=${businessDate}&to=${businessDate}&productId=${product.id}`,
  );
  const beforePayload: unknown = await beforeResponse.json();
  expect(beforeResponse.status(), JSON.stringify(beforePayload)).toBe(200);
  const before = businessContextResponseSchema.parse(
    beforePayload,
  ).context;

  await page.goto(
    `/${stores.primary.organizationSlug}/stores/${stores.primary.id}/context`,
  );
  await expect(
    page.getByRole("heading", { name: "Contexte promotionnel et météo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Promotion observée" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Météo observée" }),
  ).toBeVisible();
  await page.getByLabel("Date métier").first().fill(businessDate);
  await page.getByRole("combobox", { name: "Constat" }).click();
  await page.getByRole("option", { name: "Aucune promotion" }).click();
  const resetResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/context/promotions") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enregistrer le constat" }).click();
  const resetResponse = await resetResponsePromise;
  expect(resetResponse.status()).toBe(201);
  promotionObservationResponseSchema.parse(await resetResponse.json());

  const promotionKey = crypto.randomUUID();
  const promotionResponse = await page.request.post(
    `/api/stores/${stores.primary.id}/context/promotions`,
    {
      data: {
        idempotencyKey: promotionKey,
        businessDate,
        state: "active",
        productIds: [product.id],
        mechanic: "display",
        label: `Mise en avant V3-05 ${projectName}`,
        discountRate: 0.1,
        provenance: { kind: "manual" },
        notes: "Preuve de recette",
      },
    },
  );
  expect(promotionResponse.status()).toBe(201);
  const promotion = promotionObservationResponseSchema.parse(
    await promotionResponse.json(),
  ).observation;

  const replayResponse = await page.request.post(
    `/api/stores/${stores.primary.id}/context/promotions`,
    {
      data: {
        idempotencyKey: promotionKey,
        businessDate,
        state: "active",
        productIds: [product.id],
        mechanic: "display",
        label: `Mise en avant V3-05 ${projectName}`,
        discountRate: 0.1,
        provenance: { kind: "manual" },
        notes: "Preuve de recette",
      },
    },
  );
  expect(replayResponse.status()).toBe(201);
  expect(
    promotionObservationResponseSchema.parse(await replayResponse.json())
      .observation.id,
  ).toBe(promotion.id);

  const weatherResponse = await page.request.post(
    `/api/stores/${stores.primary.id}/context/weather`,
    {
      data: {
        idempotencyKey: crypto.randomUUID(),
        businessDate,
        condition: "rain",
        minimumTemperatureC: 12,
        maximumTemperatureC: 18,
        precipitationMm: 7.5,
        provenance: { kind: "manual" },
        notes: null,
      },
    },
  );
  expect(weatherResponse.status()).toBe(201);
  const weather = weatherObservationResponseSchema.parse(
    await weatherResponse.json(),
  ).observation;

  const joinedResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/context?from=${businessDate}&to=${businessDate}&productId=${product.id}`,
  );
  const joinedPayload: unknown = await joinedResponse.json();
  expect(joinedResponse.status(), JSON.stringify(joinedPayload)).toBe(200);
  const joined = businessContextResponseSchema.parse(
    joinedPayload,
  ).context;
  expect(joined).toMatchObject({
    productId: product.id,
    dataRevision: before.dataRevision + 3,
    coverage: { status: "complete", completeDates: [businessDate] },
  });
  expect(joined.days[0]).toMatchObject({
    promotion: {
      status: "observed",
      active: true,
      observationIds: [promotion.id],
      maximumDiscountRate: 0.1,
    },
    weather: {
      status: "observed",
      selectedObservationId: weather.id,
      condition: "rain",
      precipitationMm: 7.5,
    },
  });

  const foreignProductResponse = await page.request.get(
    `/api/stores/${stores.control.id}/context?from=${businessDate}&to=${businessDate}&productId=${product.id}`,
  );
  expect(foreignProductResponse.status()).toBe(404);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Couverture quotidienne" }),
  ).toBeVisible();
  await expect(
    page.getByText(`Mise en avant V3-05 ${projectName}`).first(),
  ).toBeVisible();
});
