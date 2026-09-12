import "server-only";
import { createHash } from "node:crypto";
import { ObjectId, type Db, type ClientSession } from "mongodb";
import {
  attachmentMaxPerTarget,
  attachmentTargetKey,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  AttachmentLimitError,
  AttachmentReferenceError,
} from "@/server/repositories/attachment-repository";

export function attachmentTargetLockId(
  context: AuthorizedStoreContext,
  target: AttachmentTarget,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        context.organizationId,
        context.storeId.toLowerCase(),
        attachmentTargetKey(target),
      ]),
    )
    .digest("hex");
}

export async function prepareAttachmentTargetLock(
  db: Db,
  context: AuthorizedStoreContext,
  target: AttachmentTarget,
) {
  await db
    .collection<{ _id: string; revision: number }>("attachmentTargetLocks")
    .updateOne(
      { _id: attachmentTargetLockId(context, target) },
      { $setOnInsert: { revision: 0 } },
      { upsert: true },
    );
}

export async function assertAttachmentTargetExists(
  db: Db,
  context: AuthorizedStoreContext,
  target: AttachmentTarget,
  session?: ClientSession,
) {
  if (target.type === "store") return;
  const scope = {
    organizationId: context.organizationId,
    storeId: new ObjectId(context.storeId),
  };
  const document =
    target.type === "commercial_event"
      ? await db
          .collection("commercialEvents")
          .findOne(
            { ...scope, _id: new ObjectId(target.eventId) },
            { projection: { _id: 1 }, session },
          )
      : await db.collection("layoutVersions").findOne(
          {
            ...scope,
            _id: new ObjectId(target.layoutVersionId),
            ...(target.type === "fixture"
              ? { fixtures: { $elemMatch: { id: target.fixtureId } } }
              : {}),
          },
          { projection: { _id: 1 }, session },
        );
  if (!document) throw new AttachmentReferenceError();
}

export async function reserveAttachmentTargetSlot(
  db: Db,
  context: AuthorizedStoreContext,
  target: AttachmentTarget,
  session: ClientSession,
) {
  // Both legacy creates and Blob reservations write the same lock, preventing
  // write skew between a count and concurrent inserts in separate collections.
  const lock = await db
    .collection<{ _id: string; revision: number }>("attachmentTargetLocks")
    .updateOne(
      { _id: attachmentTargetLockId(context, target) },
      { $inc: { revision: 1 } },
      { session },
    );
  if (lock.matchedCount !== 1) throw new Error("Verrou de cible absent");
  const scope = {
    organizationId: context.organizationId,
    storeId: new ObjectId(context.storeId),
    targetKey: attachmentTargetKey(target),
  };
  const photos = await db
    .collection("attachments")
    .countDocuments(
      { ...scope, storageState: { $ne: "deleting" } },
      { session },
    );
  const reservations = await db
    .collection("uploadIntents")
    .countDocuments(
      { ...scope, kind: "photo", budgetHeld: true, state: { $ne: "linked" } },
      { session },
    );
  if (photos + reservations >= attachmentMaxPerTarget)
    throw new AttachmentLimitError();
}
