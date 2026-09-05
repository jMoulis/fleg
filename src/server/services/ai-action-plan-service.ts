import "server-only";

import {
  assertAiActionPlanApprovalAccess,
  buildAiActionPlanGrounding,
  type AiActionPlanDecisionInput,
  type CreateDraftActionPlanInput,
} from "@/domain/ai/action-plans";
import type { StoreAiReadToolResult } from "@/domain/ai/tools";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { AiActionPlanRepository } from "@/server/repositories/ai-action-plan-repository";

export async function createAiActionPlanDraft(input: {
  context: AuthorizedStoreContext;
  draft: CreateDraftActionPlanInput;
  groundingResults: readonly StoreAiReadToolResult[];
  sourceQuestion: string;
  model: string;
  promptVersion: string;
  idempotencyKey: string;
  requestId: string;
}) {
  const grounding = buildAiActionPlanGrounding({
    context: input.context,
    results: input.groundingResults,
  });
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);

  return new AiActionPlanRepository(db, client).createDraft({
    ...input,
    grounding,
  });
}

export async function listAiActionPlans(input: {
  context: AuthorizedStoreContext;
  limit?: number;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new AiActionPlanRepository(db, client).listForStore(
    input.context,
    input.limit,
  );
}

export async function decideAiActionPlan(input: {
  context: AuthorizedStoreContext;
  actionPlanId: string;
  decisionInput: AiActionPlanDecisionInput;
  requestId: string;
}) {
  assertAiActionPlanApprovalAccess(input.context);
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new AiActionPlanRepository(db, client).decide(input);
}
