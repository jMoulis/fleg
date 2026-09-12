import "server-only";

import { createHash } from "node:crypto";

import {
  normalizePhotoFileName,
  PhotoValidationError,
  validatePhotoBytes,
} from "@/domain/attachments/photo-validation";
import type {
  AttachmentCreateMetadata,
  AttachmentTarget,
} from "@/domain/attachments/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { AttachmentRepository } from "@/server/repositories/attachment-repository";
import { parsePrivateStorageConfig } from "@/server/storage/config";
import { VercelPrivateObjectReader } from "@/server/storage/private-object-reader";

export async function listPhotoAttachments(input: {
  context: AuthorizedStoreContext;
  targetTypes?: AttachmentTarget["type"][];
}) {
  return new AttachmentRepository(await getAppDb()).listForStore(
    input.context,
    input.targetTypes,
  );
}

export async function getPhotoAttachmentContent(input: {
  context: AuthorizedStoreContext;
  attachmentId: string;
}) {
  return new AttachmentRepository(
    await getAppDb(),
    undefined,
    () => new VercelPrivateObjectReader(parsePrivateStorageConfig(process.env)),
  ).getContent(input);
}

export async function createPhotoAttachment(input: {
  context: AuthorizedStoreContext;
  metadata: AttachmentCreateMetadata;
  file: File;
  requestId: string;
}) {
  if (input.file.size === 0) {
    throw new PhotoValidationError("Sélectionnez une photo non vide");
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const mimeType = validatePhotoBytes({
    bytes,
    declaredMimeType: input.file.type,
    declaredSizeBytes: input.file.size,
  });
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new AttachmentRepository(db, client).create({
    context: input.context,
    metadata: input.metadata,
    originalFileName: normalizePhotoFileName(input.file.name),
    mimeType,
    bytes,
    checksumSha256,
    requestId: input.requestId,
  });
}

export async function deletePhotoAttachment(input: {
  context: AuthorizedStoreContext;
  attachmentId: string;
  idempotencyKey: string;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new AttachmentRepository(db, client).delete(input);
}
