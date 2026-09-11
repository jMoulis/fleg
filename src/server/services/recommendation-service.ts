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
  const cached = await repository.findRun({
    context,
    periodKey: metrics.periodKey,
    inputRevision: metrics.dataRevision,
    calculationVersion: metrics.calculationVersion,
    modelVersion: config.modelVersion,
  });
  if (cached) return cached;
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

export async function previewRecommendation(input: {
  context: AuthorizedStoreContext;
  periodKey: string;
  productId: string;
}) {
  const db = await getAppDb();
  const repository = new RecommendationRepository(db);
  const [metrics, config] = await Promise.all([
    getProductMetrics(input.context, input.periodKey),
    repository.getConfig(input.context),
  ]);
  const metric = metrics.products.find(
    ({ productId }) => productId === input.productId,
  );
  if (!metric) return null;

  return buildRecommendation({
    organizationId: input.context.organizationId,
    storeId: input.context.storeId,
    metric,
    config,
    calculationVersion: metrics.calculationVersion,
    inputRevision: metrics.dataRevision,
    generatedAt: new Date().toISOString(),
  });
}
