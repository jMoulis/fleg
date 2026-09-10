import * as z from "zod";

import { abcClassSchema, confidenceSchema } from "@/domain/analytics/schemas";
import { periodKeySchema } from "@/domain/imports/schemas";
import { productSpacePolicySchema } from "@/domain/space/product-space-policy-schemas";
import { fixtureTypeSchema } from "@/domain/space/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const positiveWidthSchema = z.number().finite().positive().max(1_000);

export const allocationConfigSchema = z.object({
  minimumFacingWidthM: positiveWidthSchema.max(10),
  targetProductsPerShelf: z.number().int().min(1).max(8),
  facingIncrementM: positiveWidthSchema.max(1),
  markdownPenaltyWeight: z.number().finite().min(0).max(2).default(1),
});
export type AllocationConfig = z.infer<typeof allocationConfigSchema>;

export const defaultAllocationConfig: AllocationConfig =
  allocationConfigSchema.parse({
    minimumFacingWidthM: 0.25,
    targetProductsPerShelf: 2,
    facingIncrementM: 0.05,
    markdownPenaltyWeight: 1,
  });

export const allocationModelVersionSchema = z.enum([
  "manual-allocation-v1",
  "space-allocation-heuristic-v1",
  "space-allocation-heuristic-v2",
]);
export const allocationProductSchema = z.object({
  id: mongoIdSchema,
  label: z.string().trim().min(1).max(200),
  revenueCents: z.number().int().safe().nullable(),
  marginCents: z.number().int().safe().nullable(),
  marginRatio: z.number().finite().nullable(),
  forecastRevenueCents: z.number().int().safe().nullable(),
  abcClass: abcClassSchema.nullable(),
  confidence: confidenceSchema.nullable(),
  markdownCents: z.number().int().safe().nonnegative().nullable(),
});
export type AllocationProduct = z.infer<typeof allocationProductSchema>;

export const allocationProductEconomicsSchema = z.object({
  projectedGrossMarginCents: z.number().int().safe().nullable(),
  markdownCents: z.number().int().safe().nonnegative().nullable(),
  expectedPostMarkdownMarginCents: z.number().int().safe().nullable(),
  scoreCents: z.number().int().safe().positive(),
});
export type AllocationProductEconomics = z.infer<
  typeof allocationProductEconomicsSchema
>;

export const allocationLineSchema = z.object({
  productId: mongoIdSchema,
  shelfId: z.string().trim().min(1).max(100),
  facingWidthM: positiveWidthSchema,
  locked: z.boolean(),
});
export type AllocationLine = z.infer<typeof allocationLineSchema>;

export const allocationBasisSchema = z.object({
  periodKey: periodKeySchema.nullable(),
  calculationVersion: z.string().trim().min(1).max(100).nullable(),
  dataRevision: z.number().int().nonnegative().nullable(),
  settingsRevision: z.number().int().nonnegative().default(0),
  policyRevision: z.number().int().nonnegative().default(0),
});
export type AllocationBasis = z.infer<typeof allocationBasisSchema>;

export const allocationConstraintSnapshotSchema = z.object({
  policyRevision: z.number().int().nonnegative(),
  policies: z.array(productSpacePolicySchema).max(2_000),
});
export type AllocationConstraintSnapshot = z.infer<
  typeof allocationConstraintSnapshotSchema
>;

export const allocationEconomicsSummarySchema = z.object({
  periodKey: periodKeySchema.nullable(),
  consideredProductCount: z.number().int().nonnegative(),
  markdownObservedProductCount: z.number().int().nonnegative(),
  observedMarkdownCents: z.number().int().safe().nonnegative().nullable(),
  knownExpectedPostMarkdownMarginCents: z.number().int().safe().nullable(),
  markdownCoverage: z.enum(["none", "partial", "complete"]),
});
export type AllocationEconomicsSummary = z.infer<
  typeof allocationEconomicsSummarySchema
>;

const legacyConstraintSnapshot: AllocationConstraintSnapshot = {
  policyRevision: 0,
  policies: [],
};
const legacyEconomicsSummary: AllocationEconomicsSummary = {
  periodKey: null,
  consideredProductCount: 0,
  markdownObservedProductCount: 0,
  observedMarkdownCents: null,
  knownExpectedPostMarkdownMarginCents: null,
  markdownCoverage: "none",
};

