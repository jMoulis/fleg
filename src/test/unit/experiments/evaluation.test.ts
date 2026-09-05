import { describe, expect, it } from "vitest";

import {
  baselineEngineConfigSchema,
  buildComparablePeriodBaseline,
  defaultBaselineEngineConfig,
  type BaselineSalesFact,
} from "@/domain/experiments/baseline";
import { calculateExperimentEvaluation } from "@/domain/experiments/evaluation";
import { defaultEvaluationEngineConfig } from "@/domain/experiments/evaluation-schemas";
import type { Experiment } from "@/domain/experiments/schemas";
import type { MarkdownFact } from "@/domain/markdown/schemas";

const productId = "66d000000000000000000101";
const controlProductId = "66d000000000000000000102";

function salesFact(input: {
  periodKey: string;
  revenueCents: number;
  marginCents: number;
  quantity: number;
  productId?: string;
}): BaselineSalesFact {
  return {
    ...input,
    productId: input.productId ?? productId,
  };
}

function markdownFact(periodKey: string, amountCents: number): MarkdownFact {
  return {
    id: `66d0000000000000000002${periodKey.slice(-1)}`,
    organizationId: "org-a",
    storeId: "66d000000000000000000001",
    departmentId: "66d000000000000000000010",
    productId,
    occurredOn: `${periodKey}-15`,
    periodKey,
    amountCents,
    quantity: null,
    reason: "quality",
    notes: null,
    source: "manual",
    createdBy: "manager-a",
    createdAt: "2026-05-31T18:00:00.000Z",
  };
}

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: "66d000000000000000000201",
    organizationId: "org-a",
    storeId: "66d000000000000000000001",
    departmentId: "66d000000000000000000010",
    title: "Banane vrac en TG1",
    hypothesis: "La TG augmente le CA et la marge.",
    type: "tg_placement",
    status: "awaiting_data",
    ownerUserId: "manager-a",
    productIds: [productId],
    family: null,
    treatmentPlan: {
      summary: "Installer la banane en TG1.",
      fixtureId: "endcap-1",
      expectedChange: "Plus de visibilité.",
      instructions: [],
    },
    treatmentActual: {
      summary: "Banane installée en TG1.",
      fixtureId: "endcap-1",
      implementationNotes: null,
      deviations: [],
    },
    plannedStartAt: "2026-05-01T00:00:00.000Z",
    plannedEndAt: "2026-05-31T23:59:59.999Z",
    actualStartAt: "2026-05-01T08:00:00.000Z",
    actualEndAt: "2026-05-31T18:00:00.000Z",
    primaryMetric: "revenue",
    secondaryMetrics: ["gross_margin_cents"],
    guardrailMetrics: ["markdown_cents"],
    baselineConfig: {
      method: "prior_comparable_periods",
      comparablePeriods: 4,
      trendNormalization: false,
      controlStoreIds: [],
    },
    expectedRelativeEffect: 0.08,
    explicitCostsCents: 300,
    confounders: [],
    linkedCommercialEventId: null,
    linkedRecommendationId: null,
    linkedDecisionIds: [],
    definitionFrozenAt: "2026-05-01T08:00:00.000Z",
    definitionFrozenBy: "manager-a",
    completionNotes: null,
    createdBy: "manager-a",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-05-31T18:00:00.000Z",
    plannedAt: "2026-04-02T08:00:00.000Z",
    startedAt: "2026-05-01T08:00:00.000Z",
    awaitingDataAt: "2026-05-31T18:00:00.000Z",
    analyzedAt: null,
    concludedAt: null,
    archivedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function facts(input?: {
  baselineRevenueCents?: number;
  testRevenueCents?: number;
}): BaselineSalesFact[] {
  const baselineRevenue = input?.baselineRevenueCents ?? 10_000;
  const testRevenue = input?.testRevenueCents ?? 12_000;
  const periods = ["2026-01", "2026-02", "2026-03", "2026-04"];
  return [
    ...periods.flatMap((periodKey) => [
      salesFact({
        periodKey,
        revenueCents: baselineRevenue,
        marginCents: 2_000,
        quantity: 100,
      }),
      salesFact({
        periodKey,
        productId: controlProductId,
        revenueCents: 100_000,
        marginCents: 20_000,
        quantity: 1_000,
      }),
    ]),
    salesFact({
      periodKey: "2026-05",
      revenueCents: testRevenue,
      marginCents: 3_000,
      quantity: 120,
    }),
    salesFact({
      periodKey: "2026-05",
      productId: controlProductId,
      revenueCents: 100_000,
      marginCents: 20_000,
      quantity: 1_000,
    }),
  ];
}

