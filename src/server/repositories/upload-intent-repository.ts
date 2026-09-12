import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type ClientSession,
} from "mongodb";
import { normalizePhotoFileName } from "@/domain/attachments/photo-validation";
import {
  PrivateStorageError,
  uploadIntentAbandonAfterMs,
  uploadIntentInputSchema,
  uploadIntentReceiptSchema,
  type PrivateBlobReference,
  type UploadIntentInput,
  type UploadIntentReceipt,
} from "@/domain/attachments/private-storage";
import { attachmentTargetKey } from "@/domain/attachments/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  assertAttachmentTargetExists,
  prepareAttachmentTargetLock,
  reserveAttachmentTargetSlot,
} from "@/server/repositories/attachment-target";
import type { UploadIntentConfig } from "@/server/storage/config";
import { scopedObjectPrefix } from "@/server/storage/private-object-reader";
import {
  uploadAuthorizationLifetimeMs,
  uploadAuthorizationMaxIssuances,
  uploadGrantSchema,
  type ProviderCompletion,
  type UploadGrant,
} from "@/domain/attachments/upload-transport";

interface IntentDocument {
  _id: string;
  organizationId: string;
  storeId: ObjectId;
  ownerId: string;
  idempotencyKey: string;
  payloadHash: string;
  input: UploadIntentInput;
  kind: UploadIntentInput["kind"];
  targetKey: string;
  storage: PrivateBlobReference;
  state: UploadIntentReceipt["state"];
  budgetHeld: boolean;
  createdAt: Date;
  reconcileAfter: Date;
  authorization?: {
    attemptId: string;
    issuedAt: Date;
    validUntil: Date;
    issueCount: number;
  };
  callbackReceivedAt?: Date;
  cancelledAt?: Date;
  lateUploadReceivedAt?: Date;
  cleanupRequired?: boolean;
}
interface QuotaDocument {
  _id: string;
  bytes: number;
  objects: number;
}

function requireWriter(context: AuthorizedStoreContext) {
  if (!context.permissions.includes("attachments.write"))
    throw new StoreAccessDeniedError();
}
function receipt(document: IntentDocument): UploadIntentReceipt {
  return uploadIntentReceiptSchema.parse({
    id: document._id,
    state: document.state,
    createdAt: document.createdAt.toISOString(),
    reconcileAfter: document.reconcileAfter.toISOString(),
    uploadAvailable: false,
  });
}

