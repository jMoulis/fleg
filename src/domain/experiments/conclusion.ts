import * as z from "zod";

import {
  evidenceGradeSchema,
  experimentAnalysisSchema,
  type ExperimentAnalysis,
} from "@/domain/experiments/evaluation-schemas";
import {
  experimentMetricSchema,
  experimentSchema,
} from "@/domain/experiments/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const experimentVerdictSchema = z.enum([
  "winner",
  "promising",
  "neutral",
  "loser",
  "inconclusive",
]);
export type ExperimentVerdict = z.infer<typeof experimentVerdictSchema>;

export const experimentManagerDecisionSchema = z.enum([
  "roll_out",
  "repeat",
  "modify_and_repeat",
  "stop",
  "no_action",
]);
export type ExperimentManagerDecision = z.infer<
  typeof experimentManagerDecisionSchema
>;

export const experimentSystemEvidenceSummarySchema = z.object({
  suggestedVerdict: experimentVerdictSchema,
  primaryMetric: experimentMetricSchema,
  primaryRelativeUplift: z.number().finite().nullable(),
  evidenceGrade: evidenceGradeSchema,
  criticalGuardrailBreaches: z.array(experimentMetricSchema),
  economicResultComplete: z.boolean(),
  netIncrementalValueCents: z.number().int().safe().nullable(),
  reasons: z.array(z.string().min(1)).min(1),
});
export type ExperimentSystemEvidenceSummary = z.infer<
  typeof experimentSystemEvidenceSummarySchema
>;

export const experimentConclusionInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnUpdatedAt: z.iso.datetime(),
    analysisId: mongoIdSchema,
    managerVerdict: experimentVerdictSchema,
    managerDecision: experimentManagerDecisionSchema,
    rationale: z.string().trim().min(20).max(2_000),
    reusableTags: z
      .array(z.string().trim().min(2).max(50))
      .max(12),
  })
  .superRefine((input, context) => {
    if (new Set(input.reusableTags).size !== input.reusableTags.length) {
      context.addIssue({
        code: "custom",
        path: ["reusableTags"],
        message: "Chaque enseignement réutilisable doit être unique",
      });
    }
  });
export type ExperimentConclusionInput = z.infer<
  typeof experimentConclusionInputSchema
>;

export const experimentConclusionSchema = z.object({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  experimentId: mongoIdSchema,
  analysisId: mongoIdSchema,
  analysisVersion: z.number().int().positive(),
  active: z.literal(true),
  systemSuggestedVerdict: experimentVerdictSchema,
  systemEvidenceSummary: experimentSystemEvidenceSummarySchema,
  managerVerdict: experimentVerdictSchema,
  managerDecision: experimentManagerDecisionSchema,
  rationale: z.string().trim().min(20).max(2_000),
  reusableTags: z.array(z.string().trim().min(2).max(50)).max(12),
  actorUserId: z.string().min(1),
  idempotencyKey: z.uuid(),
  concludedAt: z.iso.datetime(),
});
export type ExperimentConclusion = z.infer<typeof experimentConclusionSchema>;

export const experimentConclusionResponseSchema = z.object({
  conclusion: experimentConclusionSchema,
  experiment: experimentSchema,
  requestId: z.uuid(),
});

export const experimentConclusionWithSnapshotsSchema = z.object({
  conclusion: experimentConclusionSchema,
  experimentSnapshot: experimentSchema,
  analysisSnapshot: experimentAnalysisSchema,
});

function normalizedRelativeEffect(
  metric: ExperimentAnalysis["experimentSnapshot"]["primaryMetric"],
  relativeUplift: number,
): number {
  return metric === "markdown_cents" ? -relativeUplift : relativeUplift;
}

export function suggestExperimentVerdict(
  analysis: ExperimentAnalysis,
): ExperimentSystemEvidenceSummary {
  const primary = analysis.metrics.find(
    ({ metric }) => metric === analysis.experimentSnapshot.primaryMetric,
  );
  const config = analysis.configSnapshot;
  const criticalGuardrailBreaches = analysis.experimentSnapshot.guardrailMetrics
    .filter((metric) => {
      const evaluation = analysis.metrics.find((item) => item.metric === metric);
      if (evaluation?.relativeUplift === null || !evaluation) return false;
      return metric === "markdown_cents"
        ? evaluation.relativeUplift > config.criticalGuardrailRelativeChange
        : evaluation.relativeUplift < -config.criticalGuardrailRelativeChange;
    });
  const economicLossIsMaterial =
    analysis.economics.complete &&
    analysis.economics.netIncrementalValueCents !== null &&
    analysis.economics.netIncrementalValueCents <
      -config.materialEconomicLossCents;

  let suggestedVerdict: ExperimentVerdict;
  const reasons: string[] = [];
  if (!primary || primary.relativeUplift === null) {
    suggestedVerdict = "inconclusive";
    reasons.push(
      "L’effet relatif du KPI principal n’est pas calculable avec un dénominateur suffisamment sûr.",
    );
  } else if (analysis.evidenceQuality.grade === "low") {
    suggestedVerdict = "inconclusive";
    reasons.push(
      "La qualité globale des preuves est trop limitée pour recommander une généralisation.",
    );
  } else {
    const effect = normalizedRelativeEffect(
      primary.metric,
      primary.relativeUplift,
    );
    if (economicLossIsMaterial) {
      suggestedVerdict = "loser";
      reasons.push(
        "La perte économique nette dépasse le seuil matériel configuré.",
      );
    } else if (criticalGuardrailBreaches.length > 0) {
      suggestedVerdict = "loser";
      reasons.push(
        "Au moins un garde-fou dépasse le seuil critique configuré.",
      );
    } else if (effect < -config.practicalRelativeUpliftThreshold) {
      suggestedVerdict = "loser";
      reasons.push(
        "Le KPI principal recule au-delà du seuil d’effet pratique configuré.",
      );
    } else if (Math.abs(effect) <= config.practicalRelativeUpliftThreshold) {
      suggestedVerdict = "neutral";
      reasons.push(
        "L’effet reste dans la zone neutre définie par le seuil pratique configuré.",
      );
    } else if (analysis.evidenceQuality.grade === "high") {
      suggestedVerdict = "winner";
      reasons.push(
        "Le KPI principal progresse au-delà du seuil pratique avec des preuves de qualité élevée.",
      );
    } else {
      suggestedVerdict = "promising";
      reasons.push(
        "L’effet est positif, mais le niveau de preuve invite à confirmer le résultat.",
      );
    }
  }

  if (!analysis.economics.complete) {
    reasons.push(
      "Le résultat économique est partiel et ne doit pas être interprété comme une valeur nette complète.",
    );
  }

  return experimentSystemEvidenceSummarySchema.parse({
    suggestedVerdict,
    primaryMetric: analysis.experimentSnapshot.primaryMetric,
    primaryRelativeUplift: primary?.relativeUplift ?? null,
    evidenceGrade: analysis.evidenceQuality.grade,
    criticalGuardrailBreaches,
    economicResultComplete: analysis.economics.complete,
    netIncrementalValueCents: analysis.economics.netIncrementalValueCents,
    reasons,
  });
}
