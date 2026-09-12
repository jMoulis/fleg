import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Db, MongoClient, MongoServerError, ObjectId } from "mongodb";
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

  async get(
    context: AuthorizedStoreContext,
    id: string,
  ): Promise<UploadIntentReceipt> {
    requireWriter(context);
    const document = await this.db
      .collection<IntentDocument>("uploadIntents")
      .findOne({
        _id: id,
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
        ownerId: context.userId,
        "storage.storeId": this.config.storeId,
        "storage.namespace": this.config.namespace,
      });
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
