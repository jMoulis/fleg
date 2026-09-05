import { describe, expect, it } from "vitest";

import {
  buildComparablePeriodBaseline,
  defaultBaselineEngineConfig,
  type BaselineSalesFact,
} from "@/domain/experiments/baseline";
import {
  buildControlRevisionKey,
  buildControlStoreBaseline,
} from "@/domain/experiments/control-baseline";

const treatmentProductId = "66d000000000000000000101";
const controlProductId = "66d000000000000000000201";
const controlStoreId = "66d000000000000000000002";

function fact(input: {
  productId: string;
  periodKey: string;
  revenueCents: number;
  marginCents?: number;
  quantity?: number;
}): BaselineSalesFact {
  return {
    productId: input.productId,
    periodKey: input.periodKey,
    revenueCents: input.revenueCents,
    marginCents: input.marginCents ?? Math.round(input.revenueCents * 0.3),
    quantity: input.quantity ?? input.revenueCents / 100,
  };
}

function primaryFacts(): BaselineSalesFact[] {
  return ["2026-01", "2026-02", "2026-03", "2026-04"].map(
    (periodKey) =>
      fact({
        productId: treatmentProductId,
        periodKey,
        revenueCents: 100_000,
      }),
  ).concat(
    fact({
      productId: treatmentProductId,
      periodKey: "2026-05",
      revenueCents: 130_000,
      marginCents: 39_000,
    }),
  );
}

function primaryBaseline(facts: BaselineSalesFact[]) {
  return buildComparablePeriodBaseline({
    method: "prior_comparable_periods",
    testStartAt: "2026-05-01T00:00:00.000Z",
    testEndAt: "2026-05-31T23:59:59.999Z",
    productIds: [treatmentProductId],
    primaryMetric: "revenue",
    metrics: ["revenue", "gross_margin_cents"],
    comparablePeriods: 4,
    trendNormalization: false,
    facts,
    dataRevision: 7,
    config: defaultBaselineEngineConfig,
  });
}

describe("control-store experiment baseline", () => {
  it("calculates additive difference-in-differences from treatment and control changes", () => {
    const treatmentFacts = primaryFacts();
    const controlFacts = ["2026-01", "2026-02", "2026-03", "2026-04"].map(
      (periodKey) =>
        fact({
          productId: controlProductId,
          periodKey,
          revenueCents: 200_000,
          marginCents: 60_000,
        }),
    ).concat(
      fact({
        productId: controlProductId,
        periodKey: "2026-05",
        revenueCents: 210_000,
        marginCents: 63_000,
      }),
    );
    const baseline = buildControlStoreBaseline({
      method: "difference_in_differences",
      primaryBaseline: primaryBaseline(treatmentFacts),
      treatmentFacts,
      treatmentProductIds: [treatmentProductId],
      controls: [
        {
          storeId: controlStoreId,
          storeName: "Magasin témoin",
          dataRevision: 4,
          requestedProductCount: 1,
          matchedProductIds: [controlProductId],
          facts: controlFacts,
        },
      ],
    });

    expect(baseline).toMatchObject({
      method: "difference_in_differences",
      readiness: "ready",
      expectedWithoutTest: { revenueCents: 110_000 },
      controlComparison: {
        includedStoreCount: 1,
        controlAverageChange: { revenueCents: 10_000 },
        effectEstimate: { revenueCents: 20_000 },
      },
    });
  });

  it("normalizes a direct control comparison by its relative pre/post trend", () => {
    const treatmentFacts = primaryFacts();
    const controlFacts = ["2026-01", "2026-02", "2026-03", "2026-04"].map(
      (periodKey) =>
        fact({
          productId: controlProductId,
          periodKey,
          revenueCents: 200_000,
          marginCents: 60_000,
        }),
    ).concat(
      fact({
        productId: controlProductId,
        periodKey: "2026-05",
        revenueCents: 210_000,
        marginCents: 63_000,
      }),
    );
    const baseline = buildControlStoreBaseline({
      method: "control_store",
      primaryBaseline: primaryBaseline(treatmentFacts),
      treatmentFacts,
      treatmentProductIds: [treatmentProductId],
      controls: [
        {
          storeId: controlStoreId,
          storeName: "Magasin témoin",
          dataRevision: 4,
          requestedProductCount: 1,
          matchedProductIds: [controlProductId],
          facts: controlFacts,
        },
      ],
    });

    expect(baseline.expectedWithoutTest?.revenueCents).toBe(105_000);
    expect(baseline.controlComparison?.effectEstimate?.revenueCents).toBe(
      25_000,
    );
  });

  it("excludes and explains a control with incomplete canonical product mapping", () => {
    const treatmentFacts = primaryFacts();
    const baseline = buildControlStoreBaseline({
      method: "control_store",
      primaryBaseline: primaryBaseline(treatmentFacts),
      treatmentFacts,
      treatmentProductIds: [treatmentProductId],
      controls: [
        {
          storeId: controlStoreId,
          storeName: "Magasin témoin",
          dataRevision: 4,
          requestedProductCount: 1,
          matchedProductIds: [],
          facts: treatmentFacts.map((item) => ({
            ...item,
            productId: controlProductId,
          })),
        },
      ],
    });

    expect(baseline.readiness).toBe("unavailable");
    expect(baseline.expectedWithoutTest).toBeNull();
    expect(baseline.controlComparison?.stores[0]).toMatchObject({
      eligible: false,
      matchedProductCount: 0,
    });
    expect(baseline.warnings.map(({ code }) => code)).toContain(
      "CONTROL_PRODUCT_MAPPING_INCOMPLETE",
    );
  });

  it("builds a stable revision identity independent of control order", () => {
    const second = "66d000000000000000000003";
    expect(
      buildControlRevisionKey([
        { storeId: second, dataRevision: 9 },
        { storeId: controlStoreId, dataRevision: 4 },
      ]),
    ).toBe(`${controlStoreId}:4|${second}:9`);
  });
});
