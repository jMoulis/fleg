import * as z from "zod";

import { periodKeySchema } from "@/domain/imports/schemas";

export const analyticsConfigSchema = z.object({
  calculationVersion: z.string().min(1),
  abcAThreshold: z.number().gt(0).lt(1),
  abcBThreshold: z.number().gt(0).lte(1),
  minimumSeasonalityBaseRevenueCents: z.number().int().nonnegative(),
  retainedSeasonalityFloor: z.number().positive(),
  retainedSeasonalityCeiling: z.number().positive(),
  xyzWindowWeeks: z.number().int().min(4).max(52),
  xyzMinimumCompleteWeeks: z.number().int().min(2).max(52),
  xyzMinimumMeanWeeklyQuantity: z.number().finite().positive().max(1_000_000),
  xyzXMaxCoefficientOfVariation: z.number().finite().nonnegative().max(5),
  xyzYMaxCoefficientOfVariation: z.number().finite().positive().max(5),
  dayOfWeekForecastWindowWeeks: z.number().int().min(6).max(52),
  dayOfWeekForecastBacktestWeeks: z.number().int().min(1).max(12),
  dayOfWeekForecastMinimumObservationsPerWeekday: z.number().int().min(2).max(20),
  dayOfWeekForecastMinimumBacktestObservations: z.number().int().min(1).max(84),
  dayOfWeekForecastRecencyDecay: z.number().finite().gt(0).lte(1),
  dayOfWeekForecastHighConfidenceMaxWape: z.number().finite().gt(0).max(2),
  dayOfWeekForecastMediumConfidenceMaxWape: z.number().finite().gt(0).max(2),
});
export type AnalyticsConfig = z.infer<typeof analyticsConfigSchema>;

export const defaultAnalyticsConfig: AnalyticsConfig =
  analyticsConfigSchema.parse({
    calculationVersion: "analytics-v1",
    abcAThreshold: 0.8,
    abcBThreshold: 0.95,
    minimumSeasonalityBaseRevenueCents: 10_000,
    retainedSeasonalityFloor: 0.5,
    retainedSeasonalityCeiling: 1.8,
    xyzWindowWeeks: 13,
    xyzMinimumCompleteWeeks: 8,
    xyzMinimumMeanWeeklyQuantity: 1,
    xyzXMaxCoefficientOfVariation: 0.5,
    xyzYMaxCoefficientOfVariation: 1,
    dayOfWeekForecastWindowWeeks: 12,
    dayOfWeekForecastBacktestWeeks: 2,
    dayOfWeekForecastMinimumObservationsPerWeekday: 4,
    dayOfWeekForecastMinimumBacktestObservations: 7,
    dayOfWeekForecastRecencyDecay: 0.9,
    dayOfWeekForecastHighConfidenceMaxWape: 0.2,
    dayOfWeekForecastMediumConfidenceMaxWape: 0.4,
  });

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export const abcClassSchema = z.enum(["A", "B", "C"]);

export const dashboardMetricsSchema = z.object({
  periodKey: periodKeySchema,
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  marginRatio: z.number().finite().nullable(),
  quantity: z.number().finite(),
  productCount: z.number().int().nonnegative(),
  priorYearRevenueCents: z.number().int().safe().nullable(),
  yearOverYearRatio: z.number().finite().nullable(),
  targetRevenueCents: z.number().int().safe().nonnegative().nullable(),
  targetAttainmentRatio: z.number().finite().nonnegative().nullable(),
  dataRevision: z.number().int().nonnegative(),
  calculationVersion: z.string().min(1),
});
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

export const productMetricSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  label: z.string().min(1),
  periodKey: periodKeySchema,
  quantity: z.number().finite(),
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  marginRatio: z.number().finite().nullable(),
  priorYearRevenueCents: z.number().int().safe().nullable(),
  yearOverYearRatio: z.number().finite().nullable(),
  rawSeasonalityIndex: z.number().finite().nullable(),
  retainedSeasonalityIndex: z.number().finite(),
  forecastRevenueCents: z.number().int().safe().nullable(),
  abcClass: abcClassSchema,
  cumulativeRevenueShare: z.number().min(0).max(1),
  confidence: confidenceSchema,
  evidence: z.array(z.string().min(1)),
});
export type ProductMetric = z.infer<typeof productMetricSchema>;

export const dashboardResponseSchema = z.object({
  dashboard: dashboardMetricsSchema.nullable(),
  requestId: z.uuid(),
});

export const productMetricsResponseSchema = z.object({
  periodKey: periodKeySchema,
  products: z.array(productMetricSchema),
  calculationVersion: z.string().min(1),
  dataRevision: z.number().int().nonnegative(),
  requestId: z.uuid(),
});

export const periodQuerySchema = z.object({
  period: periodKeySchema,
});
