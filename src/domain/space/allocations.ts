import {
  allocationSummarySchema,
  allocationValidationIssueSchema,
  shelfCapacitySchema,
  type AllocationConfig,
  type AllocationLine,
  type AllocationProduct,
  type AllocationSummary,
  type AllocationValidationIssue,
  type ShelfCapacity,
} from "@/domain/space/allocation-schemas";
import type { LayoutVersion } from "@/domain/space/schemas";

function roundMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

export function flattenLayoutCapacity(
  layout: Pick<LayoutVersion, "fixtures">,
): ShelfCapacity[] {
  return layout.fixtures.flatMap((fixture) =>
    fixture.faces.flatMap((face) =>
      face.modules.flatMap((sellingModule) =>
        sellingModule.shelves.map((shelf) =>
          shelfCapacitySchema.parse({
            shelfId: shelf.id,
            shelfLabel: shelf.label,
            fixtureId: fixture.id,
            fixtureName: fixture.name,
            faceId: face.id,
            faceLabel: face.label,
            moduleId: sellingModule.id,
            moduleLabel: sellingModule.label,
            modulePosition: sellingModule.position,
            capacityWidthM: shelf.widthM,
            effectiveFactor:
              face.trafficWeight *
              face.visibilityWeight *
              shelf.commercialWeight,
          }),
        ),
      ),
    ),
  );
}

export function summarizeAllocations(input: {
  capacities: ShelfCapacity[];
  allocations: AllocationLine[];
}): AllocationSummary {
  const capacityByShelfId = new Map(
    input.capacities.map((capacity) => [capacity.shelfId, capacity]),
  );
  const allocatedByShelfId = new Map<string, number>();
  let effectiveAllocatedWidthM = 0;

  for (const allocation of input.allocations) {
    allocatedByShelfId.set(
      allocation.shelfId,
      (allocatedByShelfId.get(allocation.shelfId) ?? 0) +
        allocation.facingWidthM,
    );
    const capacity = capacityByShelfId.get(allocation.shelfId);
    if (capacity) {
      effectiveAllocatedWidthM +=
        allocation.facingWidthM * capacity.effectiveFactor;
    }
  }

  const capacityWidthM = input.capacities.reduce(
    (total, capacity) => total + capacity.capacityWidthM,
    0,
  );
  const allocatedWidthM = [...allocatedByShelfId.values()].reduce(
    (total, allocated) => total + allocated,
    0,
  );
  const overflowShelfIds = input.capacities
    .filter(
      (capacity) =>
        (allocatedByShelfId.get(capacity.shelfId) ?? 0) >
        capacity.capacityWidthM + 0.000_1,
    )
    .map((capacity) => capacity.shelfId);

  return allocationSummarySchema.parse({
    capacityWidthM: roundMetric(capacityWidthM),
    allocatedWidthM: roundMetric(allocatedWidthM),
    remainingWidthM: roundMetric(capacityWidthM - allocatedWidthM),
    effectiveAllocatedWidthM: roundMetric(effectiveAllocatedWidthM),
    utilizationRatio:
      capacityWidthM === 0
        ? 0
        : roundMetric(allocatedWidthM / capacityWidthM),
    allocationCount: input.allocations.length,
    lockedCount: input.allocations.filter((allocation) => allocation.locked)
      .length,
    overflowShelfIds,
  });
}

export function validateAllocationDraft(input: {
  capacities: ShelfCapacity[];
  allocations: AllocationLine[];
  config: AllocationConfig;
  authorizedProductIds?: Set<string>;
}): AllocationValidationIssue[] {
  const capacityByShelfId = new Map(
    input.capacities.map((capacity) => [capacity.shelfId, capacity]),
  );
  const allocatedByShelfId = new Map<string, number>();
  const issues: AllocationValidationIssue[] = [];

  for (const allocation of input.allocations) {
    const capacity = capacityByShelfId.get(allocation.shelfId);

    if (!capacity) {
      issues.push(
        allocationValidationIssueSchema.parse({
          code: "UNKNOWN_SHELF",
          shelfId: allocation.shelfId,
          productId: allocation.productId,
          message: "Le niveau n'appartient pas à cette version du plan",
        }),
      );
      continue;
    }

    if (
      input.authorizedProductIds &&
      !input.authorizedProductIds.has(allocation.productId)
    ) {
      issues.push(
        allocationValidationIssueSchema.parse({
          code: "UNKNOWN_PRODUCT",
          shelfId: allocation.shelfId,
          productId: allocation.productId,
          message: "Le produit n'appartient pas à ce magasin",
        }),
      );
    }

    if (allocation.facingWidthM < input.config.minimumFacingWidthM) {
      issues.push(
        allocationValidationIssueSchema.parse({
          code: "BELOW_MINIMUM_FACING",
          shelfId: allocation.shelfId,
          productId: allocation.productId,
          message: `Le facing doit mesurer au moins ${input.config.minimumFacingWidthM} m`,
        }),
      );
    }

    allocatedByShelfId.set(
      allocation.shelfId,
      (allocatedByShelfId.get(allocation.shelfId) ?? 0) +
        allocation.facingWidthM,
    );
  }

  for (const [shelfId, allocatedWidthM] of allocatedByShelfId) {
    const capacity = capacityByShelfId.get(shelfId);
    if (capacity && allocatedWidthM > capacity.capacityWidthM + 0.000_1) {
      issues.push(
        allocationValidationIssueSchema.parse({
          code: "SHELF_CAPACITY_EXCEEDED",
          shelfId,
          productId: null,
          message: `Capacité dépassée de ${roundMetric(allocatedWidthM - capacity.capacityWidthM)} m`,
        }),
      );
    }
  }

  return issues;
}

