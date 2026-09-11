import { z } from "zod";
import {
  inventoryCountLineSchema,
  inventoryCountSchema,
} from "@/domain/inventory/schemas";
import { businessTimeZoneSchema, offlineIdentitySchema } from "./schemas";

export const syncOwnerSchema = offlineIdentitySchema
  .omit({ sessionBinding: true })
  .strict();
const countId = z.string().regex(/^[a-f\d]{24}$/i);
export const inventorySyncInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.uuid(),
    draftId: z.uuid(),
    owner: syncOwnerSchema,
    businessDate: z.iso.date(),
    timeZone: businessTimeZoneSchema,
    createdAt: z.iso.datetime(),
    baseCountId: countId.nullable(),
    basedOnRevision: z.number().int().nonnegative().nullable(),
    lines: z.array(inventoryCountLineSchema).min(1).max(2000),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.baseCountId === null) !== (value.basedOnRevision === null))
      context.addIssue({ code: "custom", message: "Base incohérente" });
    if (
      new Set(value.lines.map((line) => line.productId)).size !==
      value.lines.length
    )
      context.addIssue({ code: "custom", message: "Articles dupliqués" });
    for (const line of value.lines) {
      if (
        (line.reserveCaseCount !== null || line.shelfQuantity !== null) &&
        !line.observedAt
      )
        context.addIssue({
          code: "custom",
          message: "Heure d’observation requise pour les quantités",
        });
      if (
        line.observedAt &&
        Date.parse(line.observedAt) < Date.parse(value.createdAt)
      )
        context.addIssue({
          code: "custom",
          message: "Heure d’observation antérieure au brouillon",
        });
    }
  });
export type InventorySyncInput = z.infer<typeof inventorySyncInputSchema>;
export const syncReceiptSchema = z
  .object({
    kind: z.literal("acknowledged"),
    operationId: z.uuid(),
    draftId: z.uuid(),
    owner: syncOwnerSchema,
    businessDate: z.iso.date(),
    countId,
    revision: z.number().int().nonnegative(),
    receivedAt: z.iso.datetime(),
  })
  .strict();
export type SyncReceipt = z.infer<typeof syncReceiptSchema>;
export const syncConflictSchema = z.object({
  kind: z.literal("conflict"),
  current: inventoryCountSchema.nullable(),
  message: z.string(),
});
export const syncRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    draftId: z.uuid(),
    owner: syncOwnerSchema,
    generation: z.number().int().nonnegative(),
    serverCountId: countId.nullable(),
    serverRevision: z.number().int().nonnegative().nullable(),
    phase: z.enum([
      "pending",
      "syncing",
      "synchronized",
      "failed",
      "conflict",
      "locked",
    ]),
    inFlight: z
      .object({
        payload: inventorySyncInputSchema,
        operationIds: z.record(z.string(), z.uuid()),
      })
      .nullable(),
    conflict: syncConflictSchema.nullable(),
    message: z.string(),
    rejected: z.boolean().default(false),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: z.number().nonnegative(),
    receivedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type SyncRecord = z.infer<typeof syncRecordSchema>;

// Transport controls, not business coefficients. Persist retries across reloads.
export const syncTransportPolicy = Object.freeze({
  timeoutMs: 15000,
  pollMs: 5000,
  settleMs: 1500,
  initialRetryMs: 2000,
  maxRetryMs: 60000,
  maxAttempts: 5,
});
export function nextSyncRetry(attempt: number, now: number) {
  return (
    now +
    Math.min(
      syncTransportPolicy.maxRetryMs,
      syncTransportPolicy.initialRetryMs * 2 ** Math.max(0, attempt - 1),
    )
  );
}
