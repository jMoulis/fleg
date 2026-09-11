import { expect, type Page, test } from "@playwright/test";

import {
  inventoryCommitResponseSchema,
  inventoryCountResponseSchema,
  inventoryWorkspaceResponseSchema,
} from "@/domain/inventory/schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { getDemoStorePair, selectPrimaryDemoStore } from "./demo-store";
import { openProductConfiguration } from "./offline-ui";

async function openPrimaryStore(page: Page) {
  await page.goto("/stores");
  await selectPrimaryDemoStore(page);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const match = page.url().match(/^(.*\/stores\/([a-f\d]{24}))\/dashboard$/i);
  expect(match).not.toBeNull();
  return { storeBaseUrl: match?.[1] ?? "", storeId: match?.[2] ?? "" };
}

async function isolatedBusinessDate(
  page: Page,
  storeId: string,
  projectName: string,
): Promise<string> {
  const projectYear = projectName === "mobile-390" ? 2100 : 5000;
  const randomOffset =
    Number.parseInt(crypto.randomUUID().slice(0, 8), 16) % 900_000;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = new Date(
      Date.UTC(projectYear, 0, 1 + randomOffset + attempt),
    )
      .toISOString()
      .slice(0, 10);
    const response = await page.request.get(
      `/api/stores/${storeId}/inventory/counts?businessDate=${candidate}`,
    );
    expect(response.status()).toBe(200);
    const workspace = inventoryWorkspaceResponseSchema.parse(
      await response.json(),
    ).workspace;
    if (!workspace.count) return candidate;
  }

  throw new Error("Impossible de réserver une date de comptage isolée");
}

