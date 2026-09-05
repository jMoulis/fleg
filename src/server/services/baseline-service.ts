import "server-only";

import {
  buildComparablePeriodBaseline,
  planMonthlyBaselineWindows,
} from "@/domain/experiments/baseline";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { ExperimentBaselineRepository } from "@/server/repositories/experiment-baseline-repository";
import {
  ExperimentNotFoundError,
  ExperimentRepository,
} from "@/server/repositories/experiment-repository";

export async function getExperimentBaseline(input: {
  context: AuthorizedStoreContext;
  experimentId: string;
}) {
  const db = await getAppDb();
  const experimentRepository = new ExperimentRepository(db);
  const baselineRepository = new ExperimentBaselineRepository(db);
  const experiment = await experimentRepository.findForStore(
    input.context,
    input.experimentId,
  );
  if (!experiment) throw new ExperimentNotFoundError();

  const testStartAt = experiment.actualStartAt ?? experiment.plannedStartAt;
  const testEndAt = experiment.actualEndAt ?? experiment.plannedEndAt;
  const plan = planMonthlyBaselineWindows({
    testStartAt,
    testEndAt,
    comparablePeriods: experiment.baselineConfig.comparablePeriods,
  });
  const [config, dataRevision, facts] = await Promise.all([
    baselineRepository.getConfig(input.context),
    baselineRepository.getDataRevision(input.context),
    baselineRepository.findMonthlyFacts(
      input.context,
      experiment.baselineConfig.method === "prior_comparable_periods"
        ? plan.requiredPeriodKeys
        : [],
    ),
  ]);

  return buildComparablePeriodBaseline({
    method: experiment.baselineConfig.method,
    testStartAt,
    testEndAt,
    productIds: experiment.productIds,
    primaryMetric: experiment.primaryMetric,
    metrics: [
      experiment.primaryMetric,
      ...experiment.secondaryMetrics,
      ...experiment.guardrailMetrics,
    ],
    comparablePeriods: experiment.baselineConfig.comparablePeriods,
    trendNormalization: experiment.baselineConfig.trendNormalization,
    facts,
    dataRevision,
    config,
  });
}
