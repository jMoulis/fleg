import * as z from "zod";

import { shiftMonth } from "@/domain/analytics/calculations";
import { periodKeySchema } from "@/domain/imports/schemas";
import {
  baselineMethodSchema,
  experimentMetricSchema,
  type BaselineMethod,
  type ExperimentMetric,
} from "@/domain/experiments/schemas";

export const baselineSalesFactSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  periodKey: periodKeySchema,
  quantity: z.number().finite(),
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
});
export type BaselineSalesFact = z.infer<typeof baselineSalesFactSchema>;

export const baselineEngineConfigSchema = z
  .object({
    engineVersion: z.string().trim().min(1).max(80),
    minimumReliableComparablePeriods: z.number().int().min(1).max(24),
    robustAggregationMinimumPeriods: z.number().int().min(2).max(24),
    minimumRelativeRevenueCents: z.number().int().safe().nonnegative(),
    minimumRelativeMarginCents: z.number().int().safe().nonnegative(),
    minimumRelativeQuantity: z.number().finite().nonnegative(),
    minimumTrendControlRevenueCents: z.number().int().safe().nonnegative(),
    maximumTrendControlCoefficientOfVariation: z.number().finite().positive(),
    minimumTrendFactor: z.number().finite().positive(),
    maximumTrendFactor: z.number().finite().positive(),
  })
  .superRefine((config, context) => {
    if (
      config.robustAggregationMinimumPeriods <
      config.minimumReliableComparablePeriods
    ) {
      context.addIssue({
        code: "custom",
        path: ["robustAggregationMinimumPeriods"],
        message:
          "Le seuil de calcul robuste doit couvrir le minimum de périodes fiables",
      });
    }
    if (config.minimumTrendFactor >= config.maximumTrendFactor) {
      context.addIssue({
        code: "custom",
        path: ["maximumTrendFactor"],
        message: "La borne haute de tendance doit dépasser la borne basse",
      });
    }
  });
export type BaselineEngineConfig = z.infer<
  typeof baselineEngineConfigSchema
>;

export const defaultBaselineEngineConfig: BaselineEngineConfig =
  baselineEngineConfigSchema.parse({
    engineVersion: "comparable-months-v1",
    minimumReliableComparablePeriods: 3,
    robustAggregationMinimumPeriods: 4,
    minimumRelativeRevenueCents: 10_000,
    minimumRelativeMarginCents: 2_000,
    minimumRelativeQuantity: 5,
    minimumTrendControlRevenueCents: 100_000,
    maximumTrendControlCoefficientOfVariation: 0.35,
    minimumTrendFactor: 0.7,
    maximumTrendFactor: 1.3,
  });

export const baselineWarningCodeSchema = z.enum([
  "UNSUPPORTED_BASELINE_METHOD",
  "MONTHLY_WINDOW_REQUIRED",
  "PRODUCT_SCOPE_REQUIRED",
  "NO_COMPARABLE_DATA",
  "INCOMPLETE_COMPARABLE_WINDOWS",
  "LIMITED_COMPARABLE_HISTORY",
  "SMALL_REVENUE_DENOMINATOR",
  "SMALL_MARGIN_DENOMINATOR",
  "SMALL_QUANTITY_DENOMINATOR",
  "UNSUPPORTED_METRICS",
  "TREND_NORMALIZATION_PENDING",
  "TREND_CONTROL_HISTORY_LIMITED",
  "TREND_CONTROL_TOO_SMALL",
  "TREND_CONTROL_UNSTABLE",
  "TREND_FACTOR_OUT_OF_RANGE",
]);
export type BaselineWarningCode = z.infer<
  typeof baselineWarningCodeSchema
>;

export const baselineWarningSchema = z.object({
  code: baselineWarningCodeSchema,
  severity: z.enum(["info", "warning", "blocking"]),
  message: z.string().min(1),
});
export type BaselineWarning = z.infer<typeof baselineWarningSchema>;

export const baselineAggregateSchema = z.object({
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  quantity: z.number().finite(),
  departmentRevenueCents: z.number().int().safe(),
});
export type BaselineAggregate = z.infer<typeof baselineAggregateSchema>;

export const comparableBaselineWindowSchema = z.object({
  index: z.number().int().positive(),
  periodKeys: z.array(periodKeySchema).min(1),
  missingPeriodKeys: z.array(periodKeySchema),
  complete: z.boolean(),
  product: baselineAggregateSchema,
  trendControlRevenueCents: z.number().int().safe(),
});
export type ComparableBaselineWindow = z.infer<
  typeof comparableBaselineWindowSchema
