import * as z from "zod";

import {
  analyticsConfigSchema,
  defaultAnalyticsConfig,
} from "@/domain/analytics/schemas";
import { periodKeySchema } from "@/domain/imports/schemas";
import {
  defaultBaselineEngineConfig,
  baselineEngineConfigSchema,
} from "@/domain/experiments/baseline";
import {
  defaultEvaluationEngineConfig,
  evaluationEngineConfigSchema,
} from "@/domain/experiments/evaluation-schemas";
import {
  defaultRecommendationConfig,
  recommendationConfigSchema,
} from "@/domain/recommendations/schemas";
import {
  allocationConfigSchema,
  defaultAllocationConfig,
} from "@/domain/space/allocation-schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const { calculationVersion: ignoredCalculationVersion, ...editableAnalyticsShape } =
  analyticsConfigSchema.shape;
const { modelVersion: ignoredModelVersion, ...editableRecommendationShape } =
  recommendationConfigSchema.shape;
const { engineVersion: ignoredBaselineVersion, ...editableBaselineShape } =
  baselineEngineConfigSchema.shape;
const { engineVersion: ignoredEvaluationVersion, ...editableEvaluationShape } =
  evaluationEngineConfigSchema.shape;
void ignoredCalculationVersion;
void ignoredModelVersion;
void ignoredBaselineVersion;
void ignoredEvaluationVersion;

export const editableAnalyticsConfigSchema = z.object(editableAnalyticsShape);
export const editableRecommendationConfigSchema = z.object(
  editableRecommendationShape,
);
export const editableBaselineEngineConfigSchema = z.object(
  editableBaselineShape,
);
export const editableEvaluationEngineConfigSchema = z.object(
  editableEvaluationShape,
);

export const editableStoreSettingsSchema = z.object({
  analytics: editableAnalyticsConfigSchema,
  recommendations: editableRecommendationConfigSchema,
  experiments: z.object({
    baseline: editableBaselineEngineConfigSchema,
    evaluation: editableEvaluationEngineConfigSchema,
  }),
  space: z.object({
    allocation: allocationConfigSchema,
  }),
});
export type EditableStoreSettings = z.infer<
  typeof editableStoreSettingsSchema
>;

export const defaultEditableStoreSettings: EditableStoreSettings =
  editableStoreSettingsSchema.parse({
    analytics: defaultAnalyticsConfig,
    recommendations: defaultRecommendationConfig,
    experiments: {
      baseline: defaultBaselineEngineConfig,
      evaluation: defaultEvaluationEngineConfig,
    },
    space: {
      allocation: defaultAllocationConfig,
    },
  });

export const storeSettingsSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
  analytics: analyticsConfigSchema,
  recommendations: recommendationConfigSchema,
  experiments: z.object({
    baseline: baselineEngineConfigSchema,
    evaluation: evaluationEngineConfigSchema,
  }),
  space: z.object({
    allocation: allocationConfigSchema,
  }),
});
export type StoreSettingsSnapshot = z.infer<
  typeof storeSettingsSnapshotSchema
>;

function addNestedIssues(
  result: z.ZodSafeParseResult<unknown>,
  prefix: PropertyKey[],
  context: z.RefinementCtx,
) {
  if (result.success) return;
  for (const issue of result.error.issues) {
    context.addIssue({
      ...issue,
      path: [...prefix, ...issue.path],
    });
  }
}

