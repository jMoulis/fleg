import { describe, expect, it } from "vitest";

import {
  baselineEngineConfigSchema,
  buildComparablePeriodBaseline,
  defaultBaselineEngineConfig,
  planMonthlyBaselineWindows,
  type BaselineSalesFact,
  type BaselineEngineConfig,
} from "@/domain/experiments/baseline";

const productId = "66d000000000000000000101";
const controlProductId = "66d000000000000000000102";

function config(
  overrides: Partial<BaselineEngineConfig> = {},
): BaselineEngineConfig {
  return baselineEngineConfigSchema.parse({
    ...defaultBaselineEngineConfig,
    minimumRelativeRevenueCents: 0,
    minimumRelativeMarginCents: 0,
    minimumRelativeQuantity: 0,
    ...overrides,
  });
}

function fact(input: {
  periodKey: string;
  revenueCents: number;
  product?: string;
  marginCents?: number;
  quantity?: number;
}): BaselineSalesFact {
  return {
    productId: input.product ?? productId,
    periodKey: input.periodKey,
    revenueCents: input.revenueCents,
    marginCents: input.marginCents ?? Math.round(input.revenueCents * 0.2),
    quantity: input.quantity ?? input.revenueCents / 100,
  };
}

function build(input: {
  facts: BaselineSalesFact[];
  comparablePeriods?: number;
  trendNormalization?: boolean;
  engineConfig?: BaselineEngineConfig;
}) {
  return buildComparablePeriodBaseline({
    method: "prior_comparable_periods",
    testStartAt: "2026-05-01T08:00:00.000Z",
    testEndAt: "2026-05-31T18:00:00.000Z",
    productIds: [productId],
    primaryMetric: "revenue",
    metrics: ["revenue", "gross_margin_cents", "quantity"],
    comparablePeriods: input.comparablePeriods ?? 4,
    trendNormalization: input.trendNormalization ?? false,
    facts: input.facts,
    dataRevision: 7,
    config: input.engineConfig ?? config(),
  });
}

