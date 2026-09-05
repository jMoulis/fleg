import type {
  Experiment,
  ExperimentDefinition,
  ExperimentStatus,
} from "@/domain/experiments/schemas";

export type ExperimentListView =
  | "prepare"
  | "running"
  | "analyze"
  | "finished";

export function dateInputToStartIso(value: string): string {
  return `${value}T00:00:00.000Z`;
}

export function dateInputToEndIso(value: string): string {
  return `${value}T23:59:59.999Z`;
}

export function isoToDateInput(value: string): string {
  return value.slice(0, 10);
}

export function getExperimentListView(
  status: ExperimentStatus,
): ExperimentListView {
  if (status === "draft" || status === "planned") return "prepare";
  if (status === "running") return "running";
  if (status === "awaiting_data" || status === "analyzed") return "analyze";
  return "finished";
}

export function experimentDefinitionFromRecord(
  experiment: Experiment,
): ExperimentDefinition {
  return {
    title: experiment.title,
    hypothesis: experiment.hypothesis,
    type: experiment.type,
    productIds: experiment.productIds,
    family: experiment.family,
    treatmentPlan: experiment.treatmentPlan,
    plannedStartAt: experiment.plannedStartAt,
    plannedEndAt: experiment.plannedEndAt,
    primaryMetric: experiment.primaryMetric,
    secondaryMetrics: experiment.secondaryMetrics,
    guardrailMetrics: experiment.guardrailMetrics,
    baselineConfig: experiment.baselineConfig,
    expectedRelativeEffect: experiment.expectedRelativeEffect,
    explicitCostsCents: experiment.explicitCostsCents,
    confounders: experiment.confounders,
    linkedCommercialEventId: experiment.linkedCommercialEventId,
    linkedRecommendationId: experiment.linkedRecommendationId,
  };
}

export function getExperimentProgress(input: {
  actualStartAt: string;
  plannedEndAt: string;
  asOf: string;
}): { currentDay: number; totalDays: number; elapsedRatio: number } {
  const dayMilliseconds = 86_400_000;
  const start = new Date(input.actualStartAt).getTime();
  const end = new Date(input.plannedEndAt).getTime();
  const asOf = new Date(input.asOf).getTime();
  const totalDays = Math.max(1, Math.ceil((end - start) / dayMilliseconds));
  const currentDay = Math.min(
    totalDays,
    Math.max(1, Math.floor((asOf - start) / dayMilliseconds) + 1),
  );

  return {
    currentDay,
    totalDays,
    elapsedRatio: Math.min(1, Math.max(0, currentDay / totalDays)),
  };
}
