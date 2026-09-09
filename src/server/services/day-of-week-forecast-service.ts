import "server-only";

import { calculateDayOfWeekForecast } from "@/domain/forecasting/day-of-week-forecast";
import {
  dayOfWeekForecastAnalysisSchema,
  dayOfWeekForecastModelVersion,
  type DayOfWeekForecastConfigSnapshot,
  type DayOfWeekForecastQuery,
} from "@/domain/forecasting/day-of-week-forecast-schemas";
import { shiftBusinessDate } from "@/domain/imports/daily-dates";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { GranularSalesRepository } from "@/server/repositories/granular-sales-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";

export async function getDayOfWeekForecast(
  context: AuthorizedStoreContext,
  query: DayOfWeekForecastQuery,
) {
  const db = await getAppDb();
  const salesRepository = new GranularSalesRepository(db);
  const productRepository = new ProductRepository(db);
  const configurationRepository = new StoreConfigurationRepository(db);
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
  const config: DayOfWeekForecastConfigSnapshot = {
    windowWeeks: settings.analytics.dayOfWeekForecastWindowWeeks,
    backtestWeeks: settings.analytics.dayOfWeekForecastBacktestWeeks,
    minimumObservationsPerWeekday:
      settings.analytics.dayOfWeekForecastMinimumObservationsPerWeekday,
    minimumBacktestObservations:
      settings.analytics.dayOfWeekForecastMinimumBacktestObservations,
    recencyDecay: settings.analytics.dayOfWeekForecastRecencyDecay,
    highConfidenceMaxWape:
      settings.analytics.dayOfWeekForecastHighConfidenceMaxWape,
    mediumConfidenceMaxWape:
      settings.analytics.dayOfWeekForecastMediumConfidenceMaxWape,
    configurationVersion: settings.analytics.calculationVersion,
  };
  const trainingFrom = shiftBusinessDate(
    asOf,
    -(config.windowWeeks * 7 - 1),
  );
  const products = productOptions.filter(
    ({ id }) => !query.productId || id === query.productId,
  );
  const [facts, dataRevision] = await Promise.all([
    salesRepository.findDailyFacts({
      context,
      from: trainingFrom,
      to: asOf,
      productId: productObjectId,
    }),
    salesRepository.getDataRevision(context),
  ]);
  const forecast = calculateDayOfWeekForecast({
    products,
    facts,
    asOf,
    horizonDays: query.horizonDays,
    config,
  });

  return dayOfWeekForecastAnalysisSchema.parse({
    grain: "day_of_week_quantity_forecast",
    asOf,
    productId: query.productId ?? null,
    horizonDays: query.horizonDays,
    trainingWindow: forecast.trainingWindow,
    forecastWindow: forecast.forecastWindow,
    config,
    products: forecast.products,
    dataRevision,
    modelVersion: dayOfWeekForecastModelVersion,
  });
}
