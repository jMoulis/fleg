import { expect, test, type Page } from "@playwright/test";

import {
  dailySalesReadResponseSchema,
  weeklySalesReadResponseSchema,
} from "@/domain/analytics/granular-sales-schemas";
import { trueXyzAnalysisResponseSchema } from "@/domain/analytics/true-xyz-schemas";
import { dayOfWeekForecastAnalysisResponseSchema } from "@/domain/forecasting/day-of-week-forecast-schemas";
import { dashboardResponseSchema } from "@/domain/analytics/schemas";
import {
  dailyImportCommitResponseSchema,
  dailyImportPreviewResponseSchema,
} from "@/domain/imports/daily-schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import {
  getDemoStorePair,
  selectPrimaryDemoStore,
} from "./demo-store";

const dailyStartDate = "2036-12-31";
const dailyEndDate = "2037-01-01";
const dailyIsoWeekKey = "2037-W01";

function dailyCsv(projectName: string) {
  const prefix = projectName === "mobile-390" ? "390" : "1440";
  return [
    "Date;ITM8 Prio;EAN Prio;Libellé;Quantité;Valeur prix vente;Val Marge",
    `31/12/2036;${prefix}01;3${prefix.padEnd(12, "0")};Produit journalier ${prefix} A;2;20,00;6,00`,
    "31/12/2036;;;Total;2;20,00;6,00",
    `01/01/2037;${prefix}02;4${prefix.padEnd(12, "0")};Produit journalier ${prefix} B;3;30,00;9,00`,
    "01/01/2037;;;Total;3;30,00;9,00",
  ].join("\n");
}

async function monthlyDashboardSnapshot(page: Page, storeId: string) {
  const response = await page.request.get(
    `/api/stores/${storeId}/dashboard?period=2026-12`,
  );
  expect(response.status()).toBe(200);
  const result = dashboardResponseSchema.parse(await response.json());
  if (!result.dashboard) return null;
  return {
    periodKey: result.dashboard.periodKey,
    revenueCents: result.dashboard.revenueCents,
    marginCents: result.dashboard.marginCents,
    marginRatio: result.dashboard.marginRatio,
    quantity: result.dashboard.quantity,
    productCount: result.dashboard.productCount,
    priorYearRevenueCents: result.dashboard.priorYearRevenueCents,
    yearOverYearRatio: result.dashboard.yearOverYearRatio,
    targetRevenueCents: result.dashboard.targetRevenueCents,
    targetAttainmentRatio: result.dashboard.targetAttainmentRatio,
    calculationVersion: result.dashboard.calculationVersion,
  };
}

