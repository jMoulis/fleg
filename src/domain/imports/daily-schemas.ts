import * as z from "zod";

import {
  aliasResolutionSchema,
  importTotalsSchema,
  periodKeySchema,
} from "@/domain/imports/schemas";

export const businessDateSchema = z.iso.date();
export const isoWeekKeySchema = z
  .string()
  .regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, "Semaine ISO invalide");

export const dailyMercalysColumnSchema = z.enum([
  "itm8",
  "ean",
  "label",
  "businessDate",
  "quantity",
  "purchase",
  "rce",
  "revenue",
  "vat",
  "margin",
  "marginRatio",
]);
export type DailyMercalysColumn = z.infer<typeof dailyMercalysColumnSchema>;

export const dailyImportWarningSchema = z.object({
  code: z.enum([
    "AGGREGATE_ROW_EXCLUDED",
    "MARGIN_RATIO_MISMATCH",
    "PARTIAL_COVERAGE",
    "SOURCE_STORE_CODE_MISSING",
  ]),
  message: z.string().min(1),
  rowNumber: z.number().int().positive().optional(),
});
export type DailyImportWarning = z.infer<typeof dailyImportWarningSchema>;

export const normalizedDailyMercalysRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  sourceLabel: z.string().min(1),
  externalKey: z.string().min(1),
  aliasKeys: z.array(z.string().min(1)).min(1),
  sourceItm8: z.string().min(1).nullable(),
  sourceEan: z.string().min(1).nullable(),
  businessDate: businessDateSchema,
  periodKey: periodKeySchema,
  isoWeekKey: isoWeekKeySchema,
  quantity: z.number().finite(),
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  purchaseCents: z.number().int().safe().nullable(),
  rceCents: z.number().int().safe().nullable(),
  vatCents: z.number().int().safe().nullable(),
  sourceMarginRatio: z.number().finite().nullable(),
  excluded: z.boolean(),
  exclusionReason: z.string().nullable(),
});
export type NormalizedDailyMercalysRow = z.infer<
  typeof normalizedDailyMercalysRowSchema
>;

export const dailyCoverageSchema = z.object({
  status: z.enum(["complete", "partial", "unknown"]),
  expectedDates: z.array(businessDateSchema),
  observedDates: z.array(businessDateSchema),
  missingDates: z.array(businessDateSchema),
  reasons: z.array(z.string().min(1)),
});
export type DailyCoverage = z.infer<typeof dailyCoverageSchema>;

export const dailyTotalsSchema = importTotalsSchema.extend({
  businessDate: businessDateSchema,
});

export const dailyMercalysPreviewSchema = z.object({
  source: z.literal("mercalys_daily"),
  datasetKind: z.literal("daily_sales"),
  sourceStoreCode: z.string().min(1).nullable(),
  startDate: businessDateSchema,
  endDate: businessDateSchema,
  periodKeys: z.array(periodKeySchema).min(1),
  observedDates: z.array(businessDateSchema).min(1),
  coverage: dailyCoverageSchema,
  coverageKey: z.string().min(1),
  mappedColumns: z.partialRecord(
    dailyMercalysColumnSchema,
    z.string().min(1),
  ),
  rows: z.array(normalizedDailyMercalysRowSchema),
  includedRowCount: z.number().int().nonnegative(),
  excludedRowCount: z.number().int().nonnegative(),
  totals: importTotalsSchema,
  dailyTotals: z.array(dailyTotalsSchema),
  warnings: z.array(dailyImportWarningSchema),
});
export type DailyMercalysPreview = z.infer<
  typeof dailyMercalysPreviewSchema
>;

export const unresolvedDailyAliasSchema = z.object({
  externalKey: z.string().min(1),
  sourceLabel: z.string().min(1),
  aliasKeys: z.array(z.string().min(1)).min(1),
  sourceItm8: z.string().min(1).nullable(),
  sourceEan: z.string().min(1).nullable(),
});
export type UnresolvedDailyAlias = z.infer<typeof unresolvedDailyAliasSchema>;

export const dailyImportPreviewResponseSchema = dailyMercalysPreviewSchema.extend({
  importId: z.string().regex(/^[a-f\d]{24}$/i),
  fingerprint: z.string().regex(/^[a-f\d]{64}$/),
  unresolvedAliases: z.array(unresolvedDailyAliasSchema),
  requestId: z.uuid(),
});

export const dailyImportCommitInputSchema = z.object({
  resolutions: z.array(aliasResolutionSchema),
});

export const dailyImportCommitResultSchema = z.object({
  importId: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.literal("committed"),
  importedFactCount: z.number().int().nonnegative(),
  unchangedFactCount: z.number().int().nonnegative(),
  ignoredRowCount: z.number().int().nonnegative(),
  dataRevision: z.number().int().nonnegative(),
  committedAt: z.iso.datetime(),
});
export type DailyImportCommitResult = z.infer<
  typeof dailyImportCommitResultSchema
>;

export const dailyImportCommitResponseSchema = dailyImportCommitResultSchema.extend({
  requestId: z.uuid(),
});
