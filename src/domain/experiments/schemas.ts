import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const nullableMongoIdSchema = mongoIdSchema.nullable();

export const experimentStatusSchema = z.enum([
  "draft",
  "planned",
  "running",
  "awaiting_data",
  "analyzed",
  "concluded",
  "archived",
  "cancelled",
]);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const experimentTypeSchema = z.enum([
  "tg_placement",
  "space_change",
  "layout_change",
  "price_change",
  "promotion",
  "assortment",
  "presentation",
  "custom",
]);
export type ExperimentType = z.infer<typeof experimentTypeSchema>;

export const experimentMetricSchema = z.enum([
  "revenue",
  "quantity",
  "gross_margin_cents",
  "gross_margin_rate",
  "markdown_cents",
  "revenue_per_effective_meter",
  "margin_per_effective_meter",
  "department_revenue",
  "family_revenue",
]);
export type ExperimentMetric = z.infer<typeof experimentMetricSchema>;

export const baselineMethodSchema = z.enum([
  "prior_comparable_periods",
  "prior_year",
  "internal_category_control",
  "control_store",
  "difference_in_differences",
]);
export type BaselineMethod = z.infer<typeof baselineMethodSchema>;

export const experimentTreatmentPlanSchema = z.object({
  summary: z.string().trim().min(1).max(1_000),
  fixtureId: z.string().trim().min(1).max(100).nullable(),
  expectedChange: z.string().trim().min(1).max(1_000),
  instructions: z.array(z.string().trim().min(1).max(500)).max(30),
});
export type ExperimentTreatmentPlan = z.infer<
  typeof experimentTreatmentPlanSchema
>;

export const experimentTreatmentActualSchema = z.object({
  summary: z.string().trim().min(1).max(1_000),
  fixtureId: z.string().trim().min(1).max(100).nullable(),
  implementationNotes: z.string().trim().max(2_000).nullable(),
  deviations: z.array(z.string().trim().min(1).max(500)).max(30),
});
export type ExperimentTreatmentActual = z.infer<
  typeof experimentTreatmentActualSchema
>;

export const experimentBaselineConfigSchema = z
  .object({
    method: baselineMethodSchema,
    comparablePeriods: z.number().int().min(1).max(24),
    trendNormalization: z.boolean(),
    controlStoreIds: z.array(storeIdSchema).max(20),
  })
  .superRefine((config, context) => {
    const needsControlStore =
      config.method === "control_store" ||
      config.method === "difference_in_differences";

    if (needsControlStore && config.controlStoreIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["controlStoreIds"],
        message: "Au moins un magasin contrôle est requis pour cette méthode",
      });
    }

    if (!needsControlStore && config.controlStoreIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["controlStoreIds"],
        message: "Cette méthode n'utilise pas de magasin contrôle",
      });
    }

    if (new Set(config.controlStoreIds).size !== config.controlStoreIds.length) {
      context.addIssue({
        code: "custom",
        path: ["controlStoreIds"],
        message: "Un magasin contrôle ne peut être sélectionné qu'une fois",
      });
    }

    if (needsControlStore && config.trendNormalization) {
      context.addIssue({
        code: "custom",
        path: ["trendNormalization"],
        message:
          "La tendance est déjà portée par les magasins témoins pour cette méthode",
      });
    }
  });
export type ExperimentBaselineConfig = z.infer<
  typeof experimentBaselineConfigSchema
>;

