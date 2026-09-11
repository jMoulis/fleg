import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const quantitySchema = z.number().finite().min(-1_000_000).max(1_000_000);
const packSizeSchema = z.number().finite().positive().max(100_000);

export const inventoryFamilyCodeSchema = z.enum(["3400", "3402"]);
export type InventoryFamilyCode = z.infer<typeof inventoryFamilyCodeSchema>;

export const stockUnitSchema = z.enum(["kg", "piece"]);
export type StockUnit = z.infer<typeof stockUnitSchema>;

export const inventoryProductProfileSchema = z.object({
  productId: mongoIdSchema,
  familyCode: inventoryFamilyCodeSchema,
  stockUnit: stockUnitSchema,
  lastPackSize: packSizeSchema,
  revision: z.number().int().positive(),
  updatedBy: z.string().min(1),
  updatedAt: z.iso.datetime(),
});
export type InventoryProductProfile = z.infer<
  typeof inventoryProductProfileSchema
>;

export const inventoryCountLineSchema = z
  .object({
    productId: mongoIdSchema,
    familyCode: inventoryFamilyCodeSchema.nullable(),
    stockUnit: stockUnitSchema.nullable(),
    packSize: packSizeSchema.nullable(),
    reserveCaseCount: z.number().int().nonnegative().max(100_000).nullable(),
    shelfQuantity: quantitySchema.nullable(),
    // Offline observation time, distinct from upload and final commitment.
    observedAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .superRefine((line, context) => {
    if (
      line.stockUnit === "piece" &&
      line.packSize !== null &&
      !Number.isInteger(line.packSize)
    ) {
      context.addIssue({
        code: "custom",
        path: ["packSize"],
        message: "Le colisage d’un article à la pièce doit être entier",
      });
    }
    if (
      line.stockUnit === "piece" &&
      line.shelfQuantity !== null &&
      !Number.isInteger(line.shelfQuantity)
    ) {
      context.addIssue({
        code: "custom",
        path: ["shelfQuantity"],
        message: "Le stock rayon d’un article à la pièce doit être entier",
      });
    }
  });
export type InventoryCountLine = z.infer<typeof inventoryCountLineSchema>;

function addDuplicateLineIssues(
  lines: InventoryCountLine[],
  context: z.RefinementCtx,
) {
  const productIds = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (productIds.has(line.productId)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "productId"],
        message: "Un article ne peut apparaître qu’une fois dans le comptage",
      });
    }
    productIds.add(line.productId);
  }
}

export const inventoryCountStatusSchema = z.enum(["draft", "committed"]);
export const inventoryCountSchema = z
  .object({
    id: mongoIdSchema,
    organizationId: z.string().min(1),
    storeId: storeIdSchema,
    businessDate: z.iso.date(),
    version: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    status: inventoryCountStatusSchema,
    lines: z.array(inventoryCountLineSchema).max(2_000),
    supersedesCountId: mongoIdSchema.nullable(),
    createdBy: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedBy: z.string().min(1),
    updatedAt: z.iso.datetime(),
    committedBy: z.string().min(1).nullable(),
    committedAt: z.iso.datetime().nullable(),
  })
  .superRefine((count, context) => addDuplicateLineIssues(count.lines, context));
export type InventoryCount = z.infer<typeof inventoryCountSchema>;

export const stockSnapshotAnomalySchema = z.enum(["negative_on_hand"]);
export type StockSnapshotAnomaly = z.infer<
  typeof stockSnapshotAnomalySchema
>;

export const stockSnapshotSchema = z.object({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  productId: mongoIdSchema,
  businessDate: z.iso.date(),
  observedAt: z.iso.datetime(),
  familyCode: inventoryFamilyCodeSchema,
  stockUnit: stockUnitSchema,
  reserveCaseCount: z.number().int().nonnegative(),
  packSize: packSizeSchema,
  shelfQuantity: quantitySchema,
  onHandQuantity: quantitySchema,
  onOrderQuantity: quantitySchema.nullable(),
  reservedQuantity: quantitySchema.nullable(),
  source: z.literal("manual_count"),
  anomalies: z.array(stockSnapshotAnomalySchema),
  countId: mongoIdSchema,
  version: z.number().int().positive(),
  active: z.boolean(),
  supersedesSnapshotId: mongoIdSchema.nullable(),
  createdBy: z.string().min(1),
  createdAt: z.iso.datetime(),
});
export type StockSnapshot = z.infer<typeof stockSnapshotSchema>;

export const stockAvailabilityEvidenceSchema = z.object({
  snapshot: stockSnapshotSchema,
  observationAgeHours: z.number().finite().nonnegative(),
  isStockout: z.boolean(),
});
export const inventoryWorkspaceProductSchema = z.object({
  id: mongoIdSchema,
  label: z.string().min(1),
  profile: inventoryProductProfileSchema.nullable(),
  daySnapshot: stockSnapshotSchema.nullable(),
  latestAvailability: stockAvailabilityEvidenceSchema.nullable(),
});
export const inventoryWorkspaceSchema = z.object({
  businessDate: z.iso.date(),
  count: inventoryCountSchema.nullable(),
  products: z.array(inventoryWorkspaceProductSchema),
});
export type InventoryWorkspace = z.infer<typeof inventoryWorkspaceSchema>;

export const inventoryWorkspaceQuerySchema = z.object({
  businessDate: z.iso.date(),
});

export const inventoryCountCreateInputSchema = z
  .object({
    businessDate: z.iso.date(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type InventoryCountCreateInput = z.infer<
  typeof inventoryCountCreateInputSchema
>;

export const inventoryCountUpdateInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnRevision: z.number().int().nonnegative(),
    lines: z.array(inventoryCountLineSchema).max(2_000),
  })
  .strict()
  .superRefine((input, context) =>
    addDuplicateLineIssues(input.lines, context),
  );
export type InventoryCountUpdateInput = z.infer<
  typeof inventoryCountUpdateInputSchema
>;

export const inventoryCountCommitInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnRevision: z.number().int().nonnegative(),
  })
  .strict();
export type InventoryCountCommitInput = z.infer<
  typeof inventoryCountCommitInputSchema
>;

export const inventoryCommitResultSchema = z.object({
  count: inventoryCountSchema,
  snapshots: z.array(stockSnapshotSchema),
  changedSnapshotCount: z.number().int().nonnegative(),
  unchangedSnapshotCount: z.number().int().nonnegative(),
  configuredProfileCount: z.number().int().nonnegative(),
});
export type InventoryCommitResult = z.infer<
  typeof inventoryCommitResultSchema
>;

export const inventoryWorkspaceResponseSchema = z.object({
  workspace: inventoryWorkspaceSchema,
  requestId: z.uuid(),
});

export const inventoryCountResponseSchema = z.object({
  count: inventoryCountSchema,
  requestId: z.uuid(),
});

export const inventoryCommitResponseSchema = z.object({
  result: inventoryCommitResultSchema,
  requestId: z.uuid(),
});
