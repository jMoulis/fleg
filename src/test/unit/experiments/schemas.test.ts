import { describe, expect, it } from "vitest";

import {
  experimentCreateInputSchema,
  experimentFinishInputSchema,
  experimentStartInputSchema,
} from "@/domain/experiments/schemas";

const base = {
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  title: "Banane vrac en TG1",
  hypothesis: "La TG1 augmente le CA sans dégrader la marge ni la démarque.",
  type: "tg_placement" as const,
  productIds: ["66d000000000000000000101"],
  family: null,
  treatmentPlan: {
    summary: "Déplacer la banane vrac sur la TG1 pendant une semaine.",
    fixtureId: "endcap-1",
    expectedChange: "Visibilité et volume exposé supérieurs.",
    instructions: ["Conserver le prix habituel"],
  },
  plannedStartAt: "2026-09-07T06:00:00.000Z",
  plannedEndAt: "2026-09-14T06:00:00.000Z",
  primaryMetric: "revenue" as const,
  secondaryMetrics: ["gross_margin_cents" as const],
  guardrailMetrics: ["markdown_cents" as const],
  baselineConfig: {
    method: "prior_comparable_periods" as const,
    comparablePeriods: 4,
    trendNormalization: true,
    controlStoreIds: [],
  },
  expectedRelativeEffect: 0.08,
  explicitCostsCents: 1_500,
  confounders: [],
  linkedCommercialEventId: null,
  linkedRecommendationId: null,
};

describe("experiment schemas", () => {
  it("accepts the Banana TG1 definition with explicit baseline parameters", () => {
    expect(experimentCreateInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a TG test without a fixture and a product-scoped test without scope", () => {
    expect(
      experimentCreateInputSchema.safeParse({
        ...base,
        productIds: [],
        treatmentPlan: { ...base.treatmentPlan, fixtureId: null },
      }).success,
    ).toBe(false);
  });

  it("rejects overlapping metric roles and reversed dates", () => {
    expect(
      experimentCreateInputSchema.safeParse({
        ...base,
        plannedStartAt: base.plannedEndAt,
        secondaryMetrics: ["revenue"],
      }).success,
    ).toBe(false);
  });

  it("requires authorized control-store configuration only for control methods", () => {
    expect(
      experimentCreateInputSchema.safeParse({
        ...base,
        baselineConfig: {
          ...base.baselineConfig,
          method: "control_store",
        },
      }).success,
    ).toBe(false);
    expect(
      experimentCreateInputSchema.safeParse({
        ...base,
        baselineConfig: {
          ...base.baselineConfig,
          method: "control_store",
          controlStoreIds: ["66d000000000000000000002"],
          trendNormalization: false,
        },
      }).success,
    ).toBe(true);
  });

  it("validates start and finish command boundaries", () => {
    expect(
      experimentStartInputSchema.safeParse({
        idempotencyKey: base.idempotencyKey,
        basedOnUpdatedAt: "2026-09-01T08:00:00.000Z",
        treatmentActual: {
          summary: "Banane installée sur TG1.",
          fixtureId: "endcap-1",
          implementationNotes: null,
          deviations: [],
        },
      }).success,
    ).toBe(true);
    expect(
      experimentFinishInputSchema.safeParse({
        idempotencyKey: base.idempotencyKey,
        basedOnUpdatedAt: "2026-09-07T06:00:00.000Z",
        completionNotes: null,
        additionalConfounders: ["Travaux devant le rayon"],
      }).success,
    ).toBe(true);
  });
});
