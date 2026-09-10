import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

export const attachmentMimeTypeValues = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const attachmentMimeTypeSchema = z.enum(attachmentMimeTypeValues);
export type AttachmentMimeType = z.infer<typeof attachmentMimeTypeSchema>;

export const attachmentMaxSizeBytes = 4 * 1024 * 1024;
export const attachmentMaxPerTarget = 20;
export const attachmentRetentionPolicy = "until_manual_deletion" as const;

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Identifiant invalide");
const fixtureIdSchema = z.string().trim().min(1).max(100);

export const attachmentTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("store") }),
  z.object({
    type: z.literal("layout"),
    layoutVersionId: mongoIdSchema,
  }),
  z.object({
    type: z.literal("fixture"),
    layoutVersionId: mongoIdSchema,
    fixtureId: fixtureIdSchema,
  }),
  z.object({
    type: z.literal("commercial_event"),
    eventId: mongoIdSchema,
  }),
]);
export type AttachmentTarget = z.infer<typeof attachmentTargetSchema>;

export function attachmentTargetKey(target: AttachmentTarget): string {
  switch (target.type) {
    case "store":
      return "store";
    case "layout":
      return `layout:${target.layoutVersionId}`;
    case "fixture":
      return `fixture:${target.layoutVersionId}:${target.fixtureId}`;
    case "commercial_event":
      return `commercial_event:${target.eventId}`;
  }
}

export const attachmentCreateMetadataSchema = z.object({
  target: attachmentTargetSchema,
  caption: z.string().trim().max(300).nullable(),
  idempotencyKey: z.uuid(),
});
export type AttachmentCreateMetadata = z.infer<
  typeof attachmentCreateMetadataSchema
>;

export const attachmentDeleteInputSchema = z.object({
  idempotencyKey: z.uuid(),
});
export const attachmentSchema = z.object({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  target: attachmentTargetSchema,
  targetKey: z.string().min(1).max(260),
  caption: z.string().trim().max(300).nullable(),
  originalFileName: z.string().trim().min(1).max(180),
  mimeType: attachmentMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(attachmentMaxSizeBytes),
  checksumSha256: z.string().regex(/^[a-f\d]{64}$/),
  retentionPolicy: z.literal(attachmentRetentionPolicy),
  uploadedBy: z.string().min(1),
  createdAt: z.iso.datetime(),
  contentUrl: z.string().startsWith("/api/stores/"),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentsResponseSchema = z.object({
  attachments: z.array(attachmentSchema).max(500),
  policy: z.object({
    acceptedMimeTypes: z.array(attachmentMimeTypeSchema),
    maxSizeBytes: z.literal(attachmentMaxSizeBytes),
    maxPerTarget: z.literal(attachmentMaxPerTarget),
    retention: z.literal(attachmentRetentionPolicy),
    deletion: z.literal("permanent"),
  }),
  requestId: z.uuid(),
});

export const attachmentResponseSchema = z.object({
  attachment: attachmentSchema,
  requestId: z.uuid(),
});

export const attachmentDeletionResponseSchema = z.object({
  deletedAttachment: attachmentSchema,
  requestId: z.uuid(),
});

export const attachmentIdSchema = mongoIdSchema;

export const attachmentPolicy = {
  acceptedMimeTypes: [...attachmentMimeTypeValues],
  maxSizeBytes: attachmentMaxSizeBytes,
  maxPerTarget: attachmentMaxPerTarget,
  retention: attachmentRetentionPolicy,
  deletion: "permanent" as const,
};
