import { expect, test } from "@playwright/test";

import {
  businessContextResponseSchema,
  promotionObservationResponseSchema,
  weatherObservationResponseSchema,
} from "@/domain/context-observations/schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { getDemoStorePair } from "./demo-store";

const dateByProject = {
  "mobile-390": "2026-09-08",
  "desktop-1440": "2026-09-09",
} as const;

test("V3-05 joint des preuves promotionnelles et météo sans combler les absences", async ({
  page,
}, testInfo) => {
  const projectName = testInfo.project.name as keyof typeof dateByProject;
  const businessDate = dateByProject[projectName];
  const stores = await getDemoStorePair(page);
  const productsResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/products/options`,
  );
  expect(productsResponse.status()).toBe(200);
  const products = productOptionsResponseSchema.parse(
    await productsResponse.json(),
  ).products;
  expect(products.length).toBeGreaterThan(0);
  const product = products[0]!;

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
