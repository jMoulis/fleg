import { describe, expect, it } from "vitest";

import {
  calculateNetworkDashboard,
  type NetworkSalesFact,
  type NetworkStoreInput,
} from "@/domain/network/calculations";

const storeAId = "66d000000000000000000001";
const storeBId = "66d000000000000000000002";
const productId = "66d000000000000000000010";

function store(
  values: Partial<NetworkStoreInput> & Pick<NetworkStoreInput, "storeId" | "name">,
): NetworkStoreInput {
  const { storeId, name, ...overrides } = values;

  return {
    storeId,
    name,
    code: name.toUpperCase(),
    dataRevision: 1,
    markdownCents: 1_000,
    targetRevenueCents: 100_000,
    effectiveCommercialWidthM: 10,
    geometryConfirmed: true,
    prioritizedActionCount: 0,
    ...overrides,
  };
}

function fact(
  storeId: string,
  periodKey: string,
  revenueCents: number,
): NetworkSalesFact {
  return {
    storeId,
    productId,
    periodKey,
    quantity: 10,
    revenueCents,
    marginCents: Math.round(revenueCents * 0.3),
  };
}

describe("network calculations", () => {
  it("consolidates the network and ranks normalized productivity, not raw revenue", () => {
    const dashboard = calculateNetworkDashboard({
      organizationId: "org-a",
      periodKey: "2026-08",
      stores: [
        store({ storeId: storeAId, name: "Alpha", effectiveCommercialWidthM: 20 }),
        store({ storeId: storeBId, name: "Bravo", effectiveCommercialWidthM: 5 }),
      ],
      facts: [
        fact(storeAId, "2026-08", 200_000),
        fact(storeBId, "2026-08", 150_000),
        fact(storeAId, "2025-08", 180_000),
        fact(storeBId, "2025-08", 120_000),
      ],
    });

    expect(dashboard).not.toBeNull();
    if (!dashboard) throw new Error("Le tableau réseau devait être calculé");
    expect(dashboard.revenueCents).toBe(350_000);
    expect(dashboard.normalization.rawRevenueFallbackUsed).toBe(false);
    expect(dashboard.stores.map(({ storeId }) => storeId)).toEqual([
      storeBId,
      storeAId,
    ]);
    expect(dashboard.stores[0]).toMatchObject({
      normalizedRank: 1,
      revenuePerEffectiveMeterCents: 30_000,
    });
    expect(dashboard.stores[1]).toMatchObject({
      normalizedRank: 2,
      revenuePerEffectiveMeterCents: 10_000,
    });
  });

  it("keeps incomplete network totals unknown instead of treating missing coverage as zero", () => {
    const dashboard = calculateNetworkDashboard({
      organizationId: "org-a",
      periodKey: "2026-08",
      stores: [
        store({ storeId: storeAId, name: "Alpha" }),
        store({
          storeId: storeBId,
          name: "Bravo",
          markdownCents: null,
          targetRevenueCents: null,
        }),
      ],
      facts: [
        fact(storeAId, "2026-08", 100_000),
        fact(storeBId, "2026-08", 90_000),
        fact(storeAId, "2025-08", 80_000),
      ],
    });

    expect(dashboard).not.toBeNull();
    if (!dashboard) throw new Error("Le tableau réseau devait être calculé");
    expect(dashboard).toMatchObject({
      markdownCents: null,
      targetRevenueCents: null,
      priorYearRevenueCents: null,
      markdownCoverageStoreCount: 1,
      targetCoverageStoreCount: 1,
      priorYearCoverageStoreCount: 1,
    });
    expect(dashboard.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "MARKDOWN_COVERAGE_PARTIAL",
        "TARGET_COVERAGE_PARTIAL",
        "PRIOR_YEAR_COVERAGE_PARTIAL",
      ]),
    );
  });

  it("does not produce a raw-revenue fallback when geometry is unconfirmed", () => {
    const dashboard = calculateNetworkDashboard({
      organizationId: "org-a",
      periodKey: "2026-08",
      stores: [
        store({
          storeId: storeAId,
          name: "Alpha",
          geometryConfirmed: false,
        }),
      ],
      facts: [fact(storeAId, "2026-08", 200_000)],
    });

    expect(dashboard?.normalization).toEqual({
      basis: "effective_commercial_meter",
      eligibleStoreCount: 0,
      rawRevenueFallbackUsed: false,
    });
    expect(dashboard?.stores[0]?.normalizedRank).toBeNull();
    expect(dashboard?.warnings.map(({ code }) => code)).toContain(
      "NORMALIZATION_COVERAGE_PARTIAL",
    );
  });

  it("returns no dashboard instead of zero totals when the period has no observed sales", () => {
    expect(
      calculateNetworkDashboard({
        organizationId: "org-a",
        periodKey: "2026-08",
        stores: [store({ storeId: storeAId, name: "Alpha" })],
        facts: [fact(storeAId, "2025-08", 100_000)],
      }),
    ).toBeNull();
  });
});
