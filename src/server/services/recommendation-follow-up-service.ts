import "server-only";

import type {
  RecommendationFollowUpCompleteInput,
  RecommendationFollowUpScheduleInput,
} from "@/domain/decisions/follow-up-schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { RecommendationFollowUpRepository } from "@/server/repositories/recommendation-follow-up-repository";

export async function listRecommendationFollowUps(
  context: AuthorizedStoreContext,
) {
  return new RecommendationFollowUpRepository(
    await getAppDb(),
  ).listForStore(context);
}

export async function scheduleRecommendationFollowUp(input: {
  context: AuthorizedStoreContext;
  decisionId: string;
  scheduleInput: RecommendationFollowUpScheduleInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new RecommendationFollowUpRepository(db, client).schedule(input);
}

export async function completeRecommendationFollowUp(input: {
  context: AuthorizedStoreContext;
  decisionId: string;
  followUpId: string;
  completeInput: RecommendationFollowUpCompleteInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new RecommendationFollowUpRepository(db, client).complete(input);
}