>;

export const experimentBaselineSchema = z.object({
  method: baselineMethodSchema,
  grain: z.literal("month"),
  engineVersion: z.string().min(1),
  configSnapshot: baselineEngineConfigSchema,
  dataRevision: z.number().int().nonnegative(),
  readiness: z.enum(["ready", "limited", "unavailable"]),
  testPeriodKeys: z.array(periodKeySchema),
  requestedComparablePeriods: z.number().int().positive(),
  availableComparablePeriods: z.number().int().nonnegative(),
  aggregation: z.enum(["mean", "median"]).nullable(),
  baseline: baselineAggregateSchema.nullable(),
  expectedWithoutTest: baselineAggregateSchema.nullable(),
  trendNormalization: z.object({
    requested: z.boolean(),
    applied: z.boolean(),
    factor: z.number().finite().positive().nullable(),
    baselineControlRevenueCents: z.number().int().safe().nullable(),
    testControlRevenueCents: z.number().int().safe().nullable(),
    controlCoefficientOfVariation: z.number().finite().nonnegative().nullable(),
  }),
  relativeComparisonEligible: z.object({
    revenue: z.boolean(),
    grossMargin: z.boolean(),
    quantity: z.boolean(),
  }),
  supportedMetrics: z.array(experimentMetricSchema),
  unsupportedMetrics: z.array(experimentMetricSchema),
  windows: z.array(comparableBaselineWindowSchema),
  evidencePeriodKeys: z.array(periodKeySchema),
  warnings: z.array(baselineWarningSchema),
});
export type ExperimentBaseline = z.infer<typeof experimentBaselineSchema>;

export interface MonthlyBaselinePlan {
  aligned: boolean;
  testPeriodKeys: string[];
  comparableWindows: string[][];
  requiredPeriodKeys: string[];
}

interface BuildComparableBaselineInput {
  method: BaselineMethod;
  testStartAt: string;
  testEndAt: string;
  productIds: string[];
  primaryMetric: ExperimentMetric;
  metrics: ExperimentMetric[];
  comparablePeriods: number;
  trendNormalization: boolean;
  facts: BaselineSalesFact[];
  dataRevision: number;
  config: BaselineEngineConfig;
}

const supportedMonthlyMetrics = new Set<ExperimentMetric>([
  "revenue",
  "quantity",
  "gross_margin_cents",
  "gross_margin_rate",
  "department_revenue",
]);

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function listMonthKeys(start: Date, end: Date): string[] {
  const result: string[] = [];
  let current = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const final = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (current <= final) {
    result.push(monthKey(current));
    current = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1),
    );
  }

  return result;
}

function isCompleteMonthlyWindow(start: Date, end: Date): boolean {
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return start <= end && start.getUTCDate() === 1 && end.getUTCDate() === lastDay;
}

export function planMonthlyBaselineWindows(input: {
  testStartAt: string;
  testEndAt: string;
  comparablePeriods: number;
}): MonthlyBaselinePlan {
  const start = new Date(input.testStartAt);
  const end = new Date(input.testEndAt);
  const validDates = !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf());
  if (!validDates || !isCompleteMonthlyWindow(start, end)) {
    return {
      aligned: false,
      testPeriodKeys: [],
      comparableWindows: [],
      requiredPeriodKeys: [],
    };
  }

  const testPeriodKeys = listMonthKeys(start, end);
  const duration = testPeriodKeys.length;
  const comparableWindows = Array.from(
    { length: input.comparablePeriods },
    (_, index) =>
      Array.from({ length: duration }, (__, periodIndex) =>
        shiftMonth(
          testPeriodKeys[0],
          -duration * (index + 1) + periodIndex,
        ),
      ),
  );

  return {
    aligned: true,
    testPeriodKeys,
    comparableWindows,
    requiredPeriodKeys: [
      ...new Set([...testPeriodKeys, ...comparableWindows.flat()]),
    ],
  };
}

