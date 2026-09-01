import "server-only";

import { buildRecommendation } from "@/domain/recommendations/engine";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { RecommendationRepository } from "@/server/repositories/recommendation-repository";
import { getProductMetrics } from "@/server/services/analytics-service";

export async function getRecommendations(
  context: AuthorizedStoreContext,
  periodKey: string,
) {
  const db = await getAppDb();
  const repository = new RecommendationRepository(db);
  const [metrics, config] = await Promise.all([
    getProductMetrics(context, periodKey),
    repository.getConfig(context),
  ]);
  const generatedAt = new Date().toISOString();
  const drafts = metrics.products.map((metric) =>
    buildRecommendation({
      organizationId: context.organizationId,
      storeId: context.storeId,
      metric,
      config,
      calculationVersion: metrics.calculationVersion,
      inputRevision: metrics.dataRevision,
      generatedAt,
    }),
  );

  return repository.saveRun({
    context,
    periodKey: metrics.periodKey,
    inputRevision: metrics.dataRevision,
    calculationVersion: metrics.calculationVersion,
    modelVersion: config.modelVersion,
    generatedAt,
    drafts,
  });
}
