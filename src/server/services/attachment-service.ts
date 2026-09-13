import "server-only";

import type { AttachmentTarget } from "@/domain/attachments/schemas";
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

export async function deletePhotoAttachment(input: {
  context: AuthorizedStoreContext;
  attachmentId: string;
  idempotencyKey: string;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new AttachmentRepository(db, client).delete(input);
}
