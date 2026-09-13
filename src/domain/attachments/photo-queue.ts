import { z } from "zod";
import { attachmentTargetSchema } from "./schemas";
import {
  uploadIntentInputSchema,
  uploadIntentReceiptSchema,
} from "./private-storage";
import { offlineIdentitySchema } from "@/domain/offline/schemas";

// One shared budget for the origin, not multiplied by user or store.
export const photoQueuePolicy = {
  maxPhotos: 10,
  maxBytes: 40 * 1024 * 1024,
  maxTargets: 100,
  maxAttempts: 5,
  retryMs: 30_000,
  operationTimeoutMs: 180_000,
  leaseMs: 240_000,
} as const;

export const photoPreparationInputSchema = z
  .object({
    target: attachmentTargetSchema,
    label: z.string().trim().min(1).max(200),
  })
  .strict();
export const preparedPhotosSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: offlineIdentitySchema,
    storeName: z.string().min(1).max(200),
    preparedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    targets: z
      .array(photoPreparationInputSchema)
      .min(1)
      .max(photoQueuePolicy.maxTargets),
  })
  .strict()
  .refine((v) => Date.parse(v.preparedAt) < Date.parse(v.expiresAt));
export type PreparedPhotos = z.infer<typeof preparedPhotosSchema>;
export const photoQueueOwnerSchema = offlineIdentitySchema.omit({
  sessionBinding: true,
});
export const localPhotoSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    owner: photoQueueOwnerSchema,
    label: z.string().min(1).max(200),
    metadata: uploadIntentInputSchema.refine((v) => v.kind === "photo"),
    createdAt: z.iso.datetime(),
    phase: z.enum(["queued", "checking", "attention"]),
    intentId: z.uuid().nullable(),
    receipt: uploadIntentReceiptSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: z.number().nonnegative(),
    lease: z.object({ id: z.uuid(), until: z.number() }).nullable(),
    message: z.string().max(500),
  })
  .strict();
export type LocalPhoto = z.infer<typeof localPhotoSchema>;
export function photoOwnerKey(identity: z.infer<typeof photoQueueOwnerSchema>) {
  return JSON.stringify([
    identity.userId,
    identity.organizationId,
    identity.storeId,
  ]);
}