function addDuplicateLineIssue(
  allocations: AllocationLine[],
  context: z.RefinementCtx,
) {
  const keys = new Set<string>();

  for (const [index, allocation] of allocations.entries()) {
    const key = `${allocation.shelfId}:${allocation.productId}`;

    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["allocations", index],
        message: "Un produit ne peut apparaître qu'une fois sur un même niveau",
      });
    }
    keys.add(key);
  }
}

export const allocationPlanSchema = z
  .object({
    id: mongoIdSchema,
    organizationId: z.string().min(1),
    storeId: storeIdSchema,
    departmentId: mongoIdSchema,
    layoutVersionId: mongoIdSchema,
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    status: z.literal("draft"),
    source: z.enum(["manager", "heuristic"]),
    modelVersion: allocationModelVersionSchema,
    config: allocationConfigSchema,
    basis: allocationBasisSchema,
    evidence: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    limitations: z
      .array(z.string().trim().min(1).max(300))
      .min(1)
      .max(10)
      .default([
        "Version historique : contraintes et couverture de démarque non figées.",
      ]),
    constraintSnapshot: allocationConstraintSnapshotSchema.default(
      legacyConstraintSnapshot,
    ),
    economics: allocationEconomicsSummarySchema.default(
      legacyEconomicsSummary,
    ),
    allocations: z.array(allocationLineSchema).max(2_000),
    note: z.string().trim().max(500).nullable(),
    createdBy: z.string().min(1),
    createdAt: z.iso.datetime(),
  })
  .superRefine((plan, context) =>
    addDuplicateLineIssue(plan.allocations, context),
  );
export type AllocationPlan = z.infer<typeof allocationPlanSchema>;

export const allocationPlanCreateInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnPlanVersion: z.number().int().nonnegative(),
    layoutVersionId: mongoIdSchema,
    name: z.string().trim().min(1).max(160),
    source: z.enum(["manager", "heuristic"]),
    modelVersion: allocationModelVersionSchema,
    config: allocationConfigSchema,
    basis: allocationBasisSchema,
    evidence: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    limitations: z
      .array(z.string().trim().min(1).max(300))
      .min(1)
      .max(10),
    constraintSnapshot: allocationConstraintSnapshotSchema,
    economics: allocationEconomicsSummarySchema,
    allocations: z.array(allocationLineSchema).max(2_000),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((plan, context) =>
    addDuplicateLineIssue(plan.allocations, context),
  );
export type AllocationPlanCreateInput = z.infer<
  typeof allocationPlanCreateInputSchema
>;

export const allocationPlanResponseSchema = z.object({
  plan: allocationPlanSchema.nullable(),
  requestId: z.uuid(),
});

export const shelfCapacitySchema = z.object({
  shelfId: z.string().min(1),
  shelfLabel: z.string().min(1),
  fixtureId: z.string().min(1),
  fixtureName: z.string().min(1),
  fixtureType: fixtureTypeSchema,
  faceId: z.string().min(1),
  faceLabel: z.string().min(1),
  moduleId: z.string().min(1),
  moduleLabel: z.string().min(1),
  modulePosition: z.number().int().positive(),
  capacityWidthM: positiveWidthSchema,
  effectiveFactor: z.number().finite().positive(),
});
export type ShelfCapacity = z.infer<typeof shelfCapacitySchema>;

export const allocationSummarySchema = z.object({
  capacityWidthM: z.number().finite().nonnegative(),
  allocatedWidthM: z.number().finite().nonnegative(),
  remainingWidthM: z.number().finite(),
  effectiveAllocatedWidthM: z.number().finite().nonnegative(),
  utilizationRatio: z.number().finite().nonnegative(),
  allocationCount: z.number().int().nonnegative(),
  lockedCount: z.number().int().nonnegative(),
  overflowShelfIds: z.array(z.string()),
});
export type AllocationSummary = z.infer<typeof allocationSummarySchema>;

export const allocationValidationIssueSchema = z.object({
  code: z.enum([
    "UNKNOWN_SHELF",
    "UNKNOWN_PRODUCT",
    "BELOW_MINIMUM_FACING",
    "SHELF_CAPACITY_EXCEEDED",
    "INCOMPATIBLE_FIXTURE",
    "MUST_STOCK_MISSING",
  ]),
  shelfId: z.string().nullable(),
  productId: z.string().nullable(),
  message: z.string().min(1),
});
export type AllocationValidationIssue = z.infer<
  typeof allocationValidationIssueSchema
>;