export class UploadIntentRepository {
  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
    private readonly config: UploadIntentConfig,
  ) {}

  private ownerFilter(context: AuthorizedStoreContext, id: string) {
    requireWriter(context);
    return {
      _id: id,
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      ownerId: context.userId,
      "storage.storeId": this.config.storeId,
      "storage.namespace": this.config.namespace,
    };
  }

  private async audit(
    document: IntentDocument,
    action: string,
    actorId: string,
    requestId: string,
    session: ClientSession,
  ) {
    const timestamp = new Date();
    await this.db.collection("auditLogs").insertOne(
      {
        organizationId: document.organizationId,
        storeId: document.storeId,
        actorId,
        action,
        entityType: "upload_intent",
        entityId: document._id,
        before: null,
        after: {
          state: document.state,
          kind: document.kind,
          budgetHeld: document.budgetHeld,
        },
        requestId,
        timestamp,
        createdAt: timestamp,
      },
      { session },
    );
  }

  // Commit the capability ceiling BEFORE calling Blob. A timeout after issuance
  // must leave durable evidence of a possibly usable authorization.
  async beginAuthorization(
    context: AuthorizedStoreContext,
    id: string,
    requestId: string,
  ): Promise<UploadGrant> {
    const filter = this.ownerFilter(context, id);
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const document = await this.db
          .collection<IntentDocument>("uploadIntents")
          .findOne(filter, { session });
        if (!document)
          throw new PrivateStorageError(
            "UPLOAD_NOT_FOUND",
            "Intention introuvable ou accès refusé",
          );
        const now = new Date();
        if (
          document.state !== "reserved" ||
          !document.budgetHeld ||
          now.getTime() >=
            (
              document.authorization?.validUntil ?? document.reconcileAfter
            ).getTime()
        )
          throw new PrivateStorageError(
            "UPLOAD_CONFLICT",
            "Cette intention n’autorise plus d’envoi",
          );
        await assertAttachmentTargetExists(
          this.db,
          context,
          document.input.target,
          session,
        );
        const firstIssuance = !document.authorization;
        if (!document.authorization) {
          document.authorization = {
            attemptId: randomUUID(),
            issuedAt: now,
            issueCount: 0,
            validUntil: new Date(now.getTime() + uploadAuthorizationLifetimeMs),
          };
          // The original 24h abandonment ceiling is not evidence of remote absence.
          document.reconcileAfter = document.authorization.validUntil;
        }
        if (
          document.authorization.issueCount >= uploadAuthorizationMaxIssuances
        )
          throw new PrivateStorageError(
            "UPLOAD_CONFLICT",
            "Le nombre de tentatives d’envoi est atteint",
          );
        document.authorization.issueCount++;
        await this.db.collection<IntentDocument>("uploadIntents").updateOne(
          filter,
          {
            $set: {
              authorization: document.authorization,
              reconcileAfter: document.reconcileAfter,
            },
          },
          { session },
        );
        if (firstIssuance)
          await this.audit(
            document,
            "attachment.upload_authorized",
            context.userId,
            requestId,
            session,
          );
        return uploadGrantSchema.parse({
          intentId: document._id,
          attemptId: document.authorization.attemptId,
          storage: document.storage,
          input: document.input,
          issuedAt: document.authorization.issuedAt.toISOString(),
          validUntil: document.authorization.validUntil.toISOString(),
        });
      });
      if (!result) throw new Error("Autorisation non enregistrée");
      return result;
    } finally {
      await session.endSession();
    }
  }

  // Recheck after slow provider work. Cancellation cannot revoke an already
  // minted URL, but we must not knowingly return it after cancellation.
  async assertAuthorizationCurrent(
    context: AuthorizedStoreContext,
    grant: UploadGrant,
  ): Promise<void> {
    const document = await this.db
      .collection<IntentDocument>("uploadIntents")
      .findOne({
        ...this.ownerFilter(context, grant.intentId),
        state: "reserved",
        budgetHeld: true,
        "authorization.attemptId": grant.attemptId,
        "authorization.validUntil": { $gt: new Date() },
      });
    if (!document)
      throw new PrivateStorageError(
        "UPLOAD_CONFLICT",
        "L’autorisation d’envoi n’est plus active",
      );
    await assertAttachmentTargetExists(this.db, context, document.input.target);
  }

  async cancel(
    context: AuthorizedStoreContext,
    id: string,
    requestId: string,
  ): Promise<UploadIntentReceipt> {
    const filter = this.ownerFilter(context, id);
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const document = await this.db
          .collection<IntentDocument>("uploadIntents")
          .findOne(filter, { session });
        if (!document)
          throw new PrivateStorageError(
            "UPLOAD_NOT_FOUND",
            "Intention introuvable ou accès refusé",
          );
        if (document.state === "cancelled") return receipt(document);
        if (!["reserved", "uploaded"].includes(document.state))
          throw new PrivateStorageError(
            "UPLOAD_CONFLICT",
            "Cette intention ne peut plus être annulée",
          );
        document.state = "cancelled";
        document.cancelledAt = new Date();
        document.reconcileAfter = document.cancelledAt;
        document.cleanupRequired = true;
        // Do not release a quota, remove a tombstone or call del() here. Even a
        // timed-out signer may have issued a token; late/multipart uploads remain
        // possible. Lot 2b will prove absence and finalize the physical cleanup.
        await this.db.collection<IntentDocument>("uploadIntents").updateOne(
          filter,
          {
            $set: {
              state: document.state,
              cancelledAt: document.cancelledAt,
              reconcileAfter: document.reconcileAfter,
              cleanupRequired: true,
            },
          },
          { session },
        );
        await this.audit(
          document,
          "attachment.upload_cancelled",
          context.userId,
          requestId,
          session,
        );
        return receipt(document);
      });
      if (!result) throw new Error("Annulation non enregistrée");
      return result;
    } finally {
      await session.endSession();
    }
  }

  // Infrastructure entry point, ONLY after provider signature verification.
  // Never grants business access or links a source. The future verification
  // worker must reconstruct and reauthorize the persisted author/store scope.
  async recordCompletion(
    completion: ProviderCompletion,
    requestId: string,
  ): Promise<void> {
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        const intents = this.db.collection<IntentDocument>("uploadIntents");
        const document = await intents.findOne(
          {
            _id: completion.intentId,
            "storage.storeId": this.config.storeId,
            "storage.namespace": this.config.namespace,
            "storage.pathname": completion.pathname,
            "authorization.attemptId": completion.attemptId,
          },
          { session },
        );
        const expectedUrl = document
          ? `https://${this.config.storeId.slice(6).toLowerCase()}.private.blob.vercel-storage.com/${document.storage.pathname}`
          : null;
        if (
          !document ||
          completion.url !== expectedUrl ||
          completion.contentType !== document.input.mimeType
        )
          throw new PrivateStorageError(
            "UPLOAD_CALLBACK_INVALID",
            "Notification d’envoi invalide",
          );
        const late = ["cancelled", "rejected", "deleting", "deleted"].includes(
          document.state,
        );
        if (
          late &&
          document.lateUploadReceivedAt &&
          !document.cleanupRequired
        ) {
          // A previous cleanup pass may have run between two deliveries of a
          // callback. Re-arm reconciliation without restoring visibility or
          // duplicating the audit/inbox; a replay is not proof of remote absence.
          await intents.updateOne(
            {
              _id: document._id,
              organizationId: document.organizationId,
              storeId: document.storeId,
            },
            { $set: { cleanupRequired: true, reconcileAfter: new Date() } },
            { session },
          );
          return;
        }
        if (late ? document.lateUploadReceivedAt : document.callbackReceivedAt)
          return;
        const now = new Date();
        // Persist only the first observation: duplicate callbacks cannot grow an
        // inbox or duplicate audits. Neither the URL nor its query is retained.
        if (late) {
          document.lateUploadReceivedAt = now;
          document.cleanupRequired = true;
        } else {
          document.callbackReceivedAt = now;
          if (document.state === "reserved") document.state = "uploaded";
        }
        document.reconcileAfter = now;
        await intents.updateOne(
          {
            _id: document._id,
            organizationId: document.organizationId,
            storeId: document.storeId,
          },
          {
            $set: {
              state: document.state,
              reconcileAfter: now,
              ...(late
                ? { lateUploadReceivedAt: now, cleanupRequired: true }
                : { callbackReceivedAt: now }),
            },
          },
          { session },
        );
        await this.audit(
          document,
          late
            ? "attachment.upload_received_after_cancellation"
            : "attachment.upload_received",
          "system:blob-callback",
          requestId,
          session,
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async get(
    context: AuthorizedStoreContext,
    id: string,
  ): Promise<UploadIntentReceipt> {
    requireWriter(context);
    const document = await this.db
      .collection<IntentDocument>("uploadIntents")
      .findOne(this.ownerFilter(context, id));
    if (!document)
      throw new PrivateStorageError(
        "UPLOAD_NOT_FOUND",
        "Intention introuvable ou accès refusé",
      );
    return receipt(document);
  }

  async reserve(
    context: AuthorizedStoreContext,
    rawInput: UploadIntentInput,
    requestId: string,
  ): Promise<UploadIntentReceipt> {
    requireWriter(context);
    const parsed = uploadIntentInputSchema.parse(rawInput);
    const input = {
      ...parsed,
      originalFileName: normalizePhotoFileName(parsed.originalFileName),
    };
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const intents = this.db.collection<IntentDocument>("uploadIntents");
    const filter = {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      idempotencyKey: input.idempotencyKey,
    };
    const replay = (document: IntentDocument) => {
      if (
        document.ownerId !== context.userId ||
        document.payloadHash !== payloadHash ||
        document.storage.storeId !== this.config.storeId ||
        document.storage.namespace !== this.config.namespace
      ) {
        throw new PrivateStorageError(
          "UPLOAD_CONFLICT",
          "Cette clé correspond à un autre contenu ou propriétaire",
        );
      }
      return receipt(document);
    };
    const duplicate = await intents.findOne(filter);
    if (duplicate) return replay(duplicate);

    // Avoid accumulating lock/quota rows from rejected forged targets.
    // Check again inside the transaction before the reservation is committed.
    await assertAttachmentTargetExists(this.db, context, input.target);

    const quotas = this.db.collection<QuotaDocument>("objectStorageQuotas");
    // The first counter is infrastructure-wide, not a cross-store business read.
    // It covers every namespace sharing the same approved Blob resource.
    const globalKey = `environment:${this.config.storeId}`;
    const storeKey = `store:${this.config.storeId}:${createHash("sha256")
      .update(
        JSON.stringify([context.organizationId, context.storeId.toLowerCase()]),
      )
      .digest("hex")}`;
    for (const _id of [globalKey, storeKey])
      await quotas.updateOne(
        { _id },
        { $setOnInsert: { bytes: 0, objects: 0 } },
        { upsert: true },
      );
    if (input.kind === "photo")
      await prepareAttachmentTargetLock(this.db, context, input.target);
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const existing = await intents.findOne(filter, { session });
        if (existing) return replay(existing);
        await assertAttachmentTargetExists(
          this.db,
          context,
          input.target,
          session,
        );
        if (input.kind === "photo")
          await reserveAttachmentTargetSlot(
            this.db,
            context,
            input.target,
            session,
          );
        for (const [_id, limit, objectLimit] of [
          [
            globalKey,
            this.config.environmentQuotaBytes,
            this.config.environmentQuotaObjects,
          ],
          [
            storeKey,
            this.config.storeQuotaBytes,
            this.config.storeQuotaObjects,
          ],
        ] as const) {
          const reserved = await quotas.updateOne(
            {
              _id,
              bytes: { $lte: limit - input.sizeBytes },
              objects: { $lt: objectLimit },
            },
            { $inc: { bytes: input.sizeBytes, objects: 1 } },
            { session },
          );
          if (reserved.modifiedCount !== 1)
            throw new PrivateStorageError(
              "UPLOAD_QUOTA",
              "Le plafond de stockage ou de réservation est atteint",
            );
        }
        const id = randomUUID();
        const extension = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "application/pdf": "pdf",
        }[input.mimeType];
        const createdAt = new Date();
        const document: IntentDocument = {
          _id: id,
          ...filter,
          ownerId: context.userId,
          payloadHash,
          input,
          kind: input.kind,
          targetKey: attachmentTargetKey(input.target),
          storage: {
            backend: "vercel_blob",
            storeId: this.config.storeId,
            namespace: this.config.namespace,
            pathname: `${scopedObjectPrefix(context, this.config.namespace)}${id}.${extension}`,
          },
          state: "reserved",
          budgetHeld: true,
          createdAt,
          reconcileAfter: new Date(
            createdAt.getTime() + uploadIntentAbandonAfterMs,
          ),
        };
        await intents.insertOne(document, { session });
        await this.db.collection("auditLogs").insertOne(
          {
            organizationId: context.organizationId,
            storeId: filter.storeId,
            actorId: context.userId,
            action: "attachment.upload_reserved",
            entityType: "upload_intent",
            entityId: id,
            before: null,
            after: {
              kind: input.kind,
              target: input.target,
              sizeBytes: input.sizeBytes,
              checksumSha256: input.checksumSha256,
              state: "reserved",
            },
            requestId,
            timestamp: createdAt,
            createdAt,
          },
          { session },
        );
        return receipt(document);
      });
      if (!result) throw new Error("Réservation non enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await intents.findOne(filter);
        if (duplicate) return replay(duplicate);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
