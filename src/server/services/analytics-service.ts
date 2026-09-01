import "server-only";

import {
  calculateDashboard,
  calculateProductMetrics,
  shiftMonth,
} from "@/domain/analytics/calculations";
import { periodKeySchema } from "@/domain/imports/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { AnalyticsRepository } from "@/server/repositories/analytics-repository";

async function resolvePeriod(
  repository: AnalyticsRepository,
  context: AuthorizedStoreContext,
  requestedPeriod?: string,
) {
  if (requestedPeriod) {
    return periodKeySchema.parse(requestedPeriod);
  }

  return repository.findLatestPeriod(context);
}

export async function getDashboardMetrics(
  context: AuthorizedStoreContext,
  requestedPeriod?: string,
) {
  const repository = new AnalyticsRepository(await getAppDb());
  const periodKey = await resolvePeriod(repository, context, requestedPeriod);

  if (!periodKey) {
    return null;
  }

  const [facts, dataRevision, config] = await Promise.all([
    repository.findFacts(context, [periodKey, shiftMonth(periodKey, -12)]),
    repository.getDataRevision(context),
    repository.getConfig(context),
  ]);

  return calculateDashboard({
    periodKey,
    facts: facts.filter((fact) => fact.periodKey === periodKey),
    priorYearFacts: facts.filter(
      (fact) => fact.periodKey === shiftMonth(periodKey, -12),
    ),
    dataRevision,
    config,
  });
}

export async function getProductMetrics(
  context: AuthorizedStoreContext,
  requestedPeriod: string,
) {
  const repository = new AnalyticsRepository(await getAppDb());
  const periodKey = periodKeySchema.parse(requestedPeriod);
  const [config, dataRevision] = await Promise.all([
    repository.getConfig(context),
    repository.getDataRevision(context),
  ]);
  const periodKeys = [
    periodKey,
    shiftMonth(periodKey, -1),
    shiftMonth(periodKey, -12),
    shiftMonth(periodKey, -13),
  ];
  const facts = await repository.findFacts(context, periodKeys);
  const productIds = [
    ...new Set(
      facts
        .filter((fact) => fact.periodKey === periodKey)
        .map((fact) => fact.productId),
    ),
  ];
  const labelsByProductId = await repository.findProductLabels(
    context,
    productIds,
  );

  return {
    periodKey,
    calculationVersion: config.calculationVersion,
    dataRevision,
    products: calculateProductMetrics({
      periodKey,
      facts,
      labelsByProductId,
      config,
    }),
  };
}