function baseline(salesFacts: BaselineSalesFact[], minimumRevenue = 1_000) {
  return buildComparablePeriodBaseline({
    method: "prior_comparable_periods",
    testStartAt: "2026-05-01T08:00:00.000Z",
    testEndAt: "2026-05-31T18:00:00.000Z",
    productIds: [productId],
    primaryMetric: "revenue",
    metrics: ["revenue", "gross_margin_cents", "markdown_cents"],
    comparablePeriods: 4,
    trendNormalization: false,
    facts: salesFacts,
    dataRevision: 8,
    config: baselineEngineConfigSchema.parse({
      ...defaultBaselineEngineConfig,
      minimumRelativeRevenueCents: minimumRevenue,
      minimumRelativeMarginCents: 500,
      minimumRelativeQuantity: 5,
    }),
  });
}

describe("experiment evaluation", () => {
  it("calculates actual, expected, uplift and complete incremental economics", () => {
    const salesFacts = facts();
    const result = calculateExperimentEvaluation({
      experiment: experiment(),
      baseline: baseline(salesFacts),
      salesFacts,
      markdownFacts: [
        markdownFact("2026-01", 100),
        markdownFact("2026-02", 100),
        markdownFact("2026-03", 100),
        markdownFact("2026-04", 100),
        markdownFact("2026-05", 200),
      ],
      config: defaultEvaluationEngineConfig,
    });

    expect(result.metrics.find(({ metric }) => metric === "revenue")).toMatchObject({
      actual: 12_000,
      expectedWithoutTest: 10_000,
      absoluteUplift: 2_000,
      relativeUplift: 0.2,
    });
    expect(result.economics).toMatchObject({
      incrementalGrossMarginCents: 1_000,
      actualMarkdownCents: 200,
      expectedMarkdownCents: 100,
      incrementalMarkdownCents: 100,
      explicitCostsCents: 300,
      netIncrementalValueCents: 600,
      complete: true,
      missingComponents: [],
    });
    expect(result.evidenceQuality.grade).toBe("medium");
  });

  it("keeps absolute uplift but hides relative uplift on a small base", () => {
    const salesFacts = facts({ baselineRevenueCents: 500, testRevenueCents: 600 });
    const result = calculateExperimentEvaluation({
      experiment: experiment(),
      baseline: baseline(salesFacts, 1_000),
      salesFacts,
      markdownFacts: [],
      config: defaultEvaluationEngineConfig,
    });
    const revenue = result.metrics.find(({ metric }) => metric === "revenue");

    expect(revenue?.absoluteUplift).toBe(100);
    expect(revenue?.relativeUplift).toBeNull();
    expect(revenue?.warnings[0]).toContain("dénominateur");
  });

  it("does not invent a complete net value when markdown or costs are unknown", () => {
    const salesFacts = facts();
    const result = calculateExperimentEvaluation({
      experiment: experiment({ explicitCostsCents: null }),
      baseline: baseline(salesFacts),
      salesFacts,
      markdownFacts: [],
      config: defaultEvaluationEngineConfig,
    });

    expect(result.economics.complete).toBe(false);
    expect(result.economics.netIncrementalValueCents).toBeNull();
    expect(result.economics.knownComponentsValueCents).toBe(1_000);
    expect(result.economics.missingComponents).toEqual([
      "markdown",
      "explicit_costs",
    ]);
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "MARKDOWN_DATA_MISSING",
        "EXPLICIT_COSTS_UNKNOWN",
      ]),
    );
  });

  it("lowers evidence quality when execution and context are confounded", () => {
    const salesFacts = facts();
    const current = experiment({
      treatmentActual: {
        summary: "Installation partielle.",
        fixtureId: "endcap-1",
        implementationNotes: null,
        deviations: ["Prix modifié", "Rupture partielle"],
      },
      confounders: ["Travaux", "Météo inhabituelle"],
    });
    const result = calculateExperimentEvaluation({
      experiment: current,
      baseline: baseline(salesFacts),
      salesFacts,
      markdownFacts: [],
      config: defaultEvaluationEngineConfig,
    });

    expect(result.evidenceQuality.grade).toBe("low");
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "EXECUTION_DEVIATIONS",
        "CONFOUNDERS_RECORDED",
      ]),
    );
  });
});