test("UX-STOCK-02 compte avec une coupure, reprend, valide et corrige dans le même parcours", async ({
  page,
  context,
}, testInfo) => {
  const { storeBaseUrl, storeId } = await openPrimaryStore(page);
  const stores = await getDemoStorePair(page);
  const optionsResponse = await page.request.get(
    `/api/stores/${storeId}/products/options`,
  );
  expect(optionsResponse.status()).toBe(200);
  const products = productOptionsResponseSchema.parse(
    await optionsResponse.json(),
  ).products;
  const product = products.find((p) => /banane/i.test(p.label)) ?? products[0];
  expect(product, "Le seed doit exposer un article").toBeDefined();
  if (!product) throw new Error("Article de recette absent");

  const businessDate = await isolatedBusinessDate(
    page,
    storeId,
    testInfo.project.name,
  );
  await page.goto(
    `${storeBaseUrl}/inventory?businessDate=${encodeURIComponent(businessDate)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Stocks du matin" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/offline\?/);
  await page.getByRole("button", { name: "Commencer le comptage" }).click();
  const steps = page.getByRole("navigation", { name: "Étapes du comptage" });
  const row = page.locator("[data-local-count-product]").filter({
    has: page.getByRole("heading", { name: product.label, exact: true }),
  });
  const saveBar = page.locator("[data-inventory-save-bar]");
  await expect(saveBar).toBeInViewport();

  await page
    .getByRole("navigation", { name: "Étapes du comptage" })
    .getByRole("button", { name: /Configurer/ })
    .click();
  await expect(page.locator("[data-local-count-product]")).toHaveCount(
    Math.min(products.length, 25),
  );

  await page.getByLabel("Rechercher dans le brouillon").fill(product.label);
  await openProductConfiguration(row);
  await row
    .getByRole("combobox", { name: "Famille", exact: true })
    .selectOption("3400");
  await row
    .getByRole("combobox", { name: "Unité", exact: true })
    .selectOption("kg");
  await row.getByLabel("Colisage du relevé").fill("18.5");

  await steps.getByRole("button", { name: "Réserve", exact: true }).click();
  await expect(row.getByLabel("Colis en réserve")).toHaveValue("");
  await row.getByLabel("Colis en réserve").fill("2");
  await expect(
    saveBar.getByText("Enregistré sur cet appareil", { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);

  await steps.getByRole("button", { name: "Rayon", exact: true }).click();
  await row.getByLabel("Quantité en rayon", { exact: false }).fill("3.25");
  await expect(row.getByText(/total 40.25 kg/)).toBeVisible();
  await expect(
    saveBar.getByText("Enregistré sur cet appareil", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    row.getByLabel("Quantité en rayon", { exact: false }),
  ).toHaveValue("3.25");
  await expect(row.getByText(/Réserve : 2 colis/)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `unified-stock-offline-${testInfo.project.name}.png`,
    ),
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    saveBar.getByText("Brouillon synchronisé", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const synced = inventoryWorkspaceResponseSchema.parse(
    await (
      await page.request.get(
        `/api/stores/${storeId}/inventory/counts?businessDate=${businessDate}`,
      )
    ).json(),
  ).workspace.count!;
  // The original API contract remains idempotent and store-isolated.
  const patch = {
    idempotencyKey: crypto.randomUUID(),
    basedOnRevision: synced.revision,
    lines: synced.lines,
  };

  const saveResponse = await page.request.patch(
    `/api/stores/${storeId}/inventory/counts/${synced.id}`,
    { data: patch },
  );
  expect(saveResponse.status()).toBe(200);
  const saved = inventoryCountResponseSchema.parse(await saveResponse.json());

  const duplicateSave = await page.request.patch(
    `/api/stores/${storeId}/inventory/counts/${saved.count.id}`,
    { data: patch },
  );
  expect(duplicateSave.status()).toBe(200);
  expect(
    inventoryCountResponseSchema.parse(await duplicateSave.json()).count
      .revision,
  ).toBe(saved.count.revision);
  const foreignSave = await page.request.patch(
    `/api/stores/${stores.control.id}/inventory/counts/${saved.count.id}`,
    { data: patch },
  );
  expect(foreignSave.status()).toBe(404);

  await page.reload();
  await expect(row.getByLabel("Colisage du relevé")).toHaveValue("18.5");
  await expect(
    row.getByLabel("Quantité en rayon", { exact: false }),
  ).toHaveValue("3.25");

  await steps.getByRole("button", { name: "Vérifier", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Valider le comptage" }),
  ).toBeEnabled();
  // Persist on the server but lose its first response, then reopen and replay exactly.
  const commitPath = `**/inventory/counts/${saved.count.id}/commit`;
  let lostKey = "";
  await context.route(
    commitPath,
    async (route) => {
      lostKey = route.request().postDataJSON().idempotencyKey;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Valider le comptage" }).click();
  await expect(
    page.getByRole("button", { name: "Vérifier la validation" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByText(/Validation non confirmée : le relevé est verrouillé/),
  ).toBeVisible();

  const commitResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/inventory/counts/${saved.count.id}/commit`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Vérifier la validation" }).click();
  const commitResponse = await commitResponsePromise;
  expect(commitResponse.status()).toBe(200);
  expect(commitResponse.request().postDataJSON().idempotencyKey).toBe(lostKey);
  const committed = inventoryCommitResponseSchema.parse(
    await commitResponse.json(),
  );
  expect(committed.result.snapshots[0]).toMatchObject({
    productId: product.id,
    familyCode: "3400",
    stockUnit: "kg",
    reserveCaseCount: 2,
    packSize: 18.5,
    shelfQuantity: 3.25,
    onHandQuantity: 40.25,
    onOrderQuantity: null,
    reservedQuantity: null,
    source: "manual_count",
    version: 1,
    active: true,
  });
  await expect(
    page.getByText(/Stock validé · version 1. Le relevé est verrouillé/),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `unified-stock-validated-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  const duplicateCommit = await page.request.post(
    `/api/stores/${storeId}/inventory/counts/${saved.count.id}/commit`,
    { data: commitResponse.request().postDataJSON() },
  );
  expect(duplicateCommit.status()).toBe(200);
  expect(
    inventoryCommitResponseSchema.parse(await duplicateCommit.json()).result
      .snapshots[0]?.id,
  ).toBe(committed.result.snapshots[0]?.id);

  const workspaceResponse = await page.request.get(
    `/api/stores/${storeId}/inventory/counts?businessDate=${businessDate}`,
  );
  expect(workspaceResponse.status()).toBe(200);
  const workspace = inventoryWorkspaceResponseSchema.parse(
    await workspaceResponse.json(),
  ).workspace;
  expect(workspace.count?.status).toBe("committed");
  expect(
    workspace.products.find(({ id }) => id === product.id)?.latestAvailability,
  ).toMatchObject({
    isStockout: false,
    snapshot: { onHandQuantity: 40.25, packSize: 18.5 },
  });

  const correctionPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/stores/${storeId}/inventory/counts`) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Corriger ce relevé" }).click();
  const correctionResponse = await correctionPromise;
  expect(correctionResponse.status()).toBe(201);
  const correction = inventoryCountResponseSchema.parse(
    await correctionResponse.json(),
  ).count;
  expect(correction.version).toBe(2);
  await steps.getByRole("button", { name: "Réserve", exact: true }).click();
  await expect(row.getByLabel("Colis en réserve")).toHaveValue("2");
  await expect(row.getByLabel("Colis en réserve")).toBeEnabled();
  const correctionLine = correction.lines.find(
    ({ productId }) => productId === product.id,
  );
  expect(correctionLine).toBeDefined();
  const correctedSaveResponse = await page.request.patch(
    `/api/stores/${storeId}/inventory/counts/${correction.id}`,
    {
      data: {
        idempotencyKey: crypto.randomUUID(),
        basedOnRevision: correction.revision,
        lines: correction.lines.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                packSize: 20,
                reserveCaseCount: 2,
                shelfQuantity: 3.25,
              }
            : line,
        ),
      },
    },
  );
  expect(correctedSaveResponse.status()).toBe(200);
  const correctedSave = inventoryCountResponseSchema.parse(
    await correctedSaveResponse.json(),
  ).count;
  const correctedCommitResponse = await page.request.post(
    `/api/stores/${storeId}/inventory/counts/${correction.id}/commit`,
    {
      data: {
        idempotencyKey: crypto.randomUUID(),
        basedOnRevision: correctedSave.revision,
      },
    },
  );
  expect(correctedCommitResponse.status()).toBe(200);
  expect(
    inventoryCommitResponseSchema.parse(await correctedCommitResponse.json())
      .result.snapshots[0],
  ).toMatchObject({
    productId: product.id,
    packSize: 20,
    onHandQuantity: 43.25,
    version: 2,
    supersedesSnapshotId: committed.result.snapshots[0]?.id,
  });
});