function roundQuantity(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function aggregateFacts(input: {
  facts: BaselineSalesFact[];
  periodKeys: string[];
  productIds: Set<string>;
}): BaselineAggregate & { trendControlRevenueCents: number } {
  const periods = new Set(input.periodKeys);
  return input.facts.reduce(
    (aggregate, fact) => {
      if (!periods.has(fact.periodKey)) return aggregate;
      aggregate.departmentRevenueCents += fact.revenueCents;
      if (input.productIds.has(fact.productId)) {
        aggregate.revenueCents += fact.revenueCents;
        aggregate.marginCents += fact.marginCents;
        aggregate.quantity += fact.quantity;
      } else {
        aggregate.trendControlRevenueCents += fact.revenueCents;
      }
      return aggregate;
    },
    {
      revenueCents: 0,
      marginCents: 0,
      quantity: 0,
      departmentRevenueCents: 0,
      trendControlRevenueCents: 0,
    },
  );
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

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average === 0) return null;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / Math.abs(average);
}

function scaleBaseline(
  baseline: BaselineAggregate,
  factor: number,
): BaselineAggregate {
  return {
    revenueCents: Math.round(baseline.revenueCents * factor),
    marginCents: Math.round(baseline.marginCents * factor),
    quantity: roundQuantity(baseline.quantity * factor),
    departmentRevenueCents: baseline.departmentRevenueCents,
  };
}

function emptyResult(input: BuildComparableBaselineInput & {
  warnings: BaselineWarning[];
  plan?: MonthlyBaselinePlan;
  supportedMetrics?: ExperimentMetric[];
  unsupportedMetrics?: ExperimentMetric[];
}): ExperimentBaseline {
  return experimentBaselineSchema.parse({
    method: input.method,
    grain: "month",
    engineVersion: input.config.engineVersion,
    configSnapshot: input.config,
    dataRevision: input.dataRevision,
    readiness: "unavailable",
    testPeriodKeys: input.plan?.testPeriodKeys ?? [],
    requestedComparablePeriods: input.comparablePeriods,
    availableComparablePeriods: 0,
    aggregation: null,
    baseline: null,
    expectedWithoutTest: null,
    trendNormalization: {
      requested: input.trendNormalization,
      applied: false,
      factor: null,
      baselineControlRevenueCents: null,
      testControlRevenueCents: null,
      controlCoefficientOfVariation: null,
    },
    relativeComparisonEligible: {
      revenue: false,
      grossMargin: false,
      quantity: false,
    },
    supportedMetrics: input.supportedMetrics ?? [],
    unsupportedMetrics: input.unsupportedMetrics ?? [],
    windows: [],
    evidencePeriodKeys: [],
    warnings: input.warnings,
  });
}

