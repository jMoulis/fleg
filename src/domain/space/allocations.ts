import {
  allocationEconomicsSummarySchema,
  allocationProductEconomicsSchema,
  allocationSummarySchema,
  allocationValidationIssueSchema,
  shelfCapacitySchema,
  type AllocationConfig,
  type AllocationEconomicsSummary,
  type AllocationLine,
  type AllocationProduct,
  type AllocationProductEconomics,
  type AllocationSummary,
  type AllocationValidationIssue,
  type ShelfCapacity,
} from "@/domain/space/allocation-schemas";
import type { ProductSpacePolicy } from "@/domain/space/product-space-policy-schemas";
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
            fixtureType: fixture.type,
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
  policies?: ProductSpacePolicy[];
}): AllocationValidationIssue[] {
  const capacityByShelfId = new Map(
    input.capacities.map((capacity) => [capacity.shelfId, capacity]),
  );
  const allocatedByShelfId = new Map<string, number>();
  const policyByProductId = new Map(
    (input.policies ?? []).map((policy) => [policy.productId, policy]),
  );
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

    const policy = policyByProductId.get(allocation.productId);
    if (
      policy?.suitability === "restricted" &&
      !policy.allowedFixtureTypes.includes(capacity.fixtureType)
    ) {
      issues.push(
        allocationValidationIssueSchema.parse({
          code: "INCOMPATIBLE_FIXTURE",
          shelfId: allocation.shelfId,
          productId: allocation.productId,
          message: `Ce produit n’est pas compatible avec le mobilier « ${capacity.fixtureName} »`,
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

  const allocatedProductIds = new Set(
    input.allocations.map((allocation) => allocation.productId),
  );
  for (const policy of input.policies ?? []) {
    const productIsActive =
      !input.authorizedProductIds ||
      input.authorizedProductIds.has(policy.productId);
    if (
      policy.mustStock &&
      productIsActive &&
      !allocatedProductIds.has(policy.productId)
    ) {
      issues.push(
        allocationValidationIssueSchema.parse({
          code: "MUST_STOCK_MISSING",
          shelfId: null,
          productId: policy.productId,
          message: "Un produit déclaré obligatoire manque dans l’allocation",
        }),
      );
    }
  }

  return issues;
}

export function calculateAllocationProductEconomics(
  product: AllocationProduct,
  config: Pick<AllocationConfig, "markdownPenaltyWeight">,
): AllocationProductEconomics {
  const projectedRevenueCents =
    product.forecastRevenueCents ?? product.revenueCents;
  const projectedGrossMarginCents =
    projectedRevenueCents === null || product.marginRatio === null
      ? null
      : Math.round(projectedRevenueCents * product.marginRatio);
  const expectedPostMarkdownMarginCents =
    projectedGrossMarginCents === null || product.markdownCents === null
      ? null
      : Math.round(
          projectedGrossMarginCents -
            product.markdownCents * config.markdownPenaltyWeight,
        );

  return allocationProductEconomicsSchema.parse({
    projectedGrossMarginCents,
    markdownCents: product.markdownCents,
    expectedPostMarkdownMarginCents,
    scoreCents: Math.max(
      1,
      expectedPostMarkdownMarginCents ?? projectedGrossMarginCents ?? 0,
    ),
  });
}

export function summarizeAllocationEconomics(input: {
  products: AllocationProduct[];
  config: Pick<AllocationConfig, "markdownPenaltyWeight">;
  periodKey: string | null;
}): AllocationEconomicsSummary {
  const economics = input.products.map((product) =>
    calculateAllocationProductEconomics(product, input.config),
  );
  const observed = economics.filter(
    (product) => product.markdownCents !== null,
  );
  const knownPostMarkdownMargins = economics.flatMap((product) =>
    product.expectedPostMarkdownMarginCents === null
      ? []
      : [product.expectedPostMarkdownMarginCents],
  );
  const markdownCoverage =
    observed.length === 0
      ? "none"
      : observed.length === economics.length
        ? "complete"
        : "partial";

  return allocationEconomicsSummarySchema.parse({
    periodKey: input.periodKey,
    consideredProductCount: economics.length,
    markdownObservedProductCount: observed.length,
    observedMarkdownCents:
      observed.length === 0
        ? null
        : observed.reduce(
            (total, product) => total + (product.markdownCents ?? 0),
            0,
          ),
    knownExpectedPostMarkdownMarginCents:
      knownPostMarkdownMargins.length === 0
        ? null
        : knownPostMarkdownMargins.reduce(
            (total, marginCents) => total + marginCents,
            0,
          ),
    markdownCoverage,
  });
}

export function buildAllocationLimitations(input: {
  products: AllocationProduct[];
  policies: ProductSpacePolicy[];
}): string[] {
  const knownMarkdownCount = input.products.filter(
    (product) => product.markdownCents !== null,
  ).length;
  const restrictedProductIds = new Set(
    input.policies
      .filter((policy) => policy.suitability === "restricted")
      .map((policy) => policy.productId),
  );
  const unknownSuitabilityCount = input.products.filter(
    (product) => !restrictedProductIds.has(product.id),
  ).length;

  return [
    knownMarkdownCount === 0
      ? "Aucune démarque produit observée pour la période : le classement utilise la marge théorique et ne suppose aucune perte nulle."
      : `Démarque observée pour ${knownMarkdownCount}/${input.products.length} produits : les autres pertes restent inconnues.`,
    unknownSuitabilityCount === 0
      ? "Compatibilité mobilier explicitement renseignée pour tous les produits considérés."
      : `Compatibilité mobilier inconnue pour ${unknownSuitabilityCount}/${input.products.length} produits : ces produits restent proposés avec validation manager.`,
    "Les données mensuelles ne décrivent ni le stock disponible, ni la casse future, ni la demande quotidienne.",
  ];
}

function productScore(
  product: AllocationProduct,
  config: Pick<AllocationConfig, "markdownPenaltyWeight">,
): number {
  return calculateAllocationProductEconomics(product, config).scoreCents;
}

export function isAllocationProductCompatible(
  productId: string,
  capacity: ShelfCapacity,
  policyByProductId: Map<string, ProductSpacePolicy>,
): boolean {
  const policy = policyByProductId.get(productId);

  return (
    !policy ||
    policy.suitability === "unknown" ||
    policy.allowedFixtureTypes.includes(capacity.fixtureType)
  );
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
  policies?: ProductSpacePolicy[];
}): AllocationLine[] {
  const policyByProductId = new Map(
    (input.policies ?? []).map((policy) => [policy.productId, policy]),
  );
  const products = [...input.products].sort((first, second) => {
    const scoreDifference =
      productScore(second, input.config) - productScore(first, input.config);
    return scoreDifference || first.label.localeCompare(second.label, "fr");
  });
  const protectedAllocations = input.currentAllocations.filter(
    (allocation) =>
      allocation.locked ||
      policyByProductId.get(allocation.productId)?.mustStock === true,
  );
  const protectedByShelfId = new Map<string, AllocationLine[]>();

  for (const allocation of protectedAllocations) {
    protectedByShelfId.set(allocation.shelfId, [
      ...(protectedByShelfId.get(allocation.shelfId) ?? []),
      allocation,
    ]);
  }

  if (products.length === 0) {
    return protectedAllocations;
  }

  const activeProductIds = new Set(products.map((product) => product.id));
  const allocatedMustStockProductIds = new Set(
    protectedAllocations
      .filter(
        (allocation) =>
          policyByProductId.get(allocation.productId)?.mustStock === true,
      )
      .map((allocation) => allocation.productId),
  );
  const missingMustStockProductIds = new Set(
    (input.policies ?? [])
      .filter(
        (policy) =>
          policy.mustStock &&
          activeProductIds.has(policy.productId) &&
          !allocatedMustStockProductIds.has(policy.productId),
      )
      .map((policy) => policy.productId),
  );
  const generated: AllocationLine[] = [];
  let productCursor = 0;

  for (const capacity of input.capacities) {
    const shelfProtected = protectedByShelfId.get(capacity.shelfId) ?? [];
    const protectedWidthM = shelfProtected.reduce(
      (total, allocation) => total + allocation.facingWidthM,
      0,
    );
    const availableWidthM = roundFacing(
      Math.max(0, capacity.capacityWidthM - protectedWidthM),
    );
    const maximumProductCount = Math.floor(
      (availableWidthM + 0.000_1) / input.config.minimumFacingWidthM,
    );
    if (maximumProductCount === 0) {
      continue;
    }

    const shelfProductIds = new Set(
      shelfProtected.map((allocation) => allocation.productId),
    );
    const selected: AllocationProduct[] = [];
    for (const product of products) {
      if (
        selected.length >= maximumProductCount ||
        !missingMustStockProductIds.has(product.id)
      ) {
        continue;
      }
      if (
        !shelfProductIds.has(product.id) &&
        isAllocationProductCompatible(product.id, capacity, policyByProductId)
      ) {
        selected.push(product);
        missingMustStockProductIds.delete(product.id);
      }
    }

    const desiredProductCount = Math.min(
      maximumProductCount,
      products.length,
      Math.max(input.config.targetProductsPerShelf, selected.length),
    );
    let attempts = 0;

    while (
      selected.length < desiredProductCount &&
      attempts < products.length * 2
    ) {
      const product = products[productCursor % products.length];
      productCursor += 1;
      attempts += 1;

      if (
        product &&
        !shelfProductIds.has(product.id) &&
        !selected.some((candidate) => candidate.id === product.id) &&
        isAllocationProductCompatible(product.id, capacity, policyByProductId)
      ) {
        selected.push(product);
        missingMustStockProductIds.delete(product.id);
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
      (total, product) => total + productScore(product, input.config),
      0,
    );
    let assignedWidthM = 0;

    for (const [index, product] of selected.entries()) {
      const facingWidthM =
        index === selected.length - 1
          ? roundFacing(availableWidthM - assignedWidthM)
          : floorToFacingIncrement(
              baseWidthM +
                (distributableWidthM * productScore(product, input.config)) /
                  totalScore,
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

  return [...protectedAllocations, ...generated];
}