export const storeSettingsUpdateInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnUpdatedAt: z.iso.datetime().nullable(),
    settings: editableStoreSettingsSchema,
  })
  .superRefine((input, context) => {
    if (input.settings.analytics.abcAThreshold >= input.settings.analytics.abcBThreshold) {
      context.addIssue({
        code: "custom",
        path: ["settings", "analytics", "abcBThreshold"],
        message: "Le seuil B doit dépasser le seuil A",
      });
    }
    if (
      input.settings.analytics.retainedSeasonalityFloor >=
      input.settings.analytics.retainedSeasonalityCeiling
    ) {
      context.addIssue({
        code: "custom",
        path: ["settings", "analytics", "retainedSeasonalityCeiling"],
        message: "La borne haute de saisonnalité doit dépasser la borne basse",
      });
    }
    if (
      input.settings.analytics.xyzMinimumCompleteWeeks >
      input.settings.analytics.xyzWindowWeeks
    ) {
      context.addIssue({
        code: "custom",
        path: ["settings", "analytics", "xyzMinimumCompleteWeeks"],
        message: "Le minimum de semaines complètes ne peut pas dépasser la fenêtre XYZ",
      });
    }
    if (
      input.settings.analytics.xyzXMaxCoefficientOfVariation >=
      input.settings.analytics.xyzYMaxCoefficientOfVariation
    ) {
      context.addIssue({
        code: "custom",
        path: ["settings", "analytics", "xyzYMaxCoefficientOfVariation"],
        message: "Le seuil Y doit être supérieur au seuil X",
      });
    }
    if (
      input.settings.analytics.dayOfWeekForecastBacktestWeeks >=
      input.settings.analytics.dayOfWeekForecastWindowWeeks
    ) {
      context.addIssue({
        code: "custom",
        path: ["settings", "analytics", "dayOfWeekForecastBacktestWeeks"],
        message: "Le backtest doit être plus court que la fenêtre d’apprentissage",
      });
    }
    if (
      input.settings.analytics.dayOfWeekForecastMinimumObservationsPerWeekday >
      input.settings.analytics.dayOfWeekForecastWindowWeeks -
        input.settings.analytics.dayOfWeekForecastBacktestWeeks
    ) {
      context.addIssue({
        code: "custom",
        path: [
          "settings",
          "analytics",
          "dayOfWeekForecastMinimumObservationsPerWeekday",
        ],
        message: "Le minimum par jour dépasse l’historique disponible avant backtest",
      });
    }
    if (
      input.settings.analytics.dayOfWeekForecastMinimumBacktestObservations >
      input.settings.analytics.dayOfWeekForecastBacktestWeeks * 7
    ) {
      context.addIssue({
        code: "custom",
        path: [
          "settings",
          "analytics",
          "dayOfWeekForecastMinimumBacktestObservations",
        ],
        message: "Le minimum de points de backtest dépasse la fenêtre de validation",
      });
    }
    if (
      input.settings.analytics.dayOfWeekForecastHighConfidenceMaxWape >=
      input.settings.analytics.dayOfWeekForecastMediumConfidenceMaxWape
    ) {
      context.addIssue({
        code: "custom",
        path: [
          "settings",
          "analytics",
          "dayOfWeekForecastMediumConfidenceMaxWape",
        ],
        message: "Le seuil WAPE moyen doit dépasser le seuil WAPE élevé",
      });
    }
    addNestedIssues(
      analyticsConfigSchema.safeParse({
        ...defaultAnalyticsConfig,
        ...input.settings.analytics,
      }),
      ["settings", "analytics"],
      context,
    );
    addNestedIssues(
      recommendationConfigSchema.safeParse({
        ...defaultRecommendationConfig,
        ...input.settings.recommendations,
      }),
      ["settings", "recommendations"],
      context,
    );
    addNestedIssues(
      baselineEngineConfigSchema.safeParse({
        ...defaultBaselineEngineConfig,
        ...input.settings.experiments.baseline,
      }),
      ["settings", "experiments", "baseline"],
      context,
    );
    addNestedIssues(
      evaluationEngineConfigSchema.safeParse({
        ...defaultEvaluationEngineConfig,
        ...input.settings.experiments.evaluation,
      }),
      ["settings", "experiments", "evaluation"],
      context,
    );
  });
export type StoreSettingsUpdateInput = z.infer<
  typeof storeSettingsUpdateInputSchema
>;

export const periodTargetSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  storeId: storeIdSchema,
  periodKey: periodKeySchema,
  targetRevenueCents: z.number().int().safe().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type PeriodTarget = z.infer<typeof periodTargetSchema>;

export const periodTargetUpsertInputSchema = z.object({
  idempotencyKey: z.uuid(),
  basedOnUpdatedAt: z.iso.datetime().nullable(),
  periodKey: periodKeySchema,
  targetRevenueCents: z.number().int().safe().nonnegative(),
});
export type PeriodTargetUpsertInput = z.infer<
  typeof periodTargetUpsertInputSchema
>;

export const storeSettingsResponseSchema = z.object({
  settings: storeSettingsSnapshotSchema,
  requestId: z.uuid(),
});

export const periodTargetsResponseSchema = z.object({
  targets: z.array(periodTargetSchema),
  requestId: z.uuid(),
});

export const periodTargetResponseSchema = z.object({
  target: periodTargetSchema,
  requestId: z.uuid(),
});

export const storeConfigurationWorkspaceSchema = z.object({
  settings: storeSettingsSnapshotSchema,
  targets: z.array(periodTargetSchema),
});
export type StoreConfigurationWorkspace = z.infer<
  typeof storeConfigurationWorkspaceSchema
>;
