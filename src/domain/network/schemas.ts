import * as z from "zod";

import { periodKeySchema } from "@/domain/imports/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

export const networkDashboardQuerySchema = z.object({
  storeIds: z.array(storeIdSchema).min(1).max(50),
  period: periodKeySchema.optional(),
});
export const networkStoreMetricsSchema = z.object({
  storeId: storeIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  dataRevision: z.number().int().nonnegative(),
  dataAvailable: z.boolean(),
  revenueCents: z.number().int().safe().nullable(),
  marginCents: z.number().int().safe().nullable(),
  marginRatio: z.number().finite().nullable(),
  quantity: z.number().finite().nullable(),
  priorYearRevenueCents: z.number().int().safe().nullable(),
  yearOverYearRatio: z.number().finite().nullable(),
  markdownCents: z.number().int().safe().nonnegative().nullable(),
  markdownRate: z.number().finite().nullable(),
  postMarkdownMarginCents: z.number().int().safe().nullable(),
  targetRevenueCents: z.number().int().safe().nonnegative().nullable(),
  targetAttainmentRatio: z.number().finite().nullable(),
  effectiveCommercialWidthM: z.number().finite().positive().nullable(),
  geometryConfirmed: z.boolean(),
  revenuePerEffectiveMeterCents: z.number().int().safe().nullable(),
  postMarkdownMarginPerEffectiveMeterCents: z
    .number()
    .int()
    .safe()
    .nullable(),
  normalizedRank: z.number().int().positive().nullable(),
  prioritizedActionCount: z.number().int().nonnegative(),
});
export const networkWarningSchema = z.object({
  code: z.enum([
    "SINGLE_STORE",
    "NORMALIZATION_COVERAGE_PARTIAL",
    "MARKDOWN_COVERAGE_PARTIAL",
    "TARGET_COVERAGE_PARTIAL",
    "PRIOR_YEAR_COVERAGE_PARTIAL",
  ]),
  message: z.string().min(1),
});

export const networkDashboardSchema = z.object({
  organizationId: z.string().min(1),
  periodKey: periodKeySchema,
  calculationVersion: z.string().min(1),
  storeCount: z.number().int().positive(),
  storesWithData: z.number().int().nonnegative(),
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  marginRatio: z.number().finite().nullable(),
  quantity: z.number().finite(),
  priorYearRevenueCents: z.number().int().safe().nullable(),
  yearOverYearRatio: z.number().finite().nullable(),
  priorYearCoverageStoreCount: z.number().int().nonnegative(),
  markdownCents: z.number().int().safe().nonnegative().nullable(),
  markdownRate: z.number().finite().nullable(),
  markdownCoverageStoreCount: z.number().int().nonnegative(),
  postMarkdownMarginCents: z.number().int().safe().nullable(),
  targetRevenueCents: z.number().int().safe().nonnegative().nullable(),
  targetAttainmentRatio: z.number().finite().nullable(),
  targetCoverageStoreCount: z.number().int().nonnegative(),
  normalization: z.object({
    basis: z.literal("effective_commercial_meter"),
    eligibleStoreCount: z.number().int().nonnegative(),
    rawRevenueFallbackUsed: z.literal(false),
  }),
  stores: z.array(networkStoreMetricsSchema),
  warnings: z.array(networkWarningSchema),
});
export type NetworkDashboard = z.infer<typeof networkDashboardSchema>;

export const networkDashboardResponseSchema = z.object({
  dashboard: networkDashboardSchema.nullable(),
  requestId: z.uuid(),
});
