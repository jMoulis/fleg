import * as z from "zod";

import { periodKeySchema } from "@/domain/imports/schemas";

export const analyticsConfigSchema = z.object({
  calculationVersion: z.string().min(1),
  abcAThreshold: z.number().gt(0).lt(1),
  abcBThreshold: z.number().gt(0).lte(1),
  minimumSeasonalityBaseRevenueCents: z.number().int().nonnegative(),
  retainedSeasonalityFloor: z.number().positive(),
  retainedSeasonalityCeiling: z.number().positive(),
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
