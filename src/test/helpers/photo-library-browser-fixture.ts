import { attachmentSchema } from "@/domain/attachments/schemas";

export const legacyPhoto = attachmentSchema.parse({
  id: "b".repeat(24),
  organizationId: "synthetic-org",
  storeId: "a".repeat(24),
  target: { type: "store" },
  targetKey: "store",
  caption: "Photo historique",
  originalFileName: "legacy.png",
  mimeType: "image/png",
  sizeBytes: 8,
  checksumSha256: "0".repeat(64),
  retentionPolicy: "until_manual_deletion",
  uploadedBy: "synthetic-manager",
  createdAt: "2026-09-01T06:00:00.000Z",
  contentUrl: `/api/stores/${"a".repeat(24)}/attachments/${"b".repeat(24)}/content`,
  storageBackend: "mongo_bson",
});