function productScore(product: AllocationProduct): number {
  const projectedRevenueCents =
    product.forecastRevenueCents ?? product.revenueCents ?? 0;
  const marginRatio = Math.max(product.marginRatio ?? 0, 0);

  return Math.max(1, projectedRevenueCents * marginRatio);
}

function roundFacing(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

function floorToFacingIncrement(
  value: number,
  minimum: number,
  increment: number,
): number {
  const stepped =
    Math.floor((value + Number.EPSILON) / increment) * increment;
  return roundFacing(Math.max(minimum, stepped));
}

export function buildHeuristicAllocationDraft(input: {
  capacities: ShelfCapacity[];
  products: AllocationProduct[];
  currentAllocations: AllocationLine[];
  config: AllocationConfig;
}): AllocationLine[] {
  const products = [...input.products].sort((first, second) => {
    const scoreDifference = productScore(second) - productScore(first);
    return scoreDifference || first.label.localeCompare(second.label, "fr");
  });
  const lockedAllocations = input.currentAllocations.filter(
    (allocation) => allocation.locked,
  );
  const lockedByShelfId = new Map<string, AllocationLine[]>();

  for (const allocation of lockedAllocations) {
    lockedByShelfId.set(allocation.shelfId, [
      ...(lockedByShelfId.get(allocation.shelfId) ?? []),
      allocation,
    ]);
  }

  if (products.length === 0) {
    return lockedAllocations;
  }

  const generated: AllocationLine[] = [];
  let productCursor = 0;

  for (const capacity of input.capacities) {
    const shelfLocked = lockedByShelfId.get(capacity.shelfId) ?? [];
    const lockedWidthM = shelfLocked.reduce(
      (total, allocation) => total + allocation.facingWidthM,
      0,
    );
    const availableWidthM = roundFacing(
      Math.max(0, capacity.capacityWidthM - lockedWidthM),
    );
    const maximumProductCount = Math.floor(
      (availableWidthM + 0.000_1) / input.config.minimumFacingWidthM,
    );
    const productCount = Math.min(
      input.config.targetProductsPerShelf,
      maximumProductCount,
      products.length,
    );

    if (productCount === 0) {
      continue;
    }

    const lockedProductIds = new Set(
      shelfLocked.map((allocation) => allocation.productId),
    );
    const selected: AllocationProduct[] = [];
    let attempts = 0;

    while (selected.length < productCount && attempts < products.length * 2) {
      const product = products[productCursor % products.length];
      productCursor += 1;
      attempts += 1;

      if (
        product &&
        !lockedProductIds.has(product.id) &&
        !selected.some((candidate) => candidate.id === product.id)
      ) {
        selected.push(product);
      }
    }

    if (selected.length === 0) {
      continue;
    }

    const baseWidthM = input.config.minimumFacingWidthM;
    const distributableWidthM = Math.max(
      0,
      availableWidthM - baseWidthM * selected.length,
    );
    const totalScore = selected.reduce(
      (total, product) => total + productScore(product),
      0,
    );
    let assignedWidthM = 0;

    for (const [index, product] of selected.entries()) {
      const facingWidthM =
        index === selected.length - 1
          ? roundFacing(availableWidthM - assignedWidthM)
          : floorToFacingIncrement(
              baseWidthM +
                (distributableWidthM * productScore(product)) / totalScore,
              baseWidthM,
              input.config.facingIncrementM,
            );
      assignedWidthM += facingWidthM;
      generated.push({
        productId: product.id,
        shelfId: capacity.shelfId,
        facingWidthM,
        locked: false,
      });
    }
  }

  return [...lockedAllocations, ...generated];
}
