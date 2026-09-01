import * as z from "zod";

import {
  recommendationDraftSchema,
  recommendationTypeSchema,
} from "@/domain/recommendations/schemas";

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

export const decisionRecordSchema = z.object({
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
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;

export const decisionResponseSchema = z.object({
  decision: decisionRecordSchema,
  requestId: z.uuid(),
});

export const decisionLogResponseSchema = z.object({
  decisions: z.array(decisionRecordSchema),
  requestId: z.uuid(),
});
