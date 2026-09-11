import { z } from "zod";
import { inventoryCountSchema } from "@/domain/inventory/schemas";

export const countReferenceSchema = z.object({
  id: inventoryCountSchema.shape.id,
  version: inventoryCountSchema.shape.version,
  revision: inventoryCountSchema.shape.revision,
  status: inventoryCountSchema.shape.status,
});
export const countLifecycleSchema = z.discriminatedUnion("phase", [
  z
    .object({
      phase: z.literal("editing"),
      count: countReferenceSchema.optional(),
    })
    .strict(),
  z
    .object({
      phase: z.literal("committing"),
      count: countReferenceSchema,
      idempotencyKey: z.uuid(),
      rejected: z.boolean(),
    })
    .strict(),
  z
    .object({ phase: z.literal("committed"), count: countReferenceSchema })
    .strict(),
  z
    .object({
      phase: z.literal("server_committed"),
      count: countReferenceSchema,
    })
    .strict(),
  z
    .object({
      phase: z.literal("correcting"),
      count: countReferenceSchema,
      idempotencyKey: z.uuid(),
      preserveLocal: z.boolean(),
    })
    .strict(),
]);
export type CountLifecycle = z.infer<typeof countLifecycleSchema>;

export function countIsEditable(lifecycle?: CountLifecycle) {
  return !lifecycle || lifecycle.phase === "editing";
}
