import type { ClientSession, Db } from "mongodb";
import { ObjectId } from "mongodb";
import * as z from "zod";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export const recommendationRetentionSchema = z.object({
  RECOMMENDATION_CACHE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  RECOMMENDATION_SUPERSEDED_GRACE_HOURS: z.coerce.number().int().min(1).max(168).default(24),
});

export function recommendationExpiry(now: Date, env: Record<string, string | undefined> = process.env) {
  const policy = recommendationRetentionSchema.parse(env);
  return {
    current: new Date(now.getTime() + policy.RECOMMENDATION_CACHE_DAYS * 86_400_000),
    superseded: new Date(now.getTime() + policy.RECOMMENDATION_SUPERSEDED_GRACE_HOURS * 3_600_000),
  };
}

// This write must be in the transaction that creates the business reference:
// it conflicts with a simultaneous TTL deletion instead of leaving a dangling link.
export async function retainRecommendationEvidence(input: {
  db: Db;
  context: AuthorizedStoreContext;
  recommendationId: ObjectId;
  session: ClientSession;
}) {
  const result = await input.db.collection("recommendations").updateOne({
    _id: input.recommendationId,
    organizationId: input.context.organizationId,
    storeId: new ObjectId(input.context.storeId),
  }, {
    $set: { retention: "evidence", retainedAt: new Date() },
    $unset: { expiresAt: "" },
  }, { session: input.session });
  if (result.matchedCount !== 1) throw new Error("La recommandation a expiré ; rechargez la page");
}
