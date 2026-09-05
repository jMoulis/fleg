import * as z from "zod";

import { experimentBaselineSchema } from "@/domain/experiments/baseline";
import {
  baselineMethodSchema,
  experimentMetricSchema,
  experimentSchema,
} from "@/domain/experiments/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const evidenceGradeSchema = z.enum(["low", "medium", "high"]);
export type EvidenceGrade = z.infer<typeof evidenceGradeSchema>;

export const evidenceDimensionSchema = z.object({
  dimension: z.enum([
    "history_depth",
    "baseline_stability",
    "date_granularity",
    "control_quality",
    "execution_compliance",
    "confounders",
  ]),
  grade: evidenceGradeSchema,
  reason: z.string().min(1),
});

export const evidenceQualitySchema = z.object({
  grade: evidenceGradeSchema,
  dimensions: z.array(evidenceDimensionSchema).length(6),
});
export type EvidenceQuality = z.infer<typeof evidenceQualitySchema>;

export const evaluationEngineConfigSchema = z
  .object({
    engineVersion: z.string().trim().min(1).max(80),
    mediumHistoryPeriods: z.number().int().min(1).max(24),
    highHistoryPeriods: z.number().int().min(2).max(24),
    highBaselineCoefficientOfVariation: z.number().finite().positive(),
    mediumBaselineCoefficientOfVariation: z.number().finite().positive(),
    maximumLowDimensionsForMedium: z.number().int().min(0).max(6),
    minimumHighDimensionsForHigh: z.number().int().min(1).max(6),
    maximumDeviationsForMedium: z.number().int().nonnegative().max(30),
    maximumConfoundersForMedium: z.number().int().nonnegative().max(30),
    minimumRelativeMarkdownCents: z.number().int().safe().nonnegative(),
    practicalRelativeUpliftThreshold: z
      .number()
      .finite()
      .positive()
      .max(1)
      .default(0.02),
    criticalGuardrailRelativeChange: z
      .number()
      .finite()
      .positive()
      .max(1)
      .default(0.05),
    materialEconomicLossCents: z
      .number()
      .int()
      .safe()
      .nonnegative()
      .default(10_000),
  })
  .superRefine((config, context) => {
    if (config.mediumHistoryPeriods >= config.highHistoryPeriods) {
      context.addIssue({
        code: "custom",
        path: ["highHistoryPeriods"],
        message: "Le seuil d’historique élevé doit dépasser le seuil moyen",
      });
    }
    if (
      config.highBaselineCoefficientOfVariation >=
      config.mediumBaselineCoefficientOfVariation
    ) {
      context.addIssue({
        code: "custom",
        path: ["mediumBaselineCoefficientOfVariation"],
        message: "La tolérance moyenne doit dépasser la tolérance élevée",
      });
    }
  });
export type EvaluationEngineConfig = z.infer<
  typeof evaluationEngineConfigSchema
>;

export const defaultEvaluationEngineConfig: EvaluationEngineConfig =
  evaluationEngineConfigSchema.parse({
    engineVersion: "experiment-evaluation-v1",
    mediumHistoryPeriods: 2,
    highHistoryPeriods: 4,
    highBaselineCoefficientOfVariation: 0.15,
    mediumBaselineCoefficientOfVariation: 0.35,
    maximumLowDimensionsForMedium: 1,
    minimumHighDimensionsForHigh: 5,
    maximumDeviationsForMedium: 1,
    maximumConfoundersForMedium: 1,
    minimumRelativeMarkdownCents: 1_000,
    practicalRelativeUpliftThreshold: 0.02,
    criticalGuardrailRelativeChange: 0.05,
    materialEconomicLossCents: 10_000,
  });

export const metricEvaluationSchema = z.object({
  metric: experimentMetricSchema,
  unit: z.enum(["cents", "quantity", "ratio"]),
  actual: z.number().finite().nullable(),
  expectedWithoutTest: z.number().finite().nullable(),
  absoluteUplift: z.number().finite().nullable(),
  relativeUplift: z.number().finite().nullable(),
  baselineMethod: baselineMethodSchema,
  quality: evidenceGradeSchema,
  warnings: z.array(z.string().min(1)),
});
export type MetricEvaluation = z.infer<typeof metricEvaluationSchema>;

export const experimentEconomicsSchema = z.object({
  incrementalGrossMarginCents: z.number().int().safe().nullable(),
  actualMarkdownCents: z.number().int().safe().nonnegative().nullable(),
  expectedMarkdownCents: z.number().int().safe().nonnegative().nullable(),
  incrementalMarkdownCents: z.number().int().safe().nullable(),
  explicitCostsCents: z.number().int().safe().nonnegative().nullable(),
  actualPostMarkdownMarginCents: z.number().int().safe().nullable(),
  knownComponentsValueCents: z.number().int().safe().nullable(),
  netIncrementalValueCents: z.number().int().safe().nullable(),
  complete: z.boolean(),
  missingComponents: z.array(z.enum(["gross_margin", "markdown", "explicit_costs"])),
});
export type ExperimentEconomics = z.infer<typeof experimentEconomicsSchema>;

export const analysisWarningSchema = z.object({
  code: z.enum([
    "BASELINE_LIMITED",
    "METRIC_UNAVAILABLE",
    "MARKDOWN_DATA_MISSING",
    "EXPLICIT_COSTS_UNKNOWN",
    "EXECUTION_DEVIATIONS",
    "CONFOUNDERS_RECORDED",
  ]),
  severity: z.enum(["info", "warning"]),
  message: z.string().min(1),
});
export type AnalysisWarning = z.infer<typeof analysisWarningSchema>;

export const experimentAnalysisSchema = z.object({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  experimentId: mongoIdSchema,
  analysisVersion: z.number().int().positive(),
  engineVersion: z.string().min(1),
  dataRevision: z.number().int().nonnegative(),
  analyzedAt: z.iso.datetime(),
  createdBy: z.string().min(1),
  periodWindow: z.object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    periodKeys: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1),
  }),
  baselineMethod: baselineMethodSchema,
  baseline: experimentBaselineSchema,
  experimentSnapshot: experimentSchema,
  configSnapshot: evaluationEngineConfigSchema,
  evidenceQuality: evidenceQualitySchema,
  metrics: z.array(metricEvaluationSchema).min(1),
  economics: experimentEconomicsSchema,
  warnings: z.array(analysisWarningSchema),
  evidenceRefs: z.array(
    z.object({
      source: z.enum(["salesFacts", "markdownFacts"]),
      periodKeys: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
      recordCount: z.number().int().nonnegative(),
      dataRevision: z.number().int().nonnegative(),
    }),
  ),
});
export type ExperimentAnalysis = z.infer<typeof experimentAnalysisSchema>;

export const experimentEvaluateInputSchema = z.object({
  idempotencyKey: z.uuid(),
  basedOnUpdatedAt: z.iso.datetime(),
});
export type ExperimentEvaluateInput = z.infer<
  typeof experimentEvaluateInputSchema
>;

export const experimentAnalysisResponseSchema = z.object({
  analysis: experimentAnalysisSchema,
  experiment: experimentSchema,
  requestId: z.uuid(),
});

export const experimentAnalysesResponseSchema = z.object({
  analyses: z.array(experimentAnalysisSchema),
  requestId: z.uuid(),
});
