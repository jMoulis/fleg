import * as z from "zod";

import { aiActionPlanSchema } from "@/domain/ai/action-plans";
import {
  recommendationDraftSchema,
  recommendationTypeSchema,
} from "@/domain/recommendations/schemas";
import { experimentAnalysisSchema } from "@/domain/experiments/evaluation-schemas";
import {
  experimentManagerDecisionSchema,
  experimentVerdictSchema,
} from "@/domain/experiments/conclusion";
import { experimentSchema } from "@/domain/experiments/schemas";

export const managerDecisionSchema = z.enum([
  "accepted",
  "modified",
  "rejected",
  "deferred",
]);

export const recommendationDecisionInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    decision: managerDecisionSchema,
    modifiedType: recommendationTypeSchema.optional(),
    rationale: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "modified" && !value.modifiedType) {
      context.addIssue({
        code: "custom",
        path: ["modifiedType"],
        message: "Le type modifié est requis",
      });
    }
  });
export type RecommendationDecisionInput = z.infer<
  typeof recommendationDecisionInputSchema
>;

export const recommendationDecisionRecordSchema = z.object({
  entryType: z.literal("recommendation"),
  id: z.string().regex(/^[a-f\d]{24}$/i),
  recommendationId: z.string().regex(/^[a-f\d]{24}$/i),
  organizationId: z.string().min(1),
  storeId: z.string().regex(/^[a-f\d]{24}$/i),
  actorUserId: z.string().min(1),
  decision: managerDecisionSchema,
  modifiedType: recommendationTypeSchema.nullable(),
  rationale: z.string().nullable(),
  recommendationSnapshot: recommendationDraftSchema.required({ id: true }),
  idempotencyKey: z.uuid(),
  decidedAt: z.iso.datetime(),
});
export type RecommendationDecisionRecord = z.infer<
  typeof recommendationDecisionRecordSchema
>;

export const experimentDecisionRecordSchema = z.object({
  entryType: z.literal("experiment_conclusion"),
  id: z.string().regex(/^[a-f\d]{24}$/i),
  conclusionId: z.string().regex(/^[a-f\d]{24}$/i),
  experimentId: z.string().regex(/^[a-f\d]{24}$/i),
  organizationId: z.string().min(1),
  storeId: z.string().regex(/^[a-f\d]{24}$/i),
  actorUserId: z.string().min(1),
  managerVerdict: experimentVerdictSchema,
  systemSuggestedVerdict: experimentVerdictSchema,
  decision: experimentManagerDecisionSchema,
  rationale: z.string().min(20).max(2_000),
  reusableTags: z.array(z.string().min(2).max(50)).max(12),
  experimentSnapshot: experimentSchema,
  analysisSnapshot: experimentAnalysisSchema,
  idempotencyKey: z.uuid(),
  decidedAt: z.iso.datetime(),
});
export type ExperimentDecisionRecord = z.infer<
  typeof experimentDecisionRecordSchema
>;

export const aiActionPlanDecisionRecordSchema = z.object({
  entryType: z.literal("ai_action_plan"),
  id: z.string().regex(/^[a-f\d]{24}$/i),
  actionPlanId: z.string().regex(/^[a-f\d]{24}$/i),
  organizationId: z.string().min(1),
  storeId: z.string().regex(/^[a-f\d]{24}$/i),
  actorUserId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  rationale: z.string().min(10).max(1_000),
  actionPlanSnapshot: aiActionPlanSchema,
  idempotencyKey: z.uuid(),
  decidedAt: z.iso.datetime(),
});
export const decisionLogEntrySchema = z.discriminatedUnion("entryType", [
  recommendationDecisionRecordSchema,
  experimentDecisionRecordSchema,
  aiActionPlanDecisionRecordSchema,
]);
export type DecisionLogEntry = z.infer<typeof decisionLogEntrySchema>;

export const decisionResponseSchema = z.object({
  decision: recommendationDecisionRecordSchema,
  requestId: z.uuid(),
});
