import type {
  BaselineAggregate,
  BaselineSalesFact,
  ExperimentBaseline,
} from "@/domain/experiments/baseline";
import {
  evidenceQualitySchema,
  experimentEconomicsSchema,
  metricEvaluationSchema,
  type AnalysisWarning,
  type EvaluationEngineConfig,
  type EvidenceGrade,
  type EvidenceQuality,
  type ExperimentEconomics,
  type MetricEvaluation,
} from "@/domain/experiments/evaluation-schemas";
import type {
  Experiment,
  ExperimentMetric,
} from "@/domain/experiments/schemas";
import type { MarkdownFact } from "@/domain/markdown/schemas";

interface ExperimentEvaluationResult {
  evidenceQuality: EvidenceQuality;
  metrics: MetricEvaluation[];
  economics: ExperimentEconomics;
  warnings: AnalysisWarning[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function centralValue(values: number[], aggregation: "mean" | "median") {
  return aggregation === "median" ? median(values) : mean(values);
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average === 0) return null;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / Math.abs(average);
}

function aggregateTestFacts(input: {
  facts: BaselineSalesFact[];
  periodKeys: string[];
  productIds: string[];
}): BaselineAggregate {
  const periods = new Set(input.periodKeys);
  const products = new Set(input.productIds);
  return input.facts.reduce<BaselineAggregate>(
    (aggregate, fact) => {
      if (!periods.has(fact.periodKey)) return aggregate;
      aggregate.departmentRevenueCents += fact.revenueCents;
      if (products.has(fact.productId)) {
        aggregate.revenueCents += fact.revenueCents;
        aggregate.marginCents += fact.marginCents;
        aggregate.quantity += fact.quantity;
      }
      return aggregate;
    },
    {
      revenueCents: 0,
      marginCents: 0,
      quantity: 0,
      departmentRevenueCents: 0,
    },
  );
}

function markdownSummary(input: {
  facts: MarkdownFact[];
  periodKeys: string[];
}): number {
  const periods = new Set(input.periodKeys);
  return input.facts.reduce(
    (sum, fact) =>
      periods.has(fact.periodKey) ? sum + fact.amountCents : sum,
    0,
  );
}

function buildMarkdownEvaluation(input: {
  facts: MarkdownFact[];
  baseline: ExperimentBaseline;
}) {
  if (input.facts.length === 0 || input.baseline.aggregation === null) {
    return { actual: null, expected: null, incremental: null };
  }
  const coveredPeriodKeys = new Set(input.facts.map((fact) => fact.periodKey));
  const requiredPeriodKeys = [
    ...input.baseline.testPeriodKeys,
    ...input.baseline.windows
      .filter((window) => window.complete)
      .flatMap((window) => window.periodKeys),
  ];
  if (requiredPeriodKeys.some((periodKey) => !coveredPeriodKeys.has(periodKey))) {
    return { actual: null, expected: null, incremental: null };
  }
  const comparableValues = input.baseline.windows
    .filter((window) => window.complete)
    .map((window) =>
      markdownSummary({ facts: input.facts, periodKeys: window.periodKeys }),
    );
  if (comparableValues.length === 0) {
    return { actual: null, expected: null, incremental: null };
  }
  const actual = markdownSummary({
    facts: input.facts,
    periodKeys: input.baseline.testPeriodKeys,
  });
  const expected = Math.round(
    centralValue(comparableValues, input.baseline.aggregation),
  );
  return { actual, expected, incremental: actual - expected };
}

function evidenceGradeForHistory(input: {
  periods: number;
  config: EvaluationEngineConfig;
}): EvidenceGrade {
  if (input.periods >= input.config.highHistoryPeriods) return "high";
  if (input.periods >= input.config.mediumHistoryPeriods) return "medium";
  return "low";
}

function buildEvidenceQuality(input: {
  baseline: ExperimentBaseline;
  experiment: Experiment;
  config: EvaluationEngineConfig;
}): EvidenceQuality {
  const completeRevenueValues = input.baseline.windows
    .filter((window) => window.complete)
    .map((window) => window.product.revenueCents);
  const stability = coefficientOfVariation(completeRevenueValues);
  const stabilityGrade: EvidenceGrade =
    stability === null
      ? "low"
      : stability <= input.config.highBaselineCoefficientOfVariation
        ? "high"
        : stability <= input.config.mediumBaselineCoefficientOfVariation
          ? "medium"
          : "low";
  const deviations = input.experiment.treatmentActual?.deviations.length ?? 0;
  const executionGrade: EvidenceGrade = !input.experiment.treatmentActual
    ? "low"
    : deviations === 0
      ? "high"
      : deviations <= input.config.maximumDeviationsForMedium
        ? "medium"
        : "low";
  const confounderCount = input.experiment.confounders.length;
  const confounderGrade: EvidenceGrade =
    confounderCount === 0
      ? "high"
      : confounderCount <= input.config.maximumConfoundersForMedium
        ? "medium"
      : "low";
  const controlComparison = input.baseline.controlComparison;
  const requestedControlCount =
    controlComparison?.requestedStoreIds.length ?? 0;
  const includedControlCount = controlComparison?.includedStoreCount ?? 0;
  const controlGrade: EvidenceGrade = controlComparison
    ? includedControlCount === requestedControlCount
      ? "high"
      : includedControlCount > 0
        ? "medium"
        : "low"
    : input.baseline.trendNormalization.applied
      ? "high"
      : input.baseline.trendNormalization.requested
        ? "low"
        : "medium";
  const controlReason = controlComparison
    ? `${includedControlCount}/${requestedControlCount} magasin(s) témoin(s) inclus dans le calcul ${controlComparison.method === "difference_in_differences" ? "diff-in-diff" : "de comparaison directe"}.`
    : input.baseline.trendNormalization.applied
      ? "La correction de tendance repose sur un contrôle rayon stable."
      : input.baseline.trendNormalization.requested
        ? "La correction demandée n’a pas satisfait les garde-fous."
        : "Aucun contrôle de tendance n’a été demandé.";
  const dimensions: EvidenceQuality["dimensions"] = [
    {
      dimension: "history_depth",
      grade: evidenceGradeForHistory({
        periods: input.baseline.availableComparablePeriods,
        config: input.config,
      }),
      reason: `${input.baseline.availableComparablePeriods} période(s) comparable(s) complète(s).`,
    },
    {
      dimension: "baseline_stability",
      grade: stabilityGrade,
      reason:
        stability === null
          ? "Stabilité impossible à mesurer avec l’historique disponible."
          : `Variation relative de la référence : ${(stability * 100).toFixed(1)} %.`,
    },
    {
      dimension: "date_granularity",
      grade: "medium",
      reason:
        "La période est alignée sur les mois importés, sans détail quotidien ou hebdomadaire.",
    },
    {
      dimension: "control_quality",
      grade: controlGrade,
      reason: controlReason,
    },
    {
      dimension: "execution_compliance",
      grade: executionGrade,
      reason: !input.experiment.treatmentActual
        ? "Le traitement réellement exécuté n’est pas documenté."
        : deviations === 0
          ? "Aucun écart au protocole n’a été enregistré."
          : `${deviations} écart(s) au protocole enregistré(s).`,
    },
    {
      dimension: "confounders",
      grade: confounderGrade,
      reason:
        confounderCount === 0
          ? "Aucun facteur perturbateur n’a été enregistré."
          : `${confounderCount} facteur(s) perturbateur(s) enregistré(s).`,
    },
  ];
  const lowCount = dimensions.filter(({ grade }) => grade === "low").length;
  const highCount = dimensions.filter(({ grade }) => grade === "high").length;
  const grade: EvidenceGrade =
    lowCount === 0 &&
    highCount >= input.config.minimumHighDimensionsForHigh
      ? "high"
      : lowCount <= input.config.maximumLowDimensionsForMedium
        ? "medium"
        : "low";
  return evidenceQualitySchema.parse({ grade, dimensions });
}

function metricValues(input: {
  metric: ExperimentMetric;
  actual: BaselineAggregate;
  expected: BaselineAggregate;
  markdown: ReturnType<typeof buildMarkdownEvaluation>;
}) {
  switch (input.metric) {
    case "revenue":
      return {
        unit: "cents" as const,
        actual: input.actual.revenueCents,
        expected: input.expected.revenueCents,
      };
    case "quantity":
      return {
        unit: "quantity" as const,
        actual: input.actual.quantity,
        expected: input.expected.quantity,
      };
    case "gross_margin_cents":
      return {
        unit: "cents" as const,
        actual: input.actual.marginCents,
        expected: input.expected.marginCents,
      };
    case "gross_margin_rate":
      return {
        unit: "ratio" as const,
        actual: safeRatio(input.actual.marginCents, input.actual.revenueCents),
        expected: safeRatio(
          input.expected.marginCents,
          input.expected.revenueCents,
        ),
      };
    case "department_revenue":
      return {
        unit: "cents" as const,
        actual: input.actual.departmentRevenueCents,
        expected: input.expected.departmentRevenueCents,
      };
    case "markdown_cents":
      return {
        unit: "cents" as const,
        actual: input.markdown.actual,
        expected: input.markdown.expected,
      };
    case "revenue_per_effective_meter":
    case "margin_per_effective_meter":
    case "family_revenue":
      return { unit: "cents" as const, actual: null, expected: null };
  }
}

function relativeEligible(input: {
  metric: ExperimentMetric;
  baseline: ExperimentBaseline;
  expected: number;
  config: EvaluationEngineConfig;
}): boolean {
  if (input.metric === "quantity") {
    return input.baseline.relativeComparisonEligible.quantity;
  }
  if (
    input.metric === "gross_margin_cents" ||
    input.metric === "margin_per_effective_meter"
  ) {
    return input.baseline.relativeComparisonEligible.grossMargin;
  }
  if (input.metric === "markdown_cents") {
    return Math.abs(input.expected) >= input.config.minimumRelativeMarkdownCents;
  }
  return input.baseline.relativeComparisonEligible.revenue;
}

function buildMetricEvaluations(input: {
  metrics: ExperimentMetric[];
  actual: BaselineAggregate;
  baseline: ExperimentBaseline;
  markdown: ReturnType<typeof buildMarkdownEvaluation>;
  evidenceGrade: EvidenceGrade;
  config: EvaluationEngineConfig;
}): MetricEvaluation[] {
  const expected = input.baseline.expectedWithoutTest;
  if (!expected) return [];
  return [...new Set(input.metrics)].map((metric) => {
    const values = metricValues({
      metric,
      actual: input.actual,
      expected,
      markdown: input.markdown,
    });
    const warnings: string[] = [];
    if (values.actual === null || values.expected === null) {
      warnings.push(
        "Cette métrique ne peut pas être évaluée avec les données disponibles.",
      );
    }
    if (metric === "markdown_cents" && input.baseline.controlComparison) {
      warnings.push(
        "La démarque attendue reste fondée sur l’historique du magasin testé ; elle n’est pas corrigée par les magasins témoins dans cette version.",
      );
    }
    const absoluteUplift =
      values.actual === null || values.expected === null
        ? null
        : values.actual - values.expected;
    const eligible =
      values.expected !== null &&
      relativeEligible({
        metric,
        baseline: input.baseline,
        expected: values.expected,
        config: input.config,
      });
    const relativeUplift =
      absoluteUplift === null || values.expected === null || !eligible
        ? null
        : safeRatio(absoluteUplift, values.expected);
    if (
      absoluteUplift !== null &&
      values.expected !== null &&
      relativeUplift === null
    ) {
      warnings.push(
        "L’uplift relatif est masqué car le dénominateur est trop faible.",
      );
    }
    return metricEvaluationSchema.parse({
      metric,
      unit: values.unit,
      actual: values.actual,
      expectedWithoutTest: values.expected,
      absoluteUplift,
      relativeUplift,
      baselineMethod: input.baseline.method,
      quality:
        values.actual === null || values.expected === null
          ? "low"
          : input.evidenceGrade,
      warnings,
    });
  });
}

function buildEconomics(input: {
  actual: BaselineAggregate;
  metrics: MetricEvaluation[];
  markdown: ReturnType<typeof buildMarkdownEvaluation>;
  explicitCostsCents: number | null;
}): ExperimentEconomics {
  const incrementalGrossMarginCents =
    input.metrics.find(({ metric }) => metric === "gross_margin_cents")
      ?.absoluteUplift ?? null;
  const roundedIncrementalMargin =
    incrementalGrossMarginCents === null
      ? null
      : Math.round(incrementalGrossMarginCents);
  const missingComponents: ExperimentEconomics["missingComponents"] = [];
  if (roundedIncrementalMargin === null) missingComponents.push("gross_margin");
  if (input.markdown.incremental === null) missingComponents.push("markdown");
  if (input.explicitCostsCents === null) missingComponents.push("explicit_costs");
  const knownComponentsValueCents =
    roundedIncrementalMargin === null
      ? null
      : roundedIncrementalMargin -
        (input.markdown.incremental ?? 0) -
        (input.explicitCostsCents ?? 0);
  const complete = missingComponents.length === 0;
  return experimentEconomicsSchema.parse({
    incrementalGrossMarginCents: roundedIncrementalMargin,
    actualMarkdownCents: input.markdown.actual,
    expectedMarkdownCents: input.markdown.expected,
    incrementalMarkdownCents: input.markdown.incremental,
    explicitCostsCents: input.explicitCostsCents,
    actualPostMarkdownMarginCents:
      input.markdown.actual === null
        ? null
        : input.actual.marginCents - input.markdown.actual,
    knownComponentsValueCents,
    netIncrementalValueCents: complete ? knownComponentsValueCents : null,
    complete,
    missingComponents,
  });
}

export function calculateExperimentEvaluation(input: {
  experiment: Experiment;
  baseline: ExperimentBaseline;
  salesFacts: BaselineSalesFact[];
  markdownFacts: MarkdownFact[];
  config: EvaluationEngineConfig;
}): ExperimentEvaluationResult {
  if (!input.baseline.expectedWithoutTest) {
    throw new Error("La baseline doit être disponible avant l’évaluation");
  }
  const actual = aggregateTestFacts({
    facts: input.salesFacts,
    periodKeys: input.baseline.testPeriodKeys,
    productIds: input.experiment.productIds,
  });
  const markdown = buildMarkdownEvaluation({
    facts: input.markdownFacts,
    baseline: input.baseline,
  });
  let evidenceQuality = buildEvidenceQuality({
    baseline: input.baseline,
    experiment: input.experiment,
    config: input.config,
  });
  const metrics = buildMetricEvaluations({
    metrics: [
      input.experiment.primaryMetric,
      ...input.experiment.secondaryMetrics,
      ...input.experiment.guardrailMetrics,
      "gross_margin_cents",
    ],
    actual,
    baseline: input.baseline,
    markdown,
    evidenceGrade: evidenceQuality.grade,
    config: input.config,
  });
  const primary = metrics.find(
    ({ metric }) => metric === input.experiment.primaryMetric,
  );
  if (!primary || primary.actual === null || primary.expectedWithoutTest === null) {
    evidenceQuality = evidenceQualitySchema.parse({
      ...evidenceQuality,
      grade: "low",
    });
  }
  const economics = buildEconomics({
    actual,
    metrics,
    markdown,
    explicitCostsCents: input.experiment.explicitCostsCents,
  });
  const warnings: AnalysisWarning[] = [];
  if (input.baseline.readiness === "limited") {
    warnings.push({
      code: "BASELINE_LIMITED",
      severity: "warning",
      message:
        "La référence est exploitable mais présente des limites détaillées dans ses preuves.",
    });
  }
  if (metrics.some(({ actual: value }) => value === null)) {
    warnings.push({
      code: "METRIC_UNAVAILABLE",
      severity: "warning",
      message: "Au moins une métrique configurée n’a pas pu être calculée.",
    });
  }
  if (markdown.actual === null) {
    warnings.push({
      code: "MARKDOWN_DATA_MISSING",
      severity: "warning",
      message:
        "La couverture de démarque n’est pas complète sur le test et ses périodes comparables ; le résultat économique reste partiel.",
    });
  }
  if (input.experiment.explicitCostsCents === null) {
    warnings.push({
      code: "EXPLICIT_COSTS_UNKNOWN",
      severity: "info",
      message:
        "Les coûts explicites n’ont pas été confirmés ; aucune valeur nette complète n’est affichée.",
    });
  }
  if ((input.experiment.treatmentActual?.deviations.length ?? 0) > 0) {
    warnings.push({
      code: "EXECUTION_DEVIATIONS",
      severity: "warning",
      message: "Des écarts au protocole peuvent affecter l’interprétation.",
    });
  }
  if (input.experiment.confounders.length > 0) {
    warnings.push({
      code: "CONFOUNDERS_RECORDED",
      severity: "warning",
      message:
        "Des facteurs perturbateurs ont été déclarés et doivent être pris en compte.",
    });
  }
  const controlComparison = input.baseline.controlComparison;
  if (
    controlComparison &&
    controlComparison.includedStoreCount <
      controlComparison.requestedStoreIds.length
  ) {
    warnings.push({
      code: "CONTROL_STORES_EXCLUDED",
      severity: "warning",
      message:
        "Au moins un magasin témoin sélectionné a été exclu ; les raisons restent visibles dans le snapshot de contrôle.",
    });
  }
  if (controlComparison) {
    warnings.push({
      code: "CONTROL_COMPARISON_ASSUMPTION",
      severity: "info",
      message:
        controlComparison.method === "difference_in_differences"
          ? "Le diff-in-diff suppose que les tendances auraient évolué en parallèle sans traitement ; ce résultat reste une estimation, pas une preuve causale."
          : "La comparaison directe suppose que les magasins témoins sont suffisamment similaires au magasin testé.",
    });
  }

  return { evidenceQuality, metrics, economics, warnings };
}
