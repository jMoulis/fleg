import {
  observedRecommendationOutcomeSchema,
  type ObservedRecommendationOutcome,
} from "@/domain/decisions/follow-up-schemas";
import { safeRatio } from "@/domain/analytics/calculations";

export const recommendationOutcomeCalculationVersion =
  "recommendation-outcome-v1";

interface OutcomePeriodInput {
  periodKey: string;
  revenueCents: number;
  marginCents: number;
  quantity: number;
  dataRevision: number;
  source: "recommendation_snapshot" | "salesFacts";
}

export function calculateRecommendationOutcome(input: {
  before: OutcomePeriodInput;
  after: OutcomePeriodInput;
  calculatedAt: string;
}): {
  observedResult: ObservedRecommendationOutcome;
  limitations: string[];
} {
  const { before, after, calculatedAt } = input;
  const revenueDeltaCents = after.revenueCents - before.revenueCents;
  const marginDeltaCents = after.marginCents - before.marginCents;
  const quantityDelta = after.quantity - before.quantity;
  const limitations = [
    "Comparaison descriptive avant/après : aucun effet causal ne peut être attribué sans groupe de contrôle.",
  ];

  if (before.dataRevision !== after.dataRevision) {
    limitations.push(
      "Les périodes ont été figées à partir de révisions de données différentes.",
    );
  }
  if (before.revenueCents === 0) {
    limitations.push(
      "La variation relative du chiffre d’affaires est indisponible car le CA avant est nul.",
    );
  }
  if (before.marginCents === 0) {
    limitations.push(
      "La variation relative de marge est indisponible car la marge avant est nulle.",
    );
  }
  if (before.quantity === 0) {
    limitations.push(
      "La variation relative des quantités est indisponible car la quantité avant est nulle.",
    );
  }

  return {
    observedResult: observedRecommendationOutcomeSchema.parse({
      before: {
        ...before,
        marginRatio: safeRatio(before.marginCents, before.revenueCents),
        recordCount: 1,
      },
      after: {
        ...after,
        marginRatio: safeRatio(after.marginCents, after.revenueCents),
        recordCount: 1,
      },
      revenueDeltaCents,
      revenueDeltaRatio: safeRatio(revenueDeltaCents, before.revenueCents),
      marginDeltaCents,
      marginDeltaRatio: safeRatio(marginDeltaCents, before.marginCents),
      quantityDelta,
      quantityDeltaRatio: safeRatio(quantityDelta, before.quantity),
      calculationVersion: recommendationOutcomeCalculationVersion,
      calculatedAt,
    }),
    limitations,
  };
}
