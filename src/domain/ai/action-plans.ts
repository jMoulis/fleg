import * as z from "zod";

import {
  aiDataSemanticsSchema,
  aiEvidenceRefSchema,
  aiToolLimitationSchema,
  type StoreAiReadToolResult,
} from "@/domain/ai/tools";
import { periodKeySchema } from "@/domain/imports/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import {
  storeIdSchema,
  type AuthorizedStoreContext,
} from "@/domain/stores/schemas";

export const aiActionPlanIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const aiActionPlanKindSchema = z.enum([
  "product_priority",
  "markdown_investigation",
  "space_review",
  "commercial_event",
  "experiment",
  "other",
]);

export const aiActionPlanConfidenceSchema = z.enum(["low", "medium", "high"]);

export const aiActionPlanItemInputSchema = z
  .object({
    kind: aiActionPlanKindSchema,
    title: z.string().trim().min(3).max(160),
    rationale: z.string().trim().min(10).max(800),
    expectedEffect: z.string().trim().min(3).max(500).nullable().default(null),
    confidence: aiActionPlanConfidenceSchema,
  })
  .strict();

export const createDraftActionPlanInputSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    objective: z.string().trim().min(10).max(800),
    periodKey: periodKeySchema.nullable().default(null),
    confidence: aiActionPlanConfidenceSchema,
    actions: z.array(aiActionPlanItemInputSchema).min(1).max(8),
  })
  .strict();
export type CreateDraftActionPlanInput = z.infer<
  typeof createDraftActionPlanInputSchema
>;

export const createDraftActionPlanToolRequestSchema = z
  .object({
    tool: z.literal("createDraftActionPlan"),
    input: createDraftActionPlanInputSchema,
  })
  .strict();

export const aiActionPlanDecisionInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    decision: z.enum(["approved", "rejected"]),
    rationale: z.string().trim().min(10).max(1_000),
  })
  .strict();
export type AiActionPlanDecisionInput = z.infer<
  typeof aiActionPlanDecisionInputSchema
>;

export const aiActionPlanDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    rationale: z.string().min(10).max(1_000),
    actorUserId: z.string().min(1),
    decidedAt: z.iso.datetime(),
  })
  .strict();

export const aiActionPlanSchema = z
  .object({
    id: aiActionPlanIdSchema,
    organizationId: z.string().min(1),
    storeId: storeIdSchema,
    title: z.string().min(3).max(160),
    objective: z.string().min(10).max(800),
    periodKey: periodKeySchema.nullable(),
    confidence: aiActionPlanConfidenceSchema,
    actions: z
      .array(
        aiActionPlanItemInputSchema.extend({ id: z.uuid() }).strict(),
      )
      .min(1)
      .max(8),
    status: z.enum(["draft", "approved", "rejected"]),
    executionStatus: z.literal("not_executed"),
    evidence: z.array(aiEvidenceRefSchema).min(1).max(50),
    semantics: aiDataSemanticsSchema,
    limitations: z.array(aiToolLimitationSchema).max(50),
    sourceQuestion: z.string().min(1).max(4_000),
    model: z.string().min(1).max(100),
    promptVersion: z.string().min(1).max(100),
    createdByUserId: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    decision: aiActionPlanDecisionSchema.nullable(),
  })
  .strict();
export type AiActionPlan = z.infer<typeof aiActionPlanSchema>;

export const createDraftActionPlanResultSchema = z
  .object({
    tool: z.literal("createDraftActionPlan"),
    readOnly: z.literal(false),
    storeIds: z.array(storeIdSchema).length(1),
    evidence: z.array(aiEvidenceRefSchema).min(1),
    semantics: aiDataSemanticsSchema,
    limitations: z.array(aiToolLimitationSchema),
    data: aiActionPlanSchema,
  })
  .strict();
export type CreateDraftActionPlanResult = z.infer<
  typeof createDraftActionPlanResultSchema
>;

export const aiActionPlanDecisionResponseSchema = z
  .object({
    actionPlan: aiActionPlanSchema,
    requestId: z.uuid(),
  })
  .strict();

export const createDraftActionPlanToolDefinition = {
  description:
    "Enregistre uniquement un plan d’action en brouillon à partir des preuves déjà consultées. Ne l’utiliser que si l’utilisateur demande explicitement de préparer ou créer un plan. Le brouillon n’exécute aucune action et exige une décision managériale séparée.",
  inputSchema: createDraftActionPlanInputSchema,
  resultSchema: createDraftActionPlanResultSchema,
} as const;

export interface AiActionPlanGrounding {
  evidence: z.infer<typeof aiEvidenceRefSchema>[];
  semantics: z.infer<typeof aiDataSemanticsSchema>;
  limitations: z.infer<typeof aiToolLimitationSchema>[];
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function buildAiActionPlanGrounding(input: {
  context: AuthorizedStoreContext;
  results: readonly StoreAiReadToolResult[];
}): AiActionPlanGrounding {
  for (const result of input.results) {
    if (
      result.storeIds.length !== 1 ||
      result.storeIds[0] !== input.context.storeId ||
      result.evidence.some(
        (evidence) => evidence.storeId !== input.context.storeId,
      )
    ) {
      throw new StoreAccessDeniedError();
    }
  }

  const evidence = uniqueBy(
    input.results.flatMap((result) => result.evidence),
    (item) => JSON.stringify(item),
  );
  if (evidence.length === 0) {
    throw new Error(
      "Un plan d’action exige au moins une preuve issue des outils autorisés",
    );
  }

  return {
    evidence,
    semantics: {
      observed: uniqueBy(
        input.results.flatMap((result) => result.semantics.observed),
        String,
      ),
      calculated: uniqueBy(
        input.results.flatMap((result) => result.semantics.calculated),
        String,
      ),
      inferred: uniqueBy(
        input.results.flatMap((result) => result.semantics.inferred),
        String,
      ),
    },
    limitations: uniqueBy(
      input.results.flatMap((result) => result.limitations),
      (item) => `${item.code}:${item.message}`,
    ),
  };
}

export function assertAiActionPlanScope(
  context: AuthorizedStoreContext,
  actionPlan: Pick<AiActionPlan, "organizationId" | "storeId">,
): void {
  if (
    actionPlan.organizationId !== context.organizationId ||
    actionPlan.storeId !== context.storeId
  ) {
    throw new StoreAccessDeniedError();
  }
}

export function assertAiActionPlanApprovalAccess(
  context: AuthorizedStoreContext,
): void {
  if (!context.permissions.includes("recommendations.approve")) {
    throw new StoreAccessDeniedError();
  }
}
