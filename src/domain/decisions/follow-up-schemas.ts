import * as z from "zod";

import {
  decisionLogEntrySchema,
  recommendationDecisionRecordSchema,
} from "@/domain/decisions/schemas";
import { periodKeySchema } from "@/domain/imports/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const recommendationFollowUpScheduleInputSchema = z.object({
  idempotencyKey: z.uuid(),
  afterPeriodKey: periodKeySchema,
  dueOn: z.iso.date(),
});
export type RecommendationFollowUpScheduleInput = z.infer<
  typeof recommendationFollowUpScheduleInputSchema
>;

export const recommendationFollowUpCompleteInputSchema = z.object({
  idempotencyKey: z.uuid(),
  basedOnVersion: z.number().int().positive(),
  interpretation: z.string().trim().min(10).max(2_000),
  limitations: z
    .array(z.string().trim().min(3).max(500))
    .max(10)
    .default([]),
});
export type RecommendationFollowUpCompleteInput = z.infer<
  typeof recommendationFollowUpCompleteInputSchema
>;

export const observedPeriodResultSchema = z.object({
  periodKey: periodKeySchema,
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  marginRatio: z.number().finite().nullable(),
  quantity: z.number().finite(),
  source: z.enum(["recommendation_snapshot", "salesFacts"]),
  dataRevision: z.number().int().nonnegative(),
  recordCount: z.number().int().positive(),
});
export type ObservedPeriodResult = z.infer<typeof observedPeriodResultSchema>;

export const observedRecommendationOutcomeSchema = z.object({
  before: observedPeriodResultSchema,
  after: observedPeriodResultSchema,
  revenueDeltaCents: z.number().int().safe(),
  revenueDeltaRatio: z.number().finite().nullable(),
  marginDeltaCents: z.number().int().safe(),
  marginDeltaRatio: z.number().finite().nullable(),
  quantityDelta: z.number().finite(),
  quantityDeltaRatio: z.number().finite().nullable(),
  calculationVersion: z.string().min(1),
  calculatedAt: z.iso.datetime(),
});
export type ObservedRecommendationOutcome = z.infer<
  typeof observedRecommendationOutcomeSchema
>;

const recommendationFollowUpBaseSchema = z.object({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  recommendationDecisionId: mongoIdSchema,
  recommendationId: mongoIdSchema,
  decisionSnapshot: recommendationDecisionRecordSchema,
  beforePeriodKey: periodKeySchema,
  afterPeriodKey: periodKeySchema,
  dueOn: z.iso.date(),
  scheduledBy: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});

const scheduledRecommendationFollowUpSchema =
  recommendationFollowUpBaseSchema.extend({
    status: z.literal("scheduled"),
    observedResult: z.null(),
    interpretation: z.null(),
    limitations: z.array(z.string()).length(0),
    completedBy: z.null(),
    completedAt: z.null(),
  });

const completedRecommendationFollowUpSchema =
  recommendationFollowUpBaseSchema.extend({
    status: z.literal("completed"),
    observedResult: observedRecommendationOutcomeSchema,
    interpretation: z.string().min(10).max(2_000),
    limitations: z.array(z.string().min(3).max(500)).min(1).max(12),
    completedBy: z.string().min(1),
    completedAt: z.iso.datetime(),
  });

export const recommendationFollowUpSchema = z.discriminatedUnion("status", [
  scheduledRecommendationFollowUpSchema,
  completedRecommendationFollowUpSchema,
]);
export type RecommendationFollowUp = z.infer<
  typeof recommendationFollowUpSchema
>;

export const recommendationFollowUpResponseSchema = z.object({
  followUp: recommendationFollowUpSchema,
  requestId: z.uuid(),
});

export const recommendationFollowUpsResponseSchema = z.object({
  followUps: z.array(recommendationFollowUpSchema),
  requestId: z.uuid(),
});

export const decisionWorkspaceResponseSchema = z.object({
  decisions: z.array(decisionLogEntrySchema),
  followUps: z.array(recommendationFollowUpSchema),
  requestId: z.uuid(),
});