export function buildComparablePeriodBaseline(
  input: BuildComparableBaselineInput,
): ExperimentBaseline {
  const uniqueMetrics = [...new Set(input.metrics)];
  const supportedMetrics = uniqueMetrics.filter((metric) =>
    supportedMonthlyMetrics.has(metric),
  );
  const unsupportedMetrics = uniqueMetrics.filter(
    (metric) => !supportedMonthlyMetrics.has(metric),
  );

  if (input.method !== "prior_comparable_periods") {
    return emptyResult({
      ...input,
      supportedMetrics,
      unsupportedMetrics,
      warnings: [
        {
          code: "UNSUPPORTED_BASELINE_METHOD",
          severity: "blocking",
          message:
            "Cette version du moteur calcule uniquement les périodes antérieures comparables.",
        },
      ],
    });
  }

  if (input.productIds.length === 0) {
    return emptyResult({
      ...input,
      supportedMetrics,
      unsupportedMetrics,
      warnings: [
        {
          code: "PRODUCT_SCOPE_REQUIRED",
          severity: "blocking",
          message:
            "La référence mensuelle nécessite au moins un produit explicitement sélectionné.",
        },
      ],
    });
  }

  const plan = planMonthlyBaselineWindows(input);
  if (!plan.aligned) {
    return emptyResult({
      ...input,
      plan,
      supportedMetrics,
      unsupportedMetrics,
      warnings: [
        {
          code: "MONTHLY_WINDOW_REQUIRED",
          severity: "blocking",
          message:
            "Les données disponibles sont mensuelles : le test doit couvrir un ou plusieurs mois civils complets.",
        },
      ],
    });
  }

  const warnings: BaselineWarning[] = [];
  const availablePeriodKeys = new Set(
    input.facts.map((fact) => fact.periodKey),
  );
  const productIds = new Set(input.productIds);
  const windows = plan.comparableWindows.map((periodKeys, index) => {
    const missingPeriodKeys = periodKeys.filter(
      (periodKey) => !availablePeriodKeys.has(periodKey),
    );
    const aggregate = aggregateFacts({
      facts: input.facts,
      periodKeys,
      productIds,
    });
    return comparableBaselineWindowSchema.parse({
      index: index + 1,
      periodKeys,
      missingPeriodKeys,
      complete: missingPeriodKeys.length === 0,
      product: {
        revenueCents: aggregate.revenueCents,
        marginCents: aggregate.marginCents,
        quantity: roundQuantity(aggregate.quantity),
        departmentRevenueCents: aggregate.departmentRevenueCents,
      },
      trendControlRevenueCents: aggregate.trendControlRevenueCents,
    });
  });
  const completeWindows = windows.filter((window) => window.complete);

  if (completeWindows.length === 0) {
    return emptyResult({
      ...input,
      plan,
      supportedMetrics,
      unsupportedMetrics,
      warnings: [
        {
          code: "NO_COMPARABLE_DATA",
          severity: "blocking",
          message:
            "Aucune période antérieure complète n’est disponible pour construire la référence.",
        },
      ],
    });
  }

  if (completeWindows.length < windows.length) {
    warnings.push({
      code: "INCOMPLETE_COMPARABLE_WINDOWS",
      severity: "warning",
      message: `${windows.length - completeWindows.length} période(s) comparable(s) sont absentes et ont été exclues du calcul.`,
    });
  }
  if (
    completeWindows.length < input.config.minimumReliableComparablePeriods
  ) {
    warnings.push({
      code: "LIMITED_COMPARABLE_HISTORY",
      severity: "warning",
      message: `La référence repose sur ${completeWindows.length} période(s), sous le seuil configurable de ${input.config.minimumReliableComparablePeriods}.`,
    });
  }

  const aggregation =
    completeWindows.length >= input.config.robustAggregationMinimumPeriods
      ? "median"
      : "mean";
  const baseline = baselineAggregateSchema.parse({
    revenueCents: Math.round(
      centralValue(
        completeWindows.map((window) => window.product.revenueCents),
        aggregation,
      ),
    ),
    marginCents: Math.round(
      centralValue(
        completeWindows.map((window) => window.product.marginCents),
        aggregation,
      ),
    ),
    quantity: roundQuantity(
      centralValue(
        completeWindows.map((window) => window.product.quantity),
        aggregation,
      ),
    ),
    departmentRevenueCents: Math.round(
      centralValue(
        completeWindows.map(
          (window) => window.product.departmentRevenueCents,
        ),
        aggregation,
      ),
    ),
  });

  const baselineControlValues = completeWindows.map(
    (window) => window.trendControlRevenueCents,
  );
  const baselineControlRevenueCents = Math.round(
    centralValue(baselineControlValues, aggregation),
  );
  const controlCoefficientOfVariation =
    coefficientOfVariation(baselineControlValues);
  const missingTestPeriodKeys = plan.testPeriodKeys.filter(
    (periodKey) => !availablePeriodKeys.has(periodKey),
  );
  const testAggregate = aggregateFacts({
    facts: input.facts,
    periodKeys: plan.testPeriodKeys,
    productIds,
  });
  const testControlRevenueCents =
    missingTestPeriodKeys.length === 0
      ? testAggregate.trendControlRevenueCents
      : null;
  let trendFactor: number | null = null;
  let normalizationApplied = false;

  if (input.trendNormalization) {
    if (missingTestPeriodKeys.length > 0) {
      warnings.push({
        code: "TREND_NORMALIZATION_PENDING",
        severity: "info",
        message:
          "La correction de tendance sera évaluée après l’import de toute la période test.",
      });
    } else if (
      completeWindows.length < input.config.minimumReliableComparablePeriods
    ) {
      warnings.push({
        code: "TREND_CONTROL_HISTORY_LIMITED",
        severity: "warning",
        message:
          "La correction de tendance n’est pas appliquée : l’historique du contrôle rayon est trop court.",
      });
    } else if (
      Math.abs(baselineControlRevenueCents) <
      input.config.minimumTrendControlRevenueCents
    ) {
      warnings.push({
        code: "TREND_CONTROL_TOO_SMALL",
        severity: "warning",
        message:
          "La correction de tendance n’est pas appliquée : le CA du contrôle rayon est trop faible.",
      });
    } else if (
      controlCoefficientOfVariation === null ||
      controlCoefficientOfVariation >
        input.config.maximumTrendControlCoefficientOfVariation
    ) {
      warnings.push({
        code: "TREND_CONTROL_UNSTABLE",
        severity: "warning",
        message:
          "La correction de tendance n’est pas appliquée : le contrôle rayon est trop instable.",
      });
    } else {
      trendFactor =
        (testControlRevenueCents ?? 0) / baselineControlRevenueCents;
      if (
        trendFactor < input.config.minimumTrendFactor ||
        trendFactor > input.config.maximumTrendFactor
      ) {
        warnings.push({
          code: "TREND_FACTOR_OUT_OF_RANGE",
          severity: "warning",
          message:
            "La tendance observée sort des bornes configurées ; la référence reste non corrigée.",
        });
        trendFactor = null;
      } else {
        normalizationApplied = true;
      }
    }
  }

  const expectedWithoutTest = normalizationApplied && trendFactor !== null
    ? scaleBaseline(baseline, trendFactor)
    : baseline;
  const relativeComparisonEligible = {
    revenue:
      Math.abs(expectedWithoutTest.revenueCents) >=
      input.config.minimumRelativeRevenueCents,
    grossMargin:
      Math.abs(expectedWithoutTest.marginCents) >=
      input.config.minimumRelativeMarginCents,
    quantity:
      Math.abs(expectedWithoutTest.quantity) >=
      input.config.minimumRelativeQuantity,
  };
  const needsRevenueDenominator = uniqueMetrics.some((metric) =>
    [
      "revenue",
      "gross_margin_rate",
      "revenue_per_effective_meter",
      "department_revenue",
      "family_revenue",
    ].includes(metric),
  );
  const needsMarginDenominator = uniqueMetrics.some((metric) =>
    [
      "gross_margin_cents",
      "gross_margin_rate",
      "margin_per_effective_meter",
    ].includes(metric),
  );
  const needsQuantityDenominator = uniqueMetrics.includes("quantity");

  if (needsRevenueDenominator && !relativeComparisonEligible.revenue) {
    warnings.push({
      code: "SMALL_REVENUE_DENOMINATOR",
      severity: "warning",
      message:
        "Le CA de référence est trop faible pour calculer ensuite un uplift relatif fiable.",
    });
  }
  if (needsMarginDenominator && !relativeComparisonEligible.grossMargin) {
    warnings.push({
      code: "SMALL_MARGIN_DENOMINATOR",
      severity: "warning",
      message:
        "La marge de référence est trop faible pour calculer ensuite un uplift relatif fiable.",
    });
  }
  if (needsQuantityDenominator && !relativeComparisonEligible.quantity) {
    warnings.push({
      code: "SMALL_QUANTITY_DENOMINATOR",
      severity: "warning",
      message:
        "La quantité de référence est trop faible pour calculer ensuite un uplift relatif fiable.",
    });
  }
  if (unsupportedMetrics.length > 0) {
    const primaryUnsupported = unsupportedMetrics.includes(input.primaryMetric);
    warnings.push({
      code: "UNSUPPORTED_METRICS",
      severity: primaryUnsupported ? "warning" : "info",
      message: primaryUnsupported
        ? "Le KPI principal demande des données qui ne sont pas encore disponibles dans les imports mensuels."
        : "Certaines métriques secondaires demandent des données qui ne sont pas encore disponibles dans les imports mensuels.",
    });
  }

  const hasMaterialWarning = warnings.some(
    (warning) => warning.severity === "warning" || warning.severity === "blocking",
  );
  return experimentBaselineSchema.parse({
    method: input.method,
    grain: "month",
    engineVersion: input.config.engineVersion,
    configSnapshot: input.config,
    dataRevision: input.dataRevision,
    readiness: hasMaterialWarning ? "limited" : "ready",
    testPeriodKeys: plan.testPeriodKeys,
    requestedComparablePeriods: input.comparablePeriods,
    availableComparablePeriods: completeWindows.length,
    aggregation,
    baseline,
    expectedWithoutTest,
    trendNormalization: {
      requested: input.trendNormalization,
      applied: normalizationApplied,
      factor: trendFactor,
      baselineControlRevenueCents,
      testControlRevenueCents,
      controlCoefficientOfVariation,
    },
    relativeComparisonEligible,
    supportedMetrics,
    unsupportedMetrics,
    windows,
    evidencePeriodKeys: completeWindows.flatMap(
      (window) => window.periodKeys,
    ),
    warnings,
  });
}
