import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  ObjectId,
  type Db,
  type MongoClient,
  type ClientSession,
} from "mongodb";
import {
  PrivateStorageError,
  uploadIntentInputSchema,
} from "@/domain/attachments/private-storage";
import {
  validatePhotoBytes,
  PhotoValidationError,
} from "@/domain/attachments/photo-validation";
import { attachmentRetentionPolicy } from "@/domain/attachments/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";
import {
  assertAttachmentTargetExists,
  attachmentTargetLockId,
} from "./attachment-target";
import { AttachmentReferenceError } from "./attachment-repository";
import type { IntentDocument } from "./upload-intent-repository";
import type { PrivateStorageConfig } from "@/server/storage/config";
import type { PrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { validatePdf } from "@/server/storage/pdf-validator";
import * as z from "zod";

const leaseMs = 120000;
const retryMs = 300000;

export class UploadLifecycleRepository {
  constructor(
    private readonly db: Db,
    private readonly authDb: Db,
    private readonly client: MongoClient,
    private readonly config: PrivateStorageConfig,
    private readonly objects: PrivateUploadObjectStore,
  ) {}

  private scope(context: AuthorizedStoreContext) {
    if (!context.permissions.includes("attachments.write"))
      throw new StoreAccessDeniedError();
    return {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      "storage.storeId": this.config.storeId,
      "storage.namespace": this.config.namespace,
    };
  }

  private async audit(
    document: IntentDocument,
    actorId: string,
    requestId: string,
    action: string,
    session: ClientSession,
  ) {
    const now = new Date();
    await this.db.collection("auditLogs").insertOne(
      {
        organizationId: document.organizationId,
        storeId: document.storeId,
        actorId,
        entityType: "upload_intent",
        entityId: document._id,
        action,
        before: null,
        after: {
          state: document.state,
          kind: document.kind,
          budgetHeld: document.budgetHeld,
        },
        requestId,
        timestamp: now,
        createdAt: now,
      },
      { session },
    );
  }

  // One lease per call, stable indexed ordering and durable retry date. Repeating
  // this endpoint drains successive pages without loading an unbounded backlog.
  async reconcile(
    context: AuthorizedStoreContext,
    requestId: string,
    ownerIntentId?: string,
  ) {
    const scope = this.scope(context);
    const now = new Date();
    const intents = this.db.collection<IntentDocument>("uploadIntents");
    const document = await intents.findOneAndUpdate(
      {
        ...scope,
        ...(ownerIntentId
          ? {
              _id: z.uuid().parse(ownerIntentId),
              ownerId: context.userId,
              authorization: { $exists: true },
              state: { $in: ["reserved", "uploaded"] },
              $or: [
                { lastMaintenanceCode: { $exists: false } },
                { lastMaintenanceCode: "RETRY", reconcileAfter: { $lte: now } },
              ],
            }
          : { reconcileAfter: { $lte: now } }),
        $and: [
          {
            $or: [
              {
                state: {
                  $in: [
                    "reserved",
                    "uploaded",
                    "cancelled",
                    "rejected",
                    "deleting",
                  ],
                },
              },
              { cleanupRequired: true },
            ],
          },
          {
            $or: [
              { lease: { $exists: false } },
              { "lease.until": { $lte: now } },
            ],
          },
        ],
      },
      {
        $set: {
          lease: {
            token: randomUUID(),
            until: new Date(now.getTime() + leaseMs),
          },
        },
      },
      {
        sort: { reconcileAfter: 1, _id: 1 },
        returnDocument: "after",
      },
    );
    if (!document) return { processed: false as const };
    const filter = {
      ...scope,
      _id: document._id,
      "lease.token": document.lease!.token,
    };
    try {
      if (
        ["cancelled", "rejected", "deleting", "deleted"].includes(
          document.state,
        ) ||
        !document.authorization
      ) {
        // A never-issued reservation has no remote upload capability. All other
        // tombstones retain quota, even after DELETE + fresh absence: SDK 2.8.0
        // does not yet supply the in-flight/multipart lifetime proof we require.
        if (document.authorization) {
          if (document.authorization.validUntil > now) {
            await intents.updateOne(filter, {
              $set: { reconcileAfter: document.authorization.validUntil },
              $unset: { lease: "" },
            });
            return {
              processed: true as const,
              id: document._id,
              outcome: "waiting" as const,
            };
          }
          await this.objects.remove(context, document.storage);
          await intents.updateOne(filter, {
            $set: {
              artifacts: [
                {
                  kind: "original",
                  storage: document.storage,
                  absenceObservedAt: new Date(),
                },
              ],
              cleanupRequired: true,
              lastMaintenanceCode: "AWAITING_TRANSPORT_PROOF",
              reconcileAfter: new Date(Date.now() + retryMs),
            },
            $unset: { lease: "" },
          });
          return {
            processed: true as const,
            id: document._id,
            outcome: "cleanup_pending" as const,
          };
        }
        const released = await this.releaseNeverIssued(
          context,
          document,
          requestId,
        );
        return {
          processed: true as const,
          id: document._id,
          outcome: released ? ("deleted" as const) : ("superseded" as const),
        };
      }
      // The owner may request immediate verification after a PUT. The object
      // remains non-overwritable and every read verifies its persisted hash;
      // authorization expiry is still required before physical cleanup below.
      // Background recovery of missing callbacks keeps its original schedule.
      if (!ownerIntentId && document.authorization.validUntil > now) {
        await intents.updateOne(filter, {
          $set: { reconcileAfter: document.authorization.validUntil },
          $unset: { lease: "" },
        });
        return {
          processed: true as const,
          id: document._id,
          outcome: "waiting" as const,
        };
      }
      const author = await authorizeUploadAuthor({
        db: this.db,
        authDb: this.authDb,
        ...document,
      });
      await assertAttachmentTargetExists(
        this.db,
        author,
        document.input.target,
      );
      const input = uploadIntentInputSchema.parse(document.input);
      const bytes = await this.objects.read(author, document.storage, input);
      if (!bytes)
        throw new PrivateStorageError(
          "STORAGE_UNAVAILABLE",
          "Réception non confirmée",
        );
      const verification =
        input.kind === "document"
          ? { ...(await validatePdf(bytes)), verifiedAt: new Date() }
          : { parserVersion: "photo-signature-1", verifiedAt: new Date() };
      if (input.kind === "photo")
        validatePhotoBytes({
          bytes,
          declaredMimeType: input.mimeType,
          declaredSizeBytes: input.sizeBytes,
        });
      const linked = await this.link(
        context,
        document,
        verification,
        requestId,
      );
      return {
        processed: true as const,
        id: document._id,
        outcome: linked ? ("linked" as const) : ("superseded" as const),
      };
    } catch (error) {
      const rejected =
        error instanceof StoreAccessDeniedError ||
        error instanceof AttachmentReferenceError ||
        error instanceof PhotoValidationError ||
        (error instanceof PrivateStorageError &&
          error.code === "STORAGE_INTEGRITY");
      const session = this.client.startSession();
      try {
        await session.withTransaction(async () => {
          const current = await intents.findOne(filter, { session });
          if (!current) return;
          if (rejected && ["reserved", "uploaded"].includes(current.state)) {
            current.state = "rejected";
            await intents.updateOne(
              filter,
              {
                $set: {
                  state: "rejected",
                  cleanupRequired: true,
                  lastMaintenanceCode: "REJECTED",
                  reconcileAfter: new Date(Date.now() + retryMs),
                },
                $unset: { lease: "" },
              },
              { session },
            );
            await this.audit(
              current,
              context.userId,
              requestId,
              "attachment.upload_rejected",
              session,
            );
          } else {
            await intents.updateOne(
              filter,
              {
                $set: {
                  lastMaintenanceCode: "RETRY",
                  reconcileAfter: new Date(Date.now() + retryMs),
                },
                $unset: { lease: "" },
              },
              { session },
            );
          }
        });
      } finally {
        await session.endSession();
      }
      return {
        processed: true as const,
        id: document._id,
        outcome: rejected ? ("rejected" as const) : ("retry" as const),
      };
    }
  }

  private async link(
    context: AuthorizedStoreContext,
    original: IntentDocument,
    verification: NonNullable<IntentDocument["verification"]>,
    requestId: string,
  ) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const intents = this.db.collection<IntentDocument>("uploadIntents");
        const document = await intents.findOne(
          {
            ...this.scope(context),
            _id: original._id,
            state: { $in: ["reserved", "uploaded"] },
            budgetHeld: true,
            "lease.token": original.lease!.token,
            "lease.until": { $gt: new Date() },
          },
          { session },
        );
        if (!document) return false;
        const author = await authorizeUploadAuthor({
          db: this.db,
          authDb: this.authDb,
          ...document,
          session,
        });
        await assertAttachmentTargetExists(
          this.db,
          author,
          document.input.target,
          session,
        );
        if (document.kind === "photo") {
          // Transfer the already-held slot; do not admit/count it a second time.
          const lock = await this.db
            .collection<{
              _id: string;
              revision: number;
            }>("attachmentTargetLocks")
            .updateOne(
              { _id: attachmentTargetLockId(author, document.input.target) },
              { $inc: { revision: 1 } },
              { session },
            );
          if (!lock.matchedCount) throw new Error("Missing admission lock");
        }
        const sourceId = new ObjectId();
        const input = uploadIntentInputSchema.parse(document.input);
        await this.db
          .collection(
            document.kind === "photo" ? "attachments" : "documentSources",
          )
          .insertOne(
            {
              _id: sourceId,
              organizationId: document.organizationId,
              storeId: document.storeId,
              target: input.target,
              targetKey: document.targetKey,
              originalFileName: input.originalFileName,
              caption: input.caption,
              mimeType: input.mimeType,
              sizeBytes: input.sizeBytes,
              checksumSha256: input.checksumSha256,
              retentionPolicy: attachmentRetentionPolicy,
              uploadedBy: document.ownerId,
              createdAt: new Date(),
              storage: document.storage,
              storageState: "linked",
              uploadIntentId: document._id,
              verification,
            },
            { session },
          );
        document.state = "linked";
        await intents.updateOne(
          { _id: document._id, ...this.scope(context) },
          {
            $set: {
              state: "linked",
              sourceId,
              verification,
              cleanupRequired: false,
              artifacts: [{ kind: "original", storage: document.storage }],
            },
            $unset: { lease: "", lastMaintenanceCode: "" },
          },
          { session },
        );
        await this.audit(
          document,
          document.ownerId,
          requestId,
          "attachment.upload_linked",
          session,
        );
        return true;
      });
    } finally {
      await session.endSession();
    }
  }

  private async releaseNeverIssued(
    context: AuthorizedStoreContext,
    original: IntentDocument,
    requestId: string,
  ) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const intents = this.db.collection<IntentDocument>("uploadIntents");
        const document = await intents.findOne(
          {
            ...this.scope(context),
            _id: original._id,
            authorization: { $exists: false },
            budgetHeld: true,
            "lease.token": original.lease!.token,
            state: { $in: ["reserved", "cancelled", "rejected", "deleting"] },
          },
          { session },
        );
        if (!document) return false;
        const storeKey = createHash("sha256")
          .update(
            JSON.stringify([
              document.organizationId,
              document.storeId.toHexString(),
            ]),
          )
          .digest("hex");
        for (const key of [
          `environment:${this.config.storeId}`,
          `store:${this.config.storeId}:${storeKey}`,
        ]) {
          const quota = await this.db
            .collection<{
              _id: string;
              bytes: number;
              objects: number;
            }>("objectStorageQuotas")
            .updateOne(
              {
                _id: key,
                bytes: { $gte: document.input.sizeBytes },
                objects: { $gte: 1 },
              },
              { $inc: { bytes: -document.input.sizeBytes, objects: -1 } },
              { session },
            );
          if (!quota.matchedCount) throw new Error("Quota inconsistency");
        }
        document.state = "deleted";
        document.budgetHeld = false;
        await intents.updateOne(
          { ...this.scope(context), _id: document._id },
          {
            $set: {
              state: "deleted",
              budgetHeld: false,
              cleanupRequired: false,
            },
            $unset: { lease: "", lastMaintenanceCode: "" },
          },
          { session },
        );
        await this.audit(
          document,
          context.userId,
          requestId,
          "attachment.upload_reservation_released",
          session,
        );
        return true;
      });
    } finally {
      await session.endSession();
    }
  }

  async removeSource(
    context: AuthorizedStoreContext,
    sourceId: ObjectId,
    requestId: string,
  ) {
    const scope = this.scope(context);
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        const intents = this.db.collection<IntentDocument>("uploadIntents");
        const document = await intents.findOne(
          {
            ...scope,
            sourceId,
            state: { $in: ["linked", "deleting", "deleted"] },
          },
          { session },
        );
        if (!document)
          throw new PrivateStorageError(
            "UPLOAD_NOT_FOUND",
            "Source introuvable ou accès refusé",
          );
        if (document.state !== "linked") return;
        await this.db
          .collection(
            document.kind === "photo" ? "attachments" : "documentSources",
          )
          .updateOne(
            {
              _id: sourceId,
              organizationId: context.organizationId,
              storeId: new ObjectId(context.storeId),
            },
            { $set: { storageState: "deleting" } },
            { session },
          );
        document.state = "deleting";
        await intents.updateOne(
          { ...scope, _id: document._id },
          {
            $set: {
              state: "deleting",
              cleanupRequired: true,
              reconcileAfter: new Date(),
              artifacts: [{ kind: "original", storage: document.storage }],
            },
            $unset: { lease: "" },
          },
          { session },
        );
        await this.audit(
          document,
          context.userId,
          requestId,
          "attachment.source_access_removed",
          session,
        );
      });
      return { state: "deleting" as const, deletionComplete: false as const };
    } finally {
      await session.endSession();
    }
  }
}
