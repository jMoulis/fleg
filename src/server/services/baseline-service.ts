import "server-only";

import {
  buildComparablePeriodBaseline,
  planMonthlyBaselineWindows,
} from "@/domain/experiments/baseline";
import { buildControlStoreBaseline } from "@/domain/experiments/control-baseline";
import { controlStoreSetMatches } from "@/domain/experiments/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { ExperimentBaselineRepository } from "@/server/repositories/experiment-baseline-repository";
import {
  ExperimentNotFoundError,
  ExperimentRepository,
} from "@/server/repositories/experiment-repository";

export async function getExperimentBaseline(input: {
  context: AuthorizedStoreContext;
  controlContexts?: AuthorizedStoreContext[];
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
  const controlContexts = input.controlContexts ?? [];
  if (
    !controlStoreSetMatches({
      primaryContext: input.context,
      controlContexts,
      requestedStoreIds: experiment.baselineConfig.controlStoreIds,
    })
  ) {
    throw new StoreAccessDeniedError();
  }

  const testStartAt = experiment.actualStartAt ?? experiment.plannedStartAt;
  const testEndAt = experiment.actualEndAt ?? experiment.plannedEndAt;
  const plan = planMonthlyBaselineWindows({
    testStartAt,
    testEndAt,
    comparablePeriods: experiment.baselineConfig.comparablePeriods,
  });
  const usesComparablePeriods =
    experiment.baselineConfig.method === "prior_comparable_periods" ||
    experiment.baselineConfig.method === "control_store" ||
    experiment.baselineConfig.method === "difference_in_differences";
  const [config, dataRevision, facts] = await Promise.all([
    baselineRepository.getConfig(input.context),
    baselineRepository.getDataRevision(input.context),
    baselineRepository.findMonthlyFacts(
      input.context,
      usesComparablePeriods ? plan.requiredPeriodKeys : [],
    ),
  ]);
  const isControlMethod =
    experiment.baselineConfig.method === "control_store" ||
    experiment.baselineConfig.method === "difference_in_differences";
  const primaryBaseline = buildComparablePeriodBaseline({
    method: isControlMethod
      ? "prior_comparable_periods"
      : experiment.baselineConfig.method,
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

  if (!isControlMethod) return primaryBaseline;

  const controls = await baselineRepository.findControlStoreInputs({
    primaryContext: input.context,
    controlContexts,
    primaryProductIds: experiment.productIds,
    periodKeys: plan.requiredPeriodKeys,
  });
  return buildControlStoreBaseline({
    method:
      experiment.baselineConfig.method === "control_store"
        ? "control_store"
        : "difference_in_differences",
    primaryBaseline,
    treatmentFacts: facts,
    treatmentProductIds: experiment.productIds,
    controls,
  });
}