describe("comparable-period baseline", () => {
  it("plans non-overlapping prior windows for a complete monthly test", () => {
    expect(
      planMonthlyBaselineWindows({
        testStartAt: "2026-05-01T08:00:00.000Z",
        testEndAt: "2026-06-30T18:00:00.000Z",
        comparablePeriods: 2,
      }),
    ).toMatchObject({
      aligned: true,
      testPeriodKeys: ["2026-05", "2026-06"],
      comparableWindows: [
        ["2026-03", "2026-04"],
        ["2026-01", "2026-02"],
      ],
    });
  });

  it("uses a median with four complete periods so one outlier does not dominate", () => {
    const baseline = build({
      facts: [
        fact({ periodKey: "2026-01", revenueCents: 10_000 }),
        fact({ periodKey: "2026-02", revenueCents: 11_000 }),
        fact({ periodKey: "2026-03", revenueCents: 9_000 }),
        fact({ periodKey: "2026-04", revenueCents: 80_000 }),
      ],
    });

    expect(baseline.aggregation).toBe("median");
    expect(baseline.baseline?.revenueCents).toBe(10_500);
    expect(baseline.availableComparablePeriods).toBe(4);
    expect(baseline.evidencePeriodKeys).toEqual([
      "2026-04",
      "2026-03",
      "2026-02",
      "2026-01",
    ]);
  });

  it("uses a mean with fewer than four comparable periods", () => {
    const baseline = build({
      comparablePeriods: 2,
      facts: [
        fact({ periodKey: "2026-03", revenueCents: 10_000 }),
        fact({ periodKey: "2026-04", revenueCents: 20_000 }),
      ],
      engineConfig: config({ minimumReliableComparablePeriods: 2 }),
    });

    expect(baseline.aggregation).toBe("mean");
    expect(baseline.baseline?.revenueCents).toBe(15_000);
    expect(baseline.readiness).toBe("ready");
  });

  it("excludes missing windows and exposes limited history", () => {
    const baseline = build({
      facts: [
        fact({ periodKey: "2026-02", revenueCents: 10_000 }),
        fact({ periodKey: "2026-04", revenueCents: 20_000 }),
      ],
    });

    expect(baseline.availableComparablePeriods).toBe(2);
    expect(baseline.baseline?.revenueCents).toBe(15_000);
    expect(baseline.readiness).toBe("limited");
    expect(baseline.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "INCOMPLETE_COMPARABLE_WINDOWS",
        "LIMITED_COMPARABLE_HISTORY",
      ]),
    );
  });

  it("guards relative uplift when the configured denominator is too small", () => {
    const baseline = build({
      comparablePeriods: 1,
      facts: [fact({ periodKey: "2026-04", revenueCents: 500, quantity: 1 })],
      engineConfig: config({
        minimumReliableComparablePeriods: 1,
        minimumRelativeRevenueCents: 1_000,
        minimumRelativeMarginCents: 200,
        minimumRelativeQuantity: 2,
      }),
    });

    expect(baseline.relativeComparisonEligible).toEqual({
      revenue: false,
      grossMargin: false,
      quantity: false,
    });
    expect(baseline.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "SMALL_REVENUE_DENOMINATOR",
        "SMALL_MARGIN_DENOMINATOR",
        "SMALL_QUANTITY_DENOMINATOR",
      ]),
    );
  });

  it("applies department trend only with a complete and stable control", () => {
    const facts = ["2026-02", "2026-03", "2026-04"].flatMap(
      (periodKey) => [
        fact({ periodKey, revenueCents: 10_000 }),
        fact({
          periodKey,
          product: controlProductId,
          revenueCents: 100_000,
        }),
      ],
    );
    facts.push(
      fact({ periodKey: "2026-05", revenueCents: 12_000 }),
      fact({
        periodKey: "2026-05",
        product: controlProductId,
        revenueCents: 120_000,
      }),
    );
    const baseline = build({
      comparablePeriods: 3,
      trendNormalization: true,
      facts,
      engineConfig: config({ minimumTrendControlRevenueCents: 10_000 }),
    });

    expect(baseline.trendNormalization).toMatchObject({
      applied: true,
      factor: 1.2,
      baselineControlRevenueCents: 100_000,
      testControlRevenueCents: 120_000,
      controlCoefficientOfVariation: 0,
    });
    expect(baseline.expectedWithoutTest?.revenueCents).toBe(12_000);
    expect(baseline.expectedWithoutTest?.departmentRevenueCents).toBe(110_000);
  });

  it("does not normalize against an unstable department control", () => {
    const controls = [50_000, 100_000, 150_000];
    const periods = ["2026-02", "2026-03", "2026-04"];
    const facts = periods.flatMap((periodKey, index) => [
      fact({ periodKey, revenueCents: 10_000 }),
      fact({
        periodKey,
        product: controlProductId,
        revenueCents: controls[index],
      }),
    ]);
    facts.push(
      fact({ periodKey: "2026-05", revenueCents: 10_000 }),
      fact({
        periodKey: "2026-05",
        product: controlProductId,
        revenueCents: 110_000,
      }),
    );
    const baseline = build({
      comparablePeriods: 3,
      trendNormalization: true,
      facts,
      engineConfig: config({
        minimumTrendControlRevenueCents: 10_000,
        maximumTrendControlCoefficientOfVariation: 0.1,
      }),
    });

    expect(baseline.trendNormalization.applied).toBe(false);
    expect(baseline.trendNormalization.factor).toBeNull();
    expect(baseline.warnings.map(({ code }) => code)).toContain(
      "TREND_CONTROL_UNSTABLE",
    );
  });

  it("refuses a weekly window while facts are monthly", () => {
    const baseline = buildComparablePeriodBaseline({
      method: "prior_comparable_periods",
      testStartAt: "2026-05-04T00:00:00.000Z",
      testEndAt: "2026-05-10T23:59:59.999Z",
      productIds: [productId],
      primaryMetric: "revenue",
      metrics: ["revenue"],
      comparablePeriods: 4,
      trendNormalization: false,
      facts: [],
      dataRevision: 7,
      config: config(),
    });

    expect(baseline.readiness).toBe("unavailable");
    expect(baseline.warnings[0].code).toBe("MONTHLY_WINDOW_REQUIRED");
  });
});

describe("baseline configuration", () => {
  it("rejects inverted trend bounds and an inconsistent robust threshold", () => {
    expect(
      baselineEngineConfigSchema.safeParse({
        ...defaultBaselineEngineConfig,
        minimumTrendFactor: 1.2,
        maximumTrendFactor: 0.8,
      }).success,
    ).toBe(false);
    expect(
      baselineEngineConfigSchema.safeParse({
        ...defaultBaselineEngineConfig,
        minimumReliableComparablePeriods: 5,
        robustAggregationMinimumPeriods: 4,
      }).success,
    ).toBe(false);
  });
});
