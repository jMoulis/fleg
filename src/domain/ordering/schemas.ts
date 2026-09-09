import * as z from "zod";

import { confidenceSchema } from "@/domain/analytics/schemas";
import { dayOfWeekForecastWarningSchema } from "@/domain/forecasting/day-of-week-forecast-schemas";
import { businessDateSchema } from "@/domain/imports/daily-schemas";
import {
  inventoryFamilyCodeSchema,
  stockUnitSchema,
} from "@/domain/inventory/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const quantitySchema = z.number().finite().min(-1_000_000).max(1_000_000);
const nonnegativeQuantitySchema = quantitySchema.nonnegative();

export const orderSuggestionModelVersion = "order-suggestion-v1";
export const orderScheduleVersion = "daily-a-for-b-no-sunday-v1";
export const orderSuggestionIdSchema = mongoIdSchema;

export const localCutoffTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const orderSuggestionConfigSchema = z
  .object({
    targetClosingStockRatio: z.number().finite().min(0).max(1),
    cutoffLocalTime: localCutoffTimeSchema,
    modelVersion: z.string().min(1),
    scheduleVersion: z.literal(orderScheduleVersion),
    configurationVersion: z.string().min(1),
  })
  .strict();
export type OrderSuggestionConfig = z.infer<
  typeof orderSuggestionConfigSchema
>;

export const defaultOrderSuggestionConfig = orderSuggestionConfigSchema.parse({
  targetClosingStockRatio: 0,
  cutoffLocalTime: "09:30",
  modelVersion: orderSuggestionModelVersion,
  scheduleVersion: orderScheduleVersion,
  configurationVersion: orderSuggestionModelVersion,
});

export const orderWeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export type OrderWeekday = z.infer<typeof orderWeekdaySchema>;

export const orderCycleSchema = z
  .object({
    orderDate: businessDateSchema,
    orderWeekday: orderWeekdaySchema,
    orderingAllowed: z.boolean(),
    deliveryDate: businessDateSchema.nullable(),
    coverageDates: z.array(businessDateSchema).max(2),
    scheduleVersion: z.literal(orderScheduleVersion),
    explanation: z.string().min(1),
  })
  .strict();
export type OrderCycle = z.infer<typeof orderCycleSchema>;

export const orderSuggestionWarningCodeSchema = z.enum([
  "MISSING_EXACT_STOCK",
  "NEGATIVE_ON_HAND",
  "FORECAST_UNAVAILABLE",
  "LOW_FORECAST_CONFIDENCE",
  "PACK_ROUNDING_SURPLUS",
]);