export const experimentDefinitionSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    hypothesis: z.string().trim().min(1).max(2_000),
    type: experimentTypeSchema,
    productIds: z.array(mongoIdSchema).max(50),
    family: z.string().trim().min(1).max(160).nullable(),
    treatmentPlan: experimentTreatmentPlanSchema,
    plannedStartAt: z.iso.datetime(),
    plannedEndAt: z.iso.datetime(),
    primaryMetric: experimentMetricSchema,
    secondaryMetrics: z.array(experimentMetricSchema).max(8),
    guardrailMetrics: z.array(experimentMetricSchema).max(8),
    baselineConfig: experimentBaselineConfigSchema,
    expectedRelativeEffect: z.number().finite().min(-10).max(10).nullable(),
    explicitCostsCents: z.number().int().safe().nonnegative().nullable(),
    confounders: z.array(z.string().trim().min(1).max(500)).max(30),
    linkedCommercialEventId: nullableMongoIdSchema,
    linkedRecommendationId: nullableMongoIdSchema,
  })
  .superRefine((experiment, context) => {
    if (experiment.plannedStartAt >= experiment.plannedEndAt) {
      context.addIssue({
        code: "custom",
        path: ["plannedEndAt"],
        message: "La fin planifiée doit suivre le début",
      });
    }

    if (new Set(experiment.productIds).size !== experiment.productIds.length) {
      context.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Un produit ne peut être sélectionné qu'une fois",
      });
    }

    const metrics = [
      experiment.primaryMetric,
      ...experiment.secondaryMetrics,
      ...experiment.guardrailMetrics,
    ];
    if (new Set(metrics).size !== metrics.length) {
      context.addIssue({
        code: "custom",
        path: ["secondaryMetrics"],
        message: "Chaque métrique doit avoir un seul rôle dans l'expérience",
      });
    }

    const needsProducts = [
      "tg_placement",
      "space_change",
      "price_change",
      "promotion",
      "assortment",
    ].includes(experiment.type);
    if (
      needsProducts &&
      experiment.productIds.length === 0 &&
      experiment.family === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Sélectionnez au moins un produit ou une famille",
      });
    }

    if (
      experiment.type === "tg_placement" &&
      experiment.treatmentPlan.fixtureId === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["treatmentPlan", "fixtureId"],
        message: "Une expérience TG doit identifier la tête de gondole",
      });
    }
  });
export type ExperimentDefinition = z.infer<typeof experimentDefinitionSchema>;

export const experimentFixtureOptionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["island", "endcap", "wall", "bin"]),
});
export type ExperimentFixtureOption = z.infer<
  typeof experimentFixtureOptionSchema
>;

export const experimentControlStoreOptionSchema = z.object({
  id: storeIdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
});
export type ExperimentControlStoreOption = z.infer<
  typeof experimentControlStoreOptionSchema
>;

export const experimentSchema = experimentDefinitionSchema.safeExtend({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  departmentId: mongoIdSchema,
  status: experimentStatusSchema,
  ownerUserId: z.string().min(1),
  treatmentActual: experimentTreatmentActualSchema.nullable(),
  actualStartAt: z.iso.datetime().nullable(),
  actualEndAt: z.iso.datetime().nullable(),
  linkedDecisionIds: z.array(mongoIdSchema),
  definitionFrozenAt: z.iso.datetime().nullable(),
  definitionFrozenBy: z.string().min(1).nullable(),
  completionNotes: z.string().trim().max(2_000).nullable(),
  createdBy: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  plannedAt: z.iso.datetime().nullable(),
  startedAt: z.iso.datetime().nullable(),
  awaitingDataAt: z.iso.datetime().nullable(),
  analyzedAt: z.iso.datetime().nullable(),
  concludedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type Experiment = z.infer<typeof experimentSchema>;

export const experimentCreateInputSchema = experimentDefinitionSchema.safeExtend({
  idempotencyKey: z.uuid(),
});
export type ExperimentCreateInput = z.infer<
  typeof experimentCreateInputSchema
>;

export const experimentUpdateInputSchema = experimentDefinitionSchema.safeExtend({
  idempotencyKey: z.uuid(),
  basedOnUpdatedAt: z.iso.datetime(),
  action: z.enum(["save", "plan", "cancel"]),
});
export type ExperimentUpdateInput = z.infer<
  typeof experimentUpdateInputSchema
>;

export const experimentStartInputSchema = z.object({
  idempotencyKey: z.uuid(),
  basedOnUpdatedAt: z.iso.datetime(),
  actualStartAt: z.iso.datetime().optional(),
  treatmentActual: experimentTreatmentActualSchema,
});
export type ExperimentStartInput = z.infer<
  typeof experimentStartInputSchema
>;

export const experimentFinishInputSchema = z.object({
  idempotencyKey: z.uuid(),
  basedOnUpdatedAt: z.iso.datetime(),
  actualEndAt: z.iso.datetime().optional(),
  completionNotes: z.string().trim().max(2_000).nullable(),
  additionalConfounders: z.array(z.string().trim().min(1).max(500)).max(30),
});
export type ExperimentFinishInput = z.infer<
  typeof experimentFinishInputSchema
>;

export const experimentResponseSchema = z.object({
  experiment: experimentSchema,
  requestId: z.uuid(),
});

export const experimentsResponseSchema = z.object({
  experiments: z.array(experimentSchema),
  requestId: z.uuid(),
});
