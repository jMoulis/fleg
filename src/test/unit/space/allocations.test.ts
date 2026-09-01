import { describe, expect, it } from "vitest";

import {
  allocationPlanCreateInputSchema,
  defaultAllocationConfig,
  type AllocationLine,
  type AllocationProduct,
} from "@/domain/space/allocation-schemas";
import {
  buildHeuristicAllocationDraft,
  flattenLayoutCapacity,
  summarizeAllocations,
  validateAllocationDraft,
} from "@/domain/space/allocations";
import { buildReferenceLayoutVersion } from "@/domain/space/reference-seed";

import referenceLayoutSource from "../../../../schemas/reference-layout.json";

const layout = buildReferenceLayoutVersion({
  source: referenceLayoutSource,
  id: "66d000000000000000000010",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  departmentId: "66d000000000000000000020",
  createdBy: "manager-a",
  createdAt: "2026-09-01T08:00:00.000Z",
}).layout;

const products: AllocationProduct[] = [
  {
    id: "66d000000000000000000101",
    label: "Banane",
    revenueCents: 120_000,
    marginCents: 30_000,
    marginRatio: 0.25,
    forecastRevenueCents: 130_000,
    abcClass: "A",
    confidence: "high",
  },
  {
    id: "66d000000000000000000102",
    label: "Pomme",
    revenueCents: 90_000,
    marginCents: 27_000,
    marginRatio: 0.3,
    forecastRevenueCents: 95_000,
    abcClass: "A",
    confidence: "medium",
  },
  {
    id: "66d000000000000000000103",
    label: "Poire",
    revenueCents: 50_000,
    marginCents: 12_000,
    marginRatio: 0.24,
    forecastRevenueCents: 48_000,
    abcClass: "B",
    confidence: "medium",
  },
];

describe("space allocations", () => {
  it("flattens the modular layout into allocatable shelf capacities", () => {
    const capacities = flattenLayoutCapacity(layout);
    const allocations = capacities.map((capacity, index) => ({
      productId: products[index % products.length]?.id ?? products[0]!.id,
      shelfId: capacity.shelfId,
      facingWidthM: capacity.capacityWidthM,
      locked: false,
    }));
    const summary = summarizeAllocations({ capacities, allocations });

    expect(capacities).toHaveLength(19);
    expect(summary).toMatchObject({
      capacityWidthM: 21.71,
      allocatedWidthM: 21.71,
      remainingWidthM: 0,
      effectiveAllocatedWidthM: 18.696,
      utilizationRatio: 1,
      overflowShelfIds: [],
    });
  });

  it("detects minimum-facing, foreign-product and overflow violations", () => {
    const capacities = flattenLayoutCapacity(layout);
    const shelf = capacities[0];

    if (!shelf) {
      throw new Error("Capacité de test absente");
    }

    const allocations: AllocationLine[] = [
      {
        productId: products[0]!.id,
        shelfId: shelf.shelfId,
        facingWidthM: 0.1,
        locked: false,
      },
      {
        productId: "66d000000000000000000199",
        shelfId: shelf.shelfId,
        facingWidthM: shelf.capacityWidthM,
        locked: false,
      },
    ];
    const issues = validateAllocationDraft({
      capacities,
      allocations,
      config: defaultAllocationConfig,
      authorizedProductIds: new Set(products.map((product) => product.id)),
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "BELOW_MINIMUM_FACING",
      "UNKNOWN_PRODUCT",
      "SHELF_CAPACITY_EXCEEDED",
    ]);
  });

  it("prepares an explainable draft without changing locked allocations", () => {
    const capacities = flattenLayoutCapacity(layout);
    const firstCapacity = capacities[0];

    if (!firstCapacity) {
      throw new Error("Capacité de test absente");
    }

    const locked: AllocationLine = {
      productId: products[2]!.id,
      shelfId: firstCapacity.shelfId,
      facingWidthM: 0.25,
      locked: true,
    };
    const allocations = buildHeuristicAllocationDraft({
      capacities,
      products,
      currentAllocations: [locked],
      config: defaultAllocationConfig,
    });
    const issues = validateAllocationDraft({
      capacities,
      allocations,
      config: defaultAllocationConfig,
      authorizedProductIds: new Set(products.map((product) => product.id)),
    });
    const summary = summarizeAllocations({ capacities, allocations });

    expect(allocations).toContainEqual(locked);
    expect(issues).toEqual([]);
    expect(summary.utilizationRatio).toBe(1);
    expect(summary.lockedCount).toBe(1);
  });

  it("rejects a duplicate product on the same shelf at the API boundary", () => {
    const capacity = flattenLayoutCapacity(layout)[0];

    if (!capacity) {
      throw new Error("Capacité de test absente");
    }

    const line = {
      productId: products[0]!.id,
      shelfId: capacity.shelfId,
      facingWidthM: 0.25,
      locked: false,
    };
    const result = allocationPlanCreateInputSchema.safeParse({
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      basedOnPlanVersion: 0,
      layoutVersionId: layout.id,
      name: "Allocation test",
      source: "manager",
      modelVersion: "manual-allocation-v1",
      config: defaultAllocationConfig,
      basis: {
        periodKey: "2025-12",
        calculationVersion: "analytics-v1",
        dataRevision: 1,
      },
      evidence: ["Saisie manager"],
      allocations: [line, line],
      note: "",
    });

    expect(result.success).toBe(false);
  });
});
