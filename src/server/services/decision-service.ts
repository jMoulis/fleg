import "server-only";

import type { RecommendationDecisionInput } from "@/domain/decisions/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { DecisionRepository } from "@/server/repositories/decision-repository";

export async function recordRecommendationDecision(input: {
  context: AuthorizedStoreContext;
  recommendationId: string;
  decisionInput: RecommendationDecisionInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new DecisionRepository(db, client).recordRecommendationDecision(input);
}

export async function listDecisionLog(context: AuthorizedStoreContext) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new DecisionRepository(db, client).listForStore(context);
}