export const orderSuggestionWarningSchema = z
  .object({
    code: orderSuggestionWarningCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export const orderSuggestionForecastDaySchema = z
  .object({
    businessDate: businessDateSchema,
    predictedQuantity: nonnegativeQuantitySchema.nullable(),
  })
  .strict();

export const orderSuggestionLineSchema = z
  .object({
    productId: mongoIdSchema,
    productLabel: z.string().min(1),
    status: z.enum(["ready", "no_order", "unavailable"]),
    familyCode: inventoryFamilyCodeSchema.nullable(),
    stockUnit: stockUnitSchema.nullable(),
    packSize: z.number().finite().positive().nullable(),
    stockSnapshotId: mongoIdSchema.nullable(),
    stockBusinessDate: businessDateSchema.nullable(),
    stockObservedAt: z.iso.datetime().nullable(),
    morningOnHandQuantity: quantitySchema.nullable(),
    forecastConfidence: confidenceSchema.nullable(),
    forecastDays: z.array(orderSuggestionForecastDaySchema).min(1).max(2),
    coveredDemandQuantity: nonnegativeQuantitySchema.nullable(),
    targetClosingStockQuantity: nonnegativeQuantitySchema.nullable(),
    netNeedQuantity: nonnegativeQuantitySchema.nullable(),
    suggestedCaseCount: z.number().int().nonnegative().nullable(),
    suggestedOrderQuantity: nonnegativeQuantitySchema.nullable(),
    projectedClosingStockQuantity: quantitySchema.nullable(),
    forecastWarnings: z.array(dayOfWeekForecastWarningSchema),
    warnings: z.array(orderSuggestionWarningSchema),
  })
  .strict();
export type OrderSuggestionLine = z.infer<typeof orderSuggestionLineSchema>;

export const orderSuggestionDecisionLineSchema = z
  .object({
    productId: mongoIdSchema,
    suggestedCaseCount: z.number().int().nonnegative(),
    approvedCaseCount: z.number().int().nonnegative(),
    approvedOrderQuantity: nonnegativeQuantitySchema,
    overrideReason: z.string().trim().min(3).max(500).nullable(),
  })
  .strict();
export type OrderSuggestionDecisionLine = z.infer<
  typeof orderSuggestionDecisionLineSchema
>;

export const orderSuggestionDecisionSchema = z
  .object({
    approvedBy: z.string().min(1),
    approvedAt: z.iso.datetime(),
    note: z.string().trim().max(1_000).nullable(),
    lines: z.array(orderSuggestionDecisionLineSchema),
  })
  .strict();

export const orderSuggestionStatusSchema = z.enum(["draft", "approved"]);

export const orderSuggestionDraftSchema = z
  .object({
    id: mongoIdSchema,
    organizationId: z.string().min(1),
    storeId: storeIdSchema,
    orderDate: businessDateSchema,
    deliveryDate: businessDateSchema,
    coverageDates: z.array(businessDateSchema).min(1).max(2),
    status: orderSuggestionStatusSchema,
    lines: z.array(orderSuggestionLineSchema).max(2_000),
    readyLineCount: z.number().int().nonnegative(),
    noOrderLineCount: z.number().int().nonnegative(),
    unavailableLineCount: z.number().int().nonnegative(),
    inputRevision: z.number().int().nonnegative(),
    forecastAsOf: businessDateSchema,
    forecastModelVersion: z.string().min(1),
    forecastConfigurationVersion: z.string().min(1),
    config: orderSuggestionConfigSchema,
    assumptions: z.array(z.string().min(1)).min(1),
    limitations: z.array(z.string().min(1)).min(1),
    generatedBy: z.string().min(1),
    generatedAt: z.iso.datetime(),
    decision: orderSuggestionDecisionSchema.nullable(),
  })
  .strict();
export type OrderSuggestionDraft = z.infer<
  typeof orderSuggestionDraftSchema
>;

export const orderSuggestionWorkspaceQuerySchema = z
  .object({ orderDate: businessDateSchema })
  .strict();

export const orderSuggestionCreateInputSchema = z
  .object({
    orderDate: businessDateSchema,
    idempotencyKey: z.uuid(),
  })
  .strict();
export type OrderSuggestionCreateInput = z.infer<
  typeof orderSuggestionCreateInputSchema
>;

export const orderSuggestionApprovalInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnGeneratedAt: z.iso.datetime(),
    note: z.string().trim().max(1_000).nullable(),
    lines: z
      .array(
        z
          .object({
            productId: mongoIdSchema,
            approvedCaseCount: z.number().int().nonnegative().max(100_000),
            overrideReason: z.string().trim().min(3).max(500).nullable(),
          })
          .strict(),
      )
      .max(2_000),
  })
  .strict();
export type OrderSuggestionApprovalInput = z.infer<
  typeof orderSuggestionApprovalInputSchema
>;

export const orderSuggestionWorkspaceSchema = z
  .object({
    cycle: orderCycleSchema,
    latestSuggestion: orderSuggestionDraftSchema.nullable(),
    exactStockSnapshotCount: z.number().int().nonnegative(),
    productCount: z.number().int().nonnegative(),
  })
  .strict();
export type OrderSuggestionWorkspace = z.infer<
  typeof orderSuggestionWorkspaceSchema
>;

export const orderSuggestionWorkspaceResponseSchema =
  orderSuggestionWorkspaceSchema.extend({ requestId: z.uuid() });

export const orderSuggestionResponseSchema = z.object({
  suggestion: orderSuggestionDraftSchema,
  requestId: z.uuid(),
});
