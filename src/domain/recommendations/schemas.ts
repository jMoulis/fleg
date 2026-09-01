import * as z from "zod";

import { confidenceSchema, productMetricSchema } from "@/domain/analytics/schemas";
import { periodKeySchema } from "@/domain/imports/schemas";

export const recommendationTypeSchema = z.enum([
  "PUSH",
  "REDUCE",
  "HOLD",
  "MARGIN_WATCH",
  "TRAFFIC_PROTECT",
]);
export type RecommendationType = z.infer<typeof recommendationTypeSchema>;

export const recommendationConfigSchema = z.object({
  modelVersion: z.string().min(1),
  minimumActionRevenueCents: z.number().int().nonnegative(),
  marginWatchRatio: z.number().min(0).max(1),
  pushForecastGrowthRatio: z.number().positive(),
  reduceForecastDeclineRatio: z.number().negative(),
});
export type RecommendationConfig = z.infer<typeof recommendationConfigSchema>;

export const defaultRecommendationConfig: RecommendationConfig =
  recommendationConfigSchema.parse({
    modelVersion: "recommendation-rules-v1",
    minimumActionRevenueCents: 10_000,
    marginWatchRatio: 0.22,
    pushForecastGrowthRatio: 0.08,
    reduceForecastDeclineRatio: -0.08,
  });

export const recommendationEvidenceSchema = z.object({
  signal: z.enum([
    "economic_weight",
    "margin_quality",
    "seasonal_momentum",
    "year_over_year",
    "history_quality",
  ]),
  label: z.string().min(1),
  value: z.number().finite().nullable(),
  interpretation: z.string().min(1),
});

export const recommendationDraftSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  organizationId: z.string().min(1),
  storeId: z.string().regex(/^[a-f\d]{24}$/i),
  periodKey: periodKeySchema,
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  productLabel: z.string().min(1),
  type: recommendationTypeSchema,
  status: z.literal("draft"),
  confidence: confidenceSchema,
  expectedRevenueEffectCents: z.number().int().safe().nullable(),
  evidence: z.array(recommendationEvidenceSchema).min(1),
  inputs: productMetricSchema,
  modelVersion: z.string().min(1),
  calculationVersion: z.string().min(1),
  inputRevision: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
});
export type RecommendationDraft = z.infer<typeof recommendationDraftSchema>;

export const recommendationsResponseSchema = z.object({
  periodKey: periodKeySchema,
  recommendations: z.array(recommendationDraftSchema.required({ id: true })),
  requestId: z.uuid(),
});
