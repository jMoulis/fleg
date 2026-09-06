import { describe, expect, it } from "vitest";

import { calculateRecommendationOutcome } from "@/domain/decisions/outcomes";

describe("recommendation realized outcome", () => {
  it("calculates observed deltas without mixing in manager interpretation", () => {
    const outcome = calculateRecommendationOutcome({
      before: {
        periodKey: "2026-08",
        revenueCents: 10_000,
        marginCents: 2_000,
        quantity: 100,
        dataRevision: 4,
        source: "recommendation_snapshot",
      },
      after: {
        periodKey: "2026-09",
        revenueCents: 12_000,
        marginCents: 2_600,
        quantity: 110,
        dataRevision: 5,
        source: "salesFacts",
      },
      calculatedAt: "2026-10-01T08:00:00.000Z",
    });

    expect(outcome.observedResult).toMatchObject({
      revenueDeltaCents: 2_000,
      revenueDeltaRatio: 0.2,
      marginDeltaCents: 600,
      marginDeltaRatio: 0.3,
      quantityDelta: 10,
      quantityDeltaRatio: 0.1,
    });
    expect(outcome.limitations).toContain(
      "Comparaison descriptive avant/après : aucun effet causal ne peut être attribué sans groupe de contrôle.",
    );
    expect(outcome.limitations).toContain(
      "Les périodes ont été figées à partir de révisions de données différentes.",
    );
  });

  it("exposes unavailable relative changes when the before base is zero", () => {
    const outcome = calculateRecommendationOutcome({
      before: {
        periodKey: "2026-08",
        revenueCents: 0,
        marginCents: 0,
        quantity: 0,
        dataRevision: 4,
        source: "recommendation_snapshot",
      },
      after: {
        periodKey: "2026-09",
        revenueCents: 500,
        marginCents: 100,
        quantity: 5,
        dataRevision: 4,
        source: "salesFacts",
      },
      calculatedAt: "2026-10-01T08:00:00.000Z",
    });

    expect(outcome.observedResult.revenueDeltaRatio).toBeNull();
    expect(outcome.observedResult.marginDeltaRatio).toBeNull();
    expect(outcome.observedResult.quantityDeltaRatio).toBeNull();
    expect(outcome.limitations).toHaveLength(4);
  });
});
