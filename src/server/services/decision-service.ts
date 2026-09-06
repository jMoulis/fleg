import "server-only";

import type { RecommendationDecisionInput } from "@/domain/decisions/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { DecisionRepository } from "@/server/repositories/decision-repository";
import { RecommendationFollowUpRepository } from "@/server/repositories/recommendation-follow-up-repository";

export async function recordRecommendationDecision(input: {
  context: AuthorizedStoreContext;
  recommendationId: string;
  decisionInput: RecommendationDecisionInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new DecisionRepository(db, client).recordRecommendationDecision(input);
}

export async function getDecisionWorkspace(input: {
  context: AuthorizedStoreContext;
  requestHeaders: Headers;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const [decisions, followUps] = await Promise.all([
    new DecisionRepository(db, client).listForStore(input.context),
    new RecommendationFollowUpRepository(db).listForStore(input.context),
  ]);
  const controlStoreIds = [
    ...new Set(
      decisions.flatMap((decision) =>
        decision.entryType === "experiment_conclusion"
          ? [
              ...decision.experimentSnapshot.baselineConfig.controlStoreIds,
              ...decision.analysisSnapshot.controlDataRevisions.map(
                ({ storeId }) => storeId,
              ),
            ]
          : [],
      ),
    ),
  ];
  await requireExperimentControlContexts({
    primaryContext: input.context,
    controlStoreIds,
    requestHeaders: input.requestHeaders,
  });

  return { decisions, followUps };
}

export async function listDecisionLog(input: {
  context: AuthorizedStoreContext;
  requestHeaders: Headers;
}) {
  return (await getDecisionWorkspace(input)).decisions;
}
