import * as z from "zod";

import { businessDateSchema, isoWeekKeySchema } from "@/domain/imports/daily-schemas";

export const trueXyzCalculationVersion = "true-xyz-v1";

const optionalQueryValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const trueXyzQuerySchema = z
  .object({
    asOf: optionalQueryValue(businessDateSchema),
    productId: optionalQueryValue(z.string().regex(/^[a-f\d]{24}$/i)),
  })
  .strict();
export type TrueXyzQuery = z.infer<typeof trueXyzQuerySchema>;

export const trueXyzClassSchema = z.enum(["X", "Y", "Z"]);
export type TrueXyzClass = z.infer<typeof trueXyzClassSchema>;

export const trueXyzWarningSchema = z
  .object({
    code: z.enum([
      "NO_DAILY_OBSERVATIONS",
      "INCOMPLETE_WEEKS_EXCLUDED",
      "INSUFFICIENT_COMPLETE_WEEKS",
      "NEGATIVE_WEEKLY_DEMAND",
      "NON_POSITIVE_MEAN_DEMAND",
      "SMALL_MEAN_DEMAND",
      "CORRECTED_FACTS",
    ]),
    message: z.string().min(1),
  })
  .strict();
export type TrueXyzWarning = z.infer<typeof trueXyzWarningSchema>;

export const trueXyzWeekEvidenceSchema = z
  .object({
    isoWeekKey: isoWeekKeySchema,
    startsOn: businessDateSchema,
    endsOn: businessDateSchema,
    observedDates: z.array(businessDateSchema),
    missingDates: z.array(businessDateSchema),
    coverageStatus: z.enum(["complete", "partial", "unknown"]),
    observedQuantity: z.number().finite(),
    correctedFactCount: z.number().int().nonnegative(),
    includedInCalculation: z.boolean(),
  })
  .strict();
export const trueXyzProductResultSchema = z
  .object({
    productId: z.string().regex(/^[a-f\d]{24}$/i),
    label: z.string().min(1),
    status: z.enum(["classified", "unclassified"]),
    xyzClass: trueXyzClassSchema.nullable(),
    meanWeeklyQuantity: z.number().finite().nullable(),
    populationStandardDeviation: z.number().finite().nonnegative().nullable(),
    coefficientOfVariation: z.number().finite().nonnegative().nullable(),
    completeWeekCount: z.number().int().nonnegative(),
    requiredCompleteWeekCount: z.number().int().positive(),
    candidateWeekCount: z.number().int().positive(),
    weeks: z.array(trueXyzWeekEvidenceSchema),
    warnings: z.array(trueXyzWarningSchema),
  })
  .strict();
export type TrueXyzProductResult = z.infer<
  typeof trueXyzProductResultSchema
>;

export const trueXyzConfigSnapshotSchema = z
  .object({
    windowWeeks: z.number().int().min(4).max(52),
    minimumCompleteWeeks: z.number().int().min(2).max(52),
    minimumMeanWeeklyQuantity: z.number().finite().positive(),
    xMaxCoefficientOfVariation: z.number().finite().nonnegative(),
    yMaxCoefficientOfVariation: z.number().finite().positive(),
    configurationVersion: z.string().min(1),
  })
  .strict();
export type TrueXyzConfigSnapshot = z.infer<
  typeof trueXyzConfigSnapshotSchema
>;

export const trueXyzAnalysisSchema = z
  .object({
    grain: z.literal("complete_weekly_unit_demand"),
    asOf: businessDateSchema,
    from: businessDateSchema,
    to: businessDateSchema,
    productId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
    config: trueXyzConfigSnapshotSchema,
    products: z.array(trueXyzProductResultSchema),
    dataRevision: z.number().int().nonnegative(),
    calculationVersion: z.literal(trueXyzCalculationVersion),
  })
  .strict();
export const trueXyzAnalysisResponseSchema = trueXyzAnalysisSchema.extend({
  requestId: z.uuid(),
});
