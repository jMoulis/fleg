import * as z from "zod";

import {
  attachmentMaxSizeBytes,
  attachmentMimeTypeSchema,
  attachmentTargetSchema,
} from "@/domain/attachments/schemas";

export const documentMaxSizeBytes = 25 * 1024 * 1024;
export const uploadIntentMaxBodyBytes = 4096;
export const uploadIntentAbandonAfterMs = 24 * 60 * 60 * 1000;
export const checksumSchema = z.string().regex(/^[a-f\d]{64}$/);
export const blobStoreIdSchema = z.string().regex(/^store_[a-zA-Z0-9]+$/);
export const blobNamespaceSchema = z
  .string()
  .regex(/^(local|preview|production)-[a-z0-9-]{1,64}$/);

// Provider references are internal only: never accepted as an upload request.
export const privateBlobReferenceSchema = z
  .object({
    backend: z.literal("vercel_blob"),
    storeId: blobStoreIdSchema,
    namespace: blobNamespaceSchema,
    pathname: z
      .string()
      .regex(
        /^fleg\/(local|preview|production)-[a-z0-9-]{1,64}\/[a-f0-9]{64}\/[a-f0-9]{24}\/[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/,
      ),
  })
  .strict();
export type PrivateBlobReference = z.infer<typeof privateBlobReferenceSchema>;

const commonInput = {
  idempotencyKey: z.uuid(),
  originalFileName: z.string().trim().min(1).max(180),
  checksumSha256: checksumSchema,
  caption: z.string().trim().max(300).nullable(),
};
export const uploadIntentInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...commonInput,
      kind: z.literal("photo"),
      target: attachmentTargetSchema,
      mimeType: attachmentMimeTypeSchema,
      sizeBytes: z.number().int().positive().max(attachmentMaxSizeBytes),
    })
    .strict(),
  z
    .object({
      ...commonInput,
      kind: z.literal("document"),
      target: z.object({ type: z.literal("store") }).strict(),
      mimeType: z.literal("application/pdf"),
      sizeBytes: z.number().int().positive().max(documentMaxSizeBytes),
    })
    .strict(),
]);
export type UploadIntentInput = z.infer<typeof uploadIntentInputSchema>;

export const uploadIntentStateSchema = z.enum([
  "reserved",
  "uploaded",
  "verified",
  "linked",
  "rejected",
  "cancelled",
  "deleting",
  "deleted",
]);
export const uploadIntentReceiptSchema = z.object({
  id: z.uuid(),
  state: uploadIntentStateSchema,
  createdAt: z.iso.datetime(),
  reconcileAfter: z.iso.datetime(),
  // This foundation does not issue tokens or accept bytes, even when enabled.
  uploadAvailable: z.literal(false),
  sourceId: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
});
export type UploadIntentReceipt = z.infer<typeof uploadIntentReceiptSchema>;

export class PrivateStorageError extends Error {
  constructor(
    readonly code:
      | "STORAGE_DISABLED"
      | "STORAGE_CONFIGURATION"
      | "STORAGE_UNAVAILABLE"
      | "STORAGE_INTEGRITY"
      | "UPLOAD_CONFLICT"
      | "UPLOAD_NOT_FOUND"
      | "UPLOAD_QUOTA"
      | "UPLOAD_CALLBACK_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "PrivateStorageError";
  }
}
