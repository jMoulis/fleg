import { describe, expect, it } from "vitest";

import {
  calculateDashboard,
  calculateProductMetrics,
  shiftMonth,
} from "@/domain/analytics/calculations";
import { defaultAnalyticsConfig } from "@/domain/analytics/schemas";

describe("analytics calculations", () => {
  it("shifts periods across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("calculates dashboard money and ratios from cents", () => {
    const dashboard = calculateDashboard({
      periodKey: "2026-08",
      facts: [
        {
          productId: "66d000000000000000000001",
          periodKey: "2026-08",
          quantity: 10,
          revenueCents: 10_000,
          marginCents: 3_000,
        },
      ],
      priorYearFacts: [
        {
          productId: "66d000000000000000000001",
          periodKey: "2025-08",
          quantity: 8,
          revenueCents: 8_000,
          marginCents: 2_000,
        },
      ],
      dataRevision: 2,
      config: defaultAnalyticsConfig,
    });

    expect(dashboard).toMatchObject({
      revenueCents: 10_000,
      marginRatio: 0.3,
      yearOverYearRatio: 0.25,
    });
  });

  it("neutralizes seasonality below the configured base", () => {
    const productId = "66d000000000000000000001";
    const products = calculateProductMetrics({
      periodKey: "2026-08",
      facts: [
        { productId, periodKey: "2026-08", quantity: 2, revenueCents: 2000, marginCents: 500 },
        { productId, periodKey: "2026-07", quantity: 1, revenueCents: 1000, marginCents: 250 },
        { productId, periodKey: "2025-08", quantity: 1, revenueCents: 1800, marginCents: 400 },
        { productId, periodKey: "2025-07", quantity: 1, revenueCents: 900, marginCents: 200 },
      ],
      labelsByProductId: new Map([[productId, "Banane"]]),
      config: defaultAnalyticsConfig,
    });

    expect(products[0]).toMatchObject({
      rawSeasonalityIndex: 2,
      retainedSeasonalityIndex: 1,
      forecastRevenueCents: 1000,
      confidence: "medium",
    });
  });

  it("classifies products with configurable ABC thresholds", () => {
    const facts = [60, 25, 15].map((share, index) => ({
      productId: `66d00000000000000000000${index + 1}`,
      periodKey: "2026-08",
      quantity: 1,
      revenueCents: share * 100,
      marginCents: share * 25,
    }));
    const products = calculateProductMetrics({
      periodKey: "2026-08",
      facts,
      labelsByProductId: new Map(
        facts.map((fact, index) => [fact.productId, `Produit ${index + 1}`]),
      ),
      config: defaultAnalyticsConfig,
    });

    expect(products.map((product) => product.abcClass)).toEqual(["A", "B", "C"]);
  });
});
