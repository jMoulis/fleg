import * as z from "zod";

export const periodKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Période attendue au format YYYY-MM");

export const mercalysColumnSchema = z.enum([
  "label",
  "period",
  "quantity",
  "revenue",
  "margin",
  "marginRatio",
]);
export type MercalysColumn = z.infer<typeof mercalysColumnSchema>;

export const unlabeledMercalysRowLabel = "Ligne sans libellé";

export const importWarningSchema = z.object({
  code: z.enum([
    "AGGREGATE_ROW_EXCLUDED",
    "MARGIN_RATIO_MISMATCH",
    "MULTIPLE_PERIODS",
    "EMPTY_ROW_SKIPPED",
  ]),
  message: z.string().min(1),
  rowNumber: z.number().int().positive().optional(),
});
export type ImportWarning = z.infer<typeof importWarningSchema>;

export const normalizedMercalysRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  sourceLabel: z.string().min(1),
  externalKey: z.string().min(1),
  periodKey: periodKeySchema,
  quantity: z.number().finite(),
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  sourceMarginRatio: z.number().finite().nullable(),
  excluded: z.boolean(),
  exclusionReason: z.string().nullable(),
});
export type NormalizedMercalysRow = z.infer<
  typeof normalizedMercalysRowSchema
>;

export const importTotalsSchema = z.object({
  quantity: z.number().finite(),
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
});

export const mercalysPreviewSchema = z.object({
  source: z.literal("mercalys"),
  periodKey: periodKeySchema,
  mappedColumns: z.partialRecord(mercalysColumnSchema, z.string().min(1)),
  rows: z.array(normalizedMercalysRowSchema),
  includedRowCount: z.number().int().nonnegative(),
  excludedRowCount: z.number().int().nonnegative(),
  totals: importTotalsSchema,
  warnings: z.array(importWarningSchema),
});
export type MercalysPreview = z.infer<typeof mercalysPreviewSchema>;

export const importPreviewResponseSchema = mercalysPreviewSchema.extend({
  importId: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f\d]{64}$/),
  unresolvedAliases: z.array(
    z.object({
      externalKey: z.string().min(1),
      sourceLabel: z.string().min(1),
    }),
  ),
  requestId: z.uuid(),
});

export const importUploadSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, "Fichier requis"),
});

export const aliasResolutionSchema = z.discriminatedUnion("action", [
  z.object({
    externalKey: z.string().min(1),
    action: z.literal("create"),
    canonicalLabel: z.string().trim().min(1).max(160),
  }),
  z.object({
    externalKey: z.string().min(1),
    action: z.literal("merge"),
    productId: z.string().regex(/^[a-f\d]{24}$/i),
  }),
  z.object({
    externalKey: z.string().min(1),
    action: z.literal("ignore"),
  }),
]);
export type AliasResolution = z.infer<typeof aliasResolutionSchema>;

export const importCommitInputSchema = z.object({
  resolutions: z.array(aliasResolutionSchema),
});

export const importCommitResultSchema = z.object({
  importId: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.literal("committed"),
  importedFactCount: z.number().int().nonnegative(),
  ignoredRowCount: z.number().int().nonnegative(),
  dataRevision: z.number().int().nonnegative(),
  committedAt: z.iso.datetime(),
});
export type ImportCommitResult = z.infer<typeof importCommitResultSchema>;

export const importCommitResponseSchema = importCommitResultSchema.extend({
  requestId: z.uuid(),
});