test("V3-01 importe le journalier et expose une semaine ISO sans changer le mensuel", async ({
  page,
}, testInfo) => {
  const stores = await getDemoStorePair(page);
  const projectName = testInfo.project.name;
  const csv = dailyCsv(projectName);
  const fileName = `daily-${projectName}.csv`;
  const monthlyBefore = await monthlyDashboardSnapshot(page, stores.primary.id);

  await page.goto("/stores");
  await selectPrimaryDemoStore(page);
  await page.getByRole("button", { name: "Ouvrir le cockpit" }).click();
  await page.getByRole("link", { name: "Imports" }).click();

  const dailySection = page.getByLabel("Ventes journalières", { exact: true });
  await dailySection.getByLabel("Ventes journalières Mercalys").setInputFiles({
    name: fileName,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const previewResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/imports/daily/preview") &&
      response.request().method() === "POST",
  );
  await dailySection
    .getByRole("button", { name: "Prévisualiser" })
    .click();
  const previewResponse = await previewResponsePromise;
  expect(previewResponse.status()).toBe(200);
  const preview = dailyImportPreviewResponseSchema.parse(
    await previewResponse.json(),
  );
  expect(preview.startDate).toBe(dailyStartDate);
  expect(preview.endDate).toBe(dailyEndDate);
  expect(preview.excludedRowCount).toBe(2);
  expect(preview.coverage.status).toBe("complete");

  const commitResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/imports/daily/${preview.importId}/commit`) &&
      response.request().method() === "POST",
  );
  await dailySection
    .getByRole("button", { name: "Valider l’import journalier" })
    .click();
  const commitResponse = await commitResponsePromise;
  expect(commitResponse.status()).toBe(200);
  const commit = dailyImportCommitResponseSchema.parse(
    await commitResponse.json(),
  );
  expect(commit.importedFactCount).toBeGreaterThan(0);
  await expect(
    dailySection.getByRole("heading", { name: "Import journalier validé" }),
  ).toBeVisible();

  const weeklyRow = page.getByRole("row", { name: new RegExp(dailyIsoWeekKey) });
  await expect(weeklyRow).toBeVisible();
  await expect(weeklyRow).toContainText("Partielle · 2/7");

  const replay = await page.request.post(
    `/api/stores/${stores.primary.id}/imports/daily/${preview.importId}/commit`,
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
  expect(replay.status()).toBe(200);
  const replayedCommit = dailyImportCommitResponseSchema.parse(
    await replay.json(),
  );
  expect(replayedCommit.dataRevision).toBe(commit.dataRevision);
  expect(replayedCommit.importedFactCount).toBe(commit.importedFactCount);

  const weeklyResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/sales/weekly?from=${dailyStartDate}&to=${dailyEndDate}`,
  );
  expect(weeklyResponse.status()).toBe(200);
  const weekly = weeklySalesReadResponseSchema.parse(
    await weeklyResponse.json(),
  );
  expect(weekly.from).toBe("2036-12-29");
  expect(weekly.to).toBe("2037-01-04");
  expect(weekly.weeks[0]).toMatchObject({
    isoWeekKey: dailyIsoWeekKey,
    coverage: { status: "partial" },
  });

  const otherStoreResponse = await page.request.get(
    `/api/stores/${stores.control.id}/sales/daily?from=${dailyStartDate}&to=${dailyEndDate}`,
  );
  expect(otherStoreResponse.status()).toBe(200);
  const otherStoreDaily = dailySalesReadResponseSchema.parse(
    await otherStoreResponse.json(),
  );
  expect(otherStoreDaily.days).toEqual([]);
  expect(otherStoreDaily.coverage.status).toBe("unknown");

  const productsResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/products/options`,
  );
  expect(productsResponse.status()).toBe(200);
  const products = productOptionsResponseSchema.parse(
    await productsResponse.json(),
  );
  const primaryProduct = products.products.find(
    (product) => product.label === `Produit journalier ${projectName === "mobile-390" ? "390" : "1440"} A`,
  );
  expect(primaryProduct).toBeDefined();
  const xyzResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/products/xyz?asOf=${dailyStartDate}&productId=${primaryProduct?.id ?? ""}`,
  );
  expect(xyzResponse.status()).toBe(200);
  const xyz = trueXyzAnalysisResponseSchema.parse(await xyzResponse.json());
  expect(xyz).toMatchObject({
    grain: "complete_weekly_unit_demand",
    asOf: dailyStartDate,
    productId: primaryProduct?.id,
    config: { windowWeeks: 13, minimumCompleteWeeks: 8 },
  });
  expect(xyz.products[0]).toMatchObject({
    status: "unclassified",
    xyzClass: null,
    completeWeekCount: 0,
    candidateWeekCount: 13,
  });
  expect(xyz.products[0]?.warnings.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      "INCOMPLETE_WEEKS_EXCLUDED",
      "INSUFFICIENT_COMPLETE_WEEKS",
    ]),
  );
  expect(
    xyz.products[0]?.weeks.every(({ includedInCalculation }) => !includedInCalculation),
  ).toBe(true);

  const forecastResponse = await page.request.get(
    `/api/stores/${stores.primary.id}/products/day-of-week-forecast?asOf=${dailyStartDate}&productId=${primaryProduct?.id ?? ""}&horizonDays=7`,
  );
  expect(forecastResponse.status()).toBe(200);
  const forecast = dayOfWeekForecastAnalysisResponseSchema.parse(
    await forecastResponse.json(),
  );
  expect(forecast).toMatchObject({
    grain: "day_of_week_quantity_forecast",
    asOf: dailyStartDate,
    productId: primaryProduct?.id,
    horizonDays: 7,
    config: { windowWeeks: 12, backtestWeeks: 2 },
  });
  expect(forecast.products[0]).toMatchObject({
    status: "unavailable",
    confidence: "low",
    predictedDayCount: 0,
    forecastTotalQuantity: null,
  });
  expect(
    forecast.products[0]?.forecastDays.every(
      ({ predictedQuantity }) => predictedQuantity === null,
    ),
  ).toBe(true);

  const foreignProductResponse = await page.request.get(
    `/api/stores/${stores.control.id}/sales/daily?from=${dailyStartDate}&to=${dailyEndDate}&productId=${primaryProduct?.id ?? ""}`,
  );
  expect(foreignProductResponse.status()).toBe(404);
  const foreignXyzResponse = await page.request.get(
    `/api/stores/${stores.control.id}/products/xyz?productId=${primaryProduct?.id ?? ""}`,
  );
  expect(foreignXyzResponse.status()).toBe(404);
  const foreignForecastResponse = await page.request.get(
    `/api/stores/${stores.control.id}/products/day-of-week-forecast?productId=${primaryProduct?.id ?? ""}`,
  );
  expect(foreignForecastResponse.status()).toBe(404);

  const monthlyAfter = await monthlyDashboardSnapshot(page, stores.primary.id);
  expect(monthlyAfter).toEqual(monthlyBefore);
});
