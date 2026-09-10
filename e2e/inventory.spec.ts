import { expect, type Page, test } from "@playwright/test";

import {
  inventoryCommitResponseSchema,
  inventoryCountResponseSchema,
  inventoryWorkspaceResponseSchema,
} from "@/domain/inventory/schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { getDemoStorePair, selectPrimaryDemoStore } from "./demo-store";

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

test("V3-02 saisit, reprend et versionne un comptage manuel", async ({
  page,
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
  const product = products[0];
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
  await page.getByRole("button", { name: "Démarrer le comptage" }).click();
  await expect(page.getByText("Brouillon ouvert.")).toBeVisible();
  const saveButton = page.getByRole("button", {
    name: "Enregistrer le brouillon",
  });
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeInViewport();

  await page
    .getByRole("navigation", { name: "Étapes du comptage" })
    .getByRole("button", { name: /Configurer/ })
    .click();
  await expect(page.locator("[data-inventory-product]")).toHaveCount(
    Math.min(products.length, 25),
  );

  await page.getByLabel("Rechercher un article").fill(product.label);
  await page.getByLabel(`Famille de ${product.label}`).selectOption("3400");
  await page.getByLabel(`Unité de ${product.label}`).selectOption("kg");
  await page.getByLabel(`Colisage de ${product.label}`).fill("18.5");

  await page.getByRole("button", { name: /Réserve/ }).click();
  await page.getByLabel("Rechercher un article").fill(product.label);
  await page.getByLabel(`Colis en réserve pour ${product.label}`).fill("2");

  await page.getByRole("button", { name: /Rayon/ }).click();
  await page.getByLabel("Rechercher un article").fill(product.label);
  await page
    .getByLabel(`Quantité en rayon pour ${product.label}`)
    .fill("3.25");
  await expect(page.getByText("40,25 kg")).toBeVisible();

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/inventory/counts/") &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.status()).toBe(200);
  const saved = inventoryCountResponseSchema.parse(await saveResponse.json());

  const duplicateSave = await page.request.patch(
    `/api/stores/${storeId}/inventory/counts/${saved.count.id}`,
    { data: saveResponse.request().postDataJSON() },
  );
  expect(duplicateSave.status()).toBe(200);
  expect(
    inventoryCountResponseSchema.parse(await duplicateSave.json()).count.revision,
  ).toBe(saved.count.revision);
  const foreignSave = await page.request.patch(
    `/api/stores/${stores.control.id}/inventory/counts/${saved.count.id}`,
    { data: saveResponse.request().postDataJSON() },
  );
  expect(foreignSave.status()).toBe(404);

  await page.reload();
  await page.getByLabel("Rechercher un article").fill(product.label);
  await expect(page.getByLabel(`Colisage de ${product.label}`)).toHaveValue(
    "18.5",
  );
  await expect(
    page.getByLabel(`Colis en réserve pour ${product.label}`),
  ).toHaveValue("2");

  await page.getByRole("button", { name: /Vérifier/ }).click();
  await page.getByLabel("Rechercher un article").fill(product.label);

  const commitResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/inventory/counts/${saved.count.id}/commit`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Valider le comptage" }).click();
  const commitResponse = await commitResponsePromise;
  expect(commitResponse.status()).toBe(200);
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
  await expect(page.getByText("Le relevé est verrouillé")).toBeVisible();

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

  const correctionResponse = await page.request.post(
    `/api/stores/${storeId}/inventory/counts`,
    { data: { businessDate, idempotencyKey: crypto.randomUUID() } },
  );
  expect(correctionResponse.status()).toBe(201);
  const correction = inventoryCountResponseSchema.parse(
    await correctionResponse.json(),
  ).count;
  expect(correction.version).toBe(2);
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
            ? { ...line, packSize: 20, reserveCaseCount: 2, shelfQuantity: 3.25 }
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
