import "server-only";

import { calculateTrueXyz } from "@/domain/analytics/true-xyz";
import {
  trueXyzAnalysisSchema,
  trueXyzCalculationVersion,
  type TrueXyzConfigSnapshot,
  type TrueXyzQuery,
} from "@/domain/analytics/true-xyz-schemas";
import {
  isoWeekBounds,
  isoWeekKeyFromBusinessDate,
  shiftBusinessDate,
} from "@/domain/imports/daily-dates";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { GranularSalesRepository } from "@/server/repositories/granular-sales-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";

export async function getTrueXyzAnalysis(
  context: AuthorizedStoreContext,
  query: TrueXyzQuery,
) {
  const db = await getAppDb();
  const salesRepository = new GranularSalesRepository(db);
  const configurationRepository = new StoreConfigurationRepository(db);
  const productRepository = new ProductRepository(db);
  const productObjectId = await salesRepository.requireProduct(
    context,
    query.productId,
  );
  const [settings, latestBusinessDate, productOptions] = await Promise.all([
    configurationRepository.getSettings(context),
    query.asOf
      ? Promise.resolve(null)
      : salesRepository.findLatestBusinessDate(context, productObjectId),
    productRepository.listOptions(context),
  ]);
  const asOf =
    query.asOf ?? latestBusinessDate ?? new Date().toISOString().slice(0, 10);
  const lastWeek = isoWeekBounds(isoWeekKeyFromBusinessDate(asOf));
  const from = shiftBusinessDate(
    lastWeek.endsOn,
    -(settings.analytics.xyzWindowWeeks * 7 - 1),
  );
  const products = productOptions.filter(
    ({ id }) => !query.productId || id === query.productId,
  );
  const [facts, dataRevision] = await Promise.all([
    salesRepository.findDailyFacts({
      context,
      from,
      to: asOf,
      productId: productObjectId,
    }),
    salesRepository.getDataRevision(context),
  ]);
  const config: TrueXyzConfigSnapshot = {
    windowWeeks: settings.analytics.xyzWindowWeeks,
    minimumCompleteWeeks: settings.analytics.xyzMinimumCompleteWeeks,
    minimumMeanWeeklyQuantity:
      settings.analytics.xyzMinimumMeanWeeklyQuantity,
    xMaxCoefficientOfVariation:
      settings.analytics.xyzXMaxCoefficientOfVariation,
    yMaxCoefficientOfVariation:
      settings.analytics.xyzYMaxCoefficientOfVariation,
    configurationVersion: settings.analytics.calculationVersion,
  };

  return trueXyzAnalysisSchema.parse({
    grain: "complete_weekly_unit_demand",
    asOf,
    from,
    to: lastWeek.endsOn,
    productId: query.productId ?? null,
    config,
    products: calculateTrueXyz({
      products,
      facts,
      from,
      to: lastWeek.endsOn,
      config,
    }),
    dataRevision,
    calculationVersion: trueXyzCalculationVersion,
  });
}
