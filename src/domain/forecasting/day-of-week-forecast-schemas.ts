import * as z from "zod";

import {
  businessDateSchema,
  dailyCoverageSchema,
} from "@/domain/imports/daily-schemas";

export const dayOfWeekForecastModelVersion = "day-of-week-forecast-v1";

const optionalQueryValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const dayOfWeekForecastQuerySchema = z
  .object({
    asOf: optionalQueryValue(businessDateSchema),
    productId: optionalQueryValue(z.string().regex(/^[a-f\d]{24}$/i)),
    horizonDays: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int().min(1).max(28).default(7),
    ),
  })
  .strict();
export type DayOfWeekForecastQuery = z.infer<
  typeof dayOfWeekForecastQuerySchema
>;

export const forecastWeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export type ForecastWeekday = z.infer<typeof forecastWeekdaySchema>;

export const dayOfWeekForecastWarningSchema = z
  .object({
    code: z.enum([
      "NO_DAILY_OBSERVATIONS",
      "INCOMPLETE_TRAINING_COVERAGE",
      "INSUFFICIENT_WEEKDAY_HISTORY",
      "INCOMPLETE_BACKTEST_COVERAGE",
      "INSUFFICIENT_BACKTEST",
      "ZERO_BACKTEST_DEMAND",
      "NEGATIVE_DEMAND",
      "CORRECTED_FACTS",
      "UNAVAILABLE_FORECAST_DAYS",
    ]),
    message: z.string().min(1),
  })
  .strict();
export type DayOfWeekForecastWarning = z.infer<
  typeof dayOfWeekForecastWarningSchema
>;

const weekdayEvidenceSchema = z
  .object({
    weekday: forecastWeekdaySchema,
    isoWeekday: z.number().int().min(1).max(7),
  })
  .strict();

export const weekdayModelEvidenceSchema = weekdayEvidenceSchema
  .extend({
    observationCount: z.number().int().nonnegative(),
    weightedMeanQuantity: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export const dayOfWeekForecastDaySchema = weekdayEvidenceSchema
  .extend({
    businessDate: businessDateSchema,
    predictedQuantity: z.number().finite().nonnegative().nullable(),
    observationCount: z.number().int().nonnegative(),
  })
  .strict();

export const dayOfWeekBacktestPointSchema = weekdayEvidenceSchema
  .extend({
    businessDate: businessDateSchema,
    actualQuantity: z.number().finite(),
    predictedQuantity: z.number().finite().nonnegative().nullable(),
    error: z.number().finite().nullable(),
    absoluteError: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export const dayOfWeekBacktestSchema = z
  .object({
    method: z.literal("fixed_holdout"),
    fitFrom: businessDateSchema,
    fitTo: businessDateSchema,
    from: businessDateSchema,
    to: businessDateSchema,
    coverage: dailyCoverageSchema,
    eligibleObservationCount: z.number().int().nonnegative(),
    requiredObservationCount: z.number().int().positive(),
    meanAbsoluteError: z.number().finite().nonnegative().nullable(),
    rootMeanSquaredError: z.number().finite().nonnegative().nullable(),
    meanError: z.number().finite().nullable(),
    weightedAbsolutePercentageError: z.number().finite().nonnegative().nullable(),
    points: z.array(dayOfWeekBacktestPointSchema),
  })
  .strict();

export const dayOfWeekForecastProductSchema = z
  .object({
    productId: z.string().regex(/^[a-f\d]{24}$/i),
    label: z.string().min(1),
    status: z.enum(["forecastable", "partial", "unavailable"]),
    confidence: z.enum(["low", "medium", "high"]),
    trainingCoverage: dailyCoverageSchema,
    trainingObservationCount: z.number().int().nonnegative(),
    correctedFactCount: z.number().int().nonnegative(),
    weekdayModels: z.array(weekdayModelEvidenceSchema).length(7),
    forecastDays: z.array(dayOfWeekForecastDaySchema).min(1).max(28),
    forecastTotalQuantity: z.number().finite().nonnegative().nullable(),
    predictedDayCount: z.number().int().nonnegative(),
    backtest: dayOfWeekBacktestSchema,
    warnings: z.array(dayOfWeekForecastWarningSchema),
  })
  .strict();
export type DayOfWeekForecastProduct = z.infer<
  typeof dayOfWeekForecastProductSchema
>;

export const dayOfWeekForecastConfigSnapshotSchema = z
  .object({
    windowWeeks: z.number().int().min(6).max(52),
    backtestWeeks: z.number().int().min(1).max(12),
    minimumObservationsPerWeekday: z.number().int().min(2).max(20),
    minimumBacktestObservations: z.number().int().min(1).max(84),
    recencyDecay: z.number().finite().gt(0).lte(1),
    highConfidenceMaxWape: z.number().finite().gt(0).max(2),
    mediumConfidenceMaxWape: z.number().finite().gt(0).max(2),
    configurationVersion: z.string().min(1),
  })
  .strict();
export type DayOfWeekForecastConfigSnapshot = z.infer<
  typeof dayOfWeekForecastConfigSnapshotSchema
>;

const dateWindowSchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
  })
  .strict();

export const dayOfWeekForecastAnalysisSchema = z
  .object({
    grain: z.literal("day_of_week_quantity_forecast"),
    asOf: businessDateSchema,
    productId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
    horizonDays: z.number().int().min(1).max(28),
    trainingWindow: dateWindowSchema,
    forecastWindow: dateWindowSchema,
    config: dayOfWeekForecastConfigSnapshotSchema,
    products: z.array(dayOfWeekForecastProductSchema),
    dataRevision: z.number().int().nonnegative(),
    modelVersion: z.literal(dayOfWeekForecastModelVersion),
  })
  .strict();
export type DayOfWeekForecastAnalysis = z.infer<
  typeof dayOfWeekForecastAnalysisSchema
>;

export const dayOfWeekForecastAnalysisResponseSchema =
  dayOfWeekForecastAnalysisSchema.extend({ requestId: z.uuid() });
