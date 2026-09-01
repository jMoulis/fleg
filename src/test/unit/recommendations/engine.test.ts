import { describe, expect, it } from "vitest";

import { productMetricSchema } from "@/domain/analytics/schemas";
import { buildRecommendation } from "@/domain/recommendations/engine";
import { defaultRecommendationConfig } from "@/domain/recommendations/schemas";

function metric(overrides: Record<string, unknown> = {}) {
  return productMetricSchema.parse({
    productId: "66d000000000000000000001",
    label: "Banane",
    periodKey: "2026-08",
    quantity: 10,
    revenueCents: 20_000,
    marginCents: 6_000,
    marginRatio: 0.3,
    priorYearRevenueCents: 18_000,
    yearOverYearRatio: 0.111,
    rawSeasonalityIndex: 1.2,
    retainedSeasonalityIndex: 1.2,
    forecastRevenueCents: 24_000,
    abcClass: "A",
    cumulativeRevenueShare: 0.5,
    confidence: "high",
    evidence: ["Historique complet"],
    ...overrides,
  });
}

function recommend(overrides: Record<string, unknown> = {}) {
  return buildRecommendation({
    organizationId: "org-a",
    storeId: "66d000000000000000000099",
    metric: metric(overrides),
    config: defaultRecommendationConfig,
    calculationVersion: "analytics-v1",
    inputRevision: 3,
    generatedAt: "2026-09-01T12:00:00.000Z",
  });
}

describe("recommendation engine", () => {
  it("proposes push with explicit component evidence", () => {
    const result = recommend();
    expect(result.type).toBe("PUSH");
    expect(result.status).toBe("draft");
    expect(result.evidence.map((item) => item.signal)).toContain(
      "seasonal_momentum",
    );
  });

  it("protects an A product with low margin instead of reducing blindly", () => {
    expect(recommend({ marginRatio: 0.18, marginCents: 3_600 }).type).toBe(
      "TRAFFIC_PROTECT",
    );
  });

  it("keeps low-confidence recommendations conservative", () => {
    expect(recommend({ confidence: "low" }).type).toBe("HOLD");
  });
});
