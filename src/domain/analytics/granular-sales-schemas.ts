import * as z from "zod";

import {
  businessDateRangeLength,
} from "@/domain/imports/daily-dates";
import {
  businessDateSchema,
  dailyCoverageSchema,
  isoWeekKeySchema,
} from "@/domain/imports/daily-schemas";
import { periodKeySchema } from "@/domain/imports/schemas";

export const granularSalesCalculationVersion = "granular-sales-v1";
export const defaultGranularSalesRangeDays = 28;
export const maximumGranularSalesRangeDays = 366;

const optionalQueryValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const granularSalesRangeQuerySchema = z
  .object({
    from: optionalQueryValue(businessDateSchema),
    to: optionalQueryValue(businessDateSchema),
    productId: optionalQueryValue(z.string().regex(/^[a-f\d]{24}$/i)),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.from === undefined) !== (query.to === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Les dates de début et de fin doivent être fournies ensemble",
      });
      return;
    }

    if (query.from && query.to) {
      try {
        const length = businessDateRangeLength(query.from, query.to);
        if (length > maximumGranularSalesRangeDays) {
          context.addIssue({
            code: "custom",
            message: `La plage ne peut pas dépasser ${maximumGranularSalesRangeDays} jours`,
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "La date de début doit précéder la date de fin",
        });
      }
    }
  });
export type GranularSalesRangeQuery = z.infer<
  typeof granularSalesRangeQuerySchema
>;

export const granularSalesReconciliationQuerySchema = z
  .object({
    period: periodKeySchema,
    productId: optionalQueryValue(z.string().regex(/^[a-f\d]{24}$/i)),
  })
  .strict();

export const granularSalesTotalsSchema = z
  .object({
    quantity: z.number().finite(),
    revenueCents: z.number().int().safe(),
    marginCents: z.number().int().safe(),
  })
  .strict();
export type GranularSalesTotals = z.infer<typeof granularSalesTotalsSchema>;

export const granularSalesWarningSchema = z
  .object({
    code: z.enum([
      "PARTIAL_COVERAGE",
      "NO_DAILY_OBSERVATIONS",
      "CORRECTED_FACTS",
      "NON_POSITIVE_NET_DEMAND",
      "MONTHLY_OBSERVATION_MISSING",
      "RATIO_UNAVAILABLE_ZERO_BASE",
    ]),
    message: z.string().min(1),
  })
  .strict();
export type GranularSalesWarning = z.infer<
  typeof granularSalesWarningSchema
>;

export const dailySalesPointSchema = z
  .object({
    businessDate: businessDateSchema,
    totals: granularSalesTotalsSchema,
    productCount: z.number().int().nonnegative(),
    correctedFactCount: z.number().int().nonnegative(),
    warnings: z.array(granularSalesWarningSchema),
  })
  .strict();

export const dailySalesReadResponseSchema = z
  .object({
    grain: z.literal("daily"),
    from: businessDateSchema,
    to: businessDateSchema,
    productId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
    totals: granularSalesTotalsSchema,
    coverage: dailyCoverageSchema,
    days: z.array(dailySalesPointSchema),
    warnings: z.array(granularSalesWarningSchema),
    dataRevision: z.number().int().nonnegative(),
    calculationVersion: z.literal(granularSalesCalculationVersion),
    requestId: z.uuid(),
  })
  .strict();
export type DailySalesReadResponse = z.infer<
  typeof dailySalesReadResponseSchema
>;

export const weeklySalesPointSchema = z
  .object({
    isoWeekKey: isoWeekKeySchema,
    startsOn: businessDateSchema,
    endsOn: businessDateSchema,
    totals: granularSalesTotalsSchema,
    coverage: dailyCoverageSchema,
    productCount: z.number().int().nonnegative(),
    correctedFactCount: z.number().int().nonnegative(),
    warnings: z.array(granularSalesWarningSchema),
  })
  .strict();

export const weeklySalesReadResponseSchema = z
  .object({
    grain: z.literal("weekly"),
    from: businessDateSchema,
    to: businessDateSchema,
    productId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
    totals: granularSalesTotalsSchema,
    weeks: z.array(weeklySalesPointSchema),
    warnings: z.array(granularSalesWarningSchema),
    dataRevision: z.number().int().nonnegative(),
    calculationVersion: z.literal(granularSalesCalculationVersion),
    requestId: z.uuid(),
  })
  .strict();
export type WeeklySalesReadResponse = z.infer<
  typeof weeklySalesReadResponseSchema
>;

export const reconciliationDeltasSchema = z
  .object({
    quantity: z.number().finite(),
    quantityRatio: z.number().finite().nullable(),
    revenueCents: z.number().int().safe(),
    revenueRatio: z.number().finite().nullable(),
    marginCents: z.number().int().safe(),
    marginRatio: z.number().finite().nullable(),
  })
  .strict();

export const monthlySalesReconciliationResponseSchema = z
  .object({
    grain: z.literal("monthly_reconciliation"),
    periodKey: periodKeySchema,
    startsOn: businessDateSchema,
    endsOn: businessDateSchema,
    productId: z.string().regex(/^[a-f\d]{24}$/i).nullable(),
    status: z.enum([
      "matched",
      "mismatch",
      "incomplete_daily",
      "daily_missing",
      "monthly_missing",
    ]),
    daily: z
      .object({
        totals: granularSalesTotalsSchema,
        coverage: dailyCoverageSchema,
        productCount: z.number().int().nonnegative(),
      })
      .strict(),
    monthly: z
      .object({
        totals: granularSalesTotalsSchema,
        productCount: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    deltas: reconciliationDeltasSchema.nullable(),
    warnings: z.array(granularSalesWarningSchema),
    dataRevision: z.number().int().nonnegative(),
    calculationVersion: z.literal(granularSalesCalculationVersion),
    requestId: z.uuid(),
  })
  .strict();
export type MonthlySalesReconciliationResponse = z.infer<
  typeof monthlySalesReconciliationResponseSchema
>;
