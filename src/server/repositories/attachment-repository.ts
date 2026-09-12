import "server-only";

import { createHash } from "node:crypto";

import {
  Binary,
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  attachmentMaxPerTarget,
  attachmentRetentionPolicy,
  attachmentSchema,
  attachmentTargetKey,
  type Attachment,
  type AttachmentCreateMetadata,
  type AttachmentMimeType,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";
import { buildAttachmentScope } from "@/domain/attachments/store-scope";
import {
  PrivateStorageError,
  privateBlobReferenceSchema,
  type PrivateBlobReference,
} from "@/domain/attachments/private-storage";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  assertAttachmentTargetExists,
  prepareAttachmentTargetLock,
  reserveAttachmentTargetSlot,
} from "@/server/repositories/attachment-target";
import type { PrivateObjectReader } from "@/server/storage/private-object-reader";

type AttachmentDocument = Omit<
  Attachment,
  "id" | "storeId" | "createdAt" | "contentUrl"
> & {
  storeId: ObjectId;
  createdAt: Date;
  storage?: { backend: "mongo_bson" } | PrivateBlobReference;
  storageState?: "linked" | "deleting";
};

interface AttachmentObjectDocument {
  organizationId: string;
  storeId: ObjectId;
  mimeType: AttachmentMimeType;
  sizeBytes: number;
  checksumSha256: string;
  content: Binary;
  createdAt: Date;
}

interface AttachmentCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  action: "create" | "delete";
  attachmentId: ObjectId;
  snapshot: Attachment;
  payloadHash?: string;
  createdAt: Date;
}

export class AttachmentReferenceError extends Error {
  readonly code = "ATTACHMENT_REFERENCE_INVALID";

  constructor(message = "La cible de la photo n’existe pas dans ce magasin") {
    super(message);
    this.name = "AttachmentReferenceError";
  }
}

export class AttachmentNotFoundError extends Error {
  readonly code = "ATTACHMENT_NOT_FOUND";

  constructor() {
    super("Photo introuvable ou accès refusé");
    this.name = "AttachmentNotFoundError";
  }
}

export class AttachmentLimitError extends Error {
  readonly code = "ATTACHMENT_LIMIT_REACHED";

  constructor() {
    super(
      `La limite de ${attachmentMaxPerTarget} photos est atteinte pour cette cible`,
    );
    this.name = "AttachmentLimitError";
  }
}

export class AttachmentConflictError extends Error {
  readonly code = "ATTACHMENT_CONFLICT";

  constructor() {
    super("Cette clé d’idempotence a déjà servi à une autre opération");
    this.name = "AttachmentConflictError";
  }
}

function toAttachment(document: WithId<AttachmentDocument>): Attachment {
  const storeId = document.storeId.toHexString();
  return attachmentSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId,
    createdAt: document.createdAt.toISOString(),
    contentUrl: `/api/stores/${storeId}/attachments/${document._id.toHexString()}/content`,
  });
}

export class AttachmentRepository {
  private readonly attachments;
  private readonly attachmentObjects;
  private readonly attachmentCommands;
  private readonly auditLogs;

  constructor(
    private readonly db: Db,
    private readonly client?: MongoClient,
    private readonly privateReader?: () => PrivateObjectReader,
  ) {
    this.attachments = db.collection<AttachmentDocument>("attachments");
    this.attachmentObjects =
      db.collection<AttachmentObjectDocument>("attachmentObjects");
    this.attachmentCommands =
      db.collection<AttachmentCommandDocument>("attachmentCommands");
    this.auditLogs = db.collection("auditLogs");
  }

  async listForStore(
    context: AuthorizedStoreContext,
    targetTypes?: AttachmentTarget["type"][],
  ): Promise<Attachment[]> {
    if (!context.permissions.includes("stores.read"))
      throw new StoreAccessDeniedError();
    const scope = buildAttachmentScope(context);
    const documents = await this.attachments
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        $or: [
          { storage: { $exists: false } },
          { "storage.backend": "mongo_bson" },
          { "storage.backend": "vercel_blob", storageState: "linked" },
        ],
        ...(targetTypes && targetTypes.length > 0
          ? { "target.type": { $in: targetTypes } }
          : {}),
      })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    return documents.map(toAttachment);
  }

  async getContent(input: {
    context: AuthorizedStoreContext;
    attachmentId: string;
  }): Promise<{
    attachment: Attachment;
    bytes: Uint8Array;
  }> {
    if (!input.context.permissions.includes("stores.read"))
      throw new StoreAccessDeniedError();
    const scope = buildAttachmentScope(input.context);
    const attachmentId = new ObjectId(input.attachmentId);
    const storeId = new ObjectId(scope.storeId);
    const attachmentDocument = await this.attachments.findOne({
      _id: attachmentId,
      organizationId: scope.organizationId,
      storeId,
    });
    if (!attachmentDocument) throw new AttachmentNotFoundError();
    const attachment = toAttachment(attachmentDocument);
    if (
      attachmentDocument.storage &&
      attachmentDocument.storage.backend !== "mongo_bson"
    ) {
      const reference = privateBlobReferenceSchema.parse(
        attachmentDocument.storage,
      );
      if (attachmentDocument.storageState !== "linked")
        throw new AttachmentNotFoundError();
      if (!this.privateReader)
        throw new PrivateStorageError(
          "STORAGE_UNAVAILABLE",
          "Lecture du stockage privé indisponible",
        );
      const bytes = await this.privateReader().readPhoto(
        input.context,
        reference,
        attachment,
      );
      // A deletion while fetching wins before content is returned.
      const stillVisible = await this.attachments.findOne(
        {
          _id: attachmentId,
          organizationId: scope.organizationId,
          storeId,
          storageState: "linked",
          storage: reference,
        },
        { projection: { _id: 1 } },
      );
      if (!stillVisible) throw new AttachmentNotFoundError();
      return { attachment, bytes };
    }
    const objectDocument = await this.attachmentObjects.findOne({
      _id: attachmentId,
      organizationId: scope.organizationId,
      storeId,
    });
    if (!objectDocument) {
      throw new AttachmentNotFoundError();
    }
    return {
      attachment,
      bytes: new Uint8Array(objectDocument.content.buffer),
    };
  }

  async create(input: {
    context: AuthorizedStoreContext;
    metadata: AttachmentCreateMetadata;
    originalFileName: string;
    mimeType: AttachmentMimeType;
    bytes: Uint8Array;
    checksumSha256: string;
    requestId: string;
  }): Promise<Attachment> {
    const { context, metadata } = input;
    if (!context.permissions.includes("attachments.write"))
      throw new StoreAccessDeniedError();
    const scope = buildAttachmentScope(context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: metadata.idempotencyKey,
    };
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify({
          metadata,
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          sizeBytes: input.bytes.byteLength,
          checksumSha256: input.checksumSha256,
        }),
      )
      .digest("hex");
    const replay = (command: AttachmentCommandDocument) => {
      const snapshot = attachmentSchema.parse(command.snapshot);
      // Historical receipts did not have a payload hash; compare their frozen
      // business fields instead of accepting any payload with the same key.
      if (
        command.action !== "create" ||
        snapshot.uploadedBy !== context.userId ||
        (command.payloadHash
          ? command.payloadHash !== payloadHash
          : snapshot.targetKey !== attachmentTargetKey(metadata.target) ||
            snapshot.caption !== metadata.caption ||
            snapshot.originalFileName !== input.originalFileName ||
            snapshot.mimeType !== input.mimeType ||
            snapshot.sizeBytes !== input.bytes.byteLength ||
            snapshot.checksumSha256 !== input.checksumSha256)
      )
        throw new AttachmentConflictError();
      return snapshot;
    };
    const duplicate = await this.attachmentCommands.findOne(commandFilter);
    if (duplicate) {
      return replay(duplicate);
    }
    if (!this.client)
      throw new Error("Client MongoDB requis pour cette opération");

    // Invalid targets must not leave permanent lock documents behind.
    await assertAttachmentTargetExists(this.db, context, metadata.target);
    await prepareAttachmentTargetLock(this.db, context, metadata.target);

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const existing = await this.attachmentCommands.findOne(commandFilter, {
          session,
        });
        if (existing) return replay(existing);
        await assertAttachmentTargetExists(
          this.db,
          context,
          metadata.target,
          session,
        );
        await reserveAttachmentTargetSlot(
          this.db,
          context,
          metadata.target,
          session,
        );
        const targetKey = attachmentTargetKey(metadata.target);

        const attachmentId = new ObjectId();
        const createdAt = new Date();
        const attachment = attachmentSchema.parse({
          id: attachmentId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          target: metadata.target,
          targetKey,
          caption: metadata.caption,
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          sizeBytes: input.bytes.byteLength,
          checksumSha256: input.checksumSha256,
          retentionPolicy: attachmentRetentionPolicy,
          uploadedBy: context.userId,
          createdAt: createdAt.toISOString(),
          contentUrl: `/api/stores/${scope.storeId}/attachments/${attachmentId.toHexString()}/content`,
        });

        await this.attachments.insertOne(
          {
            _id: attachmentId,
            organizationId: attachment.organizationId,
            storeId,
            target: attachment.target,
            targetKey: attachment.targetKey,
            caption: attachment.caption,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            checksumSha256: attachment.checksumSha256,
            retentionPolicy: attachment.retentionPolicy,
            uploadedBy: attachment.uploadedBy,
            createdAt,
          },
          { session },
        );
        await this.attachmentObjects.insertOne(
          {
            _id: attachmentId,
            organizationId: scope.organizationId,
            storeId,
            mimeType: input.mimeType,
            sizeBytes: input.bytes.byteLength,
            checksumSha256: input.checksumSha256,
            content: new Binary(input.bytes),
            createdAt,
          },
          { session },
        );
        await this.attachmentCommands.insertOne(
          {
            ...commandFilter,
            action: "create",
            attachmentId,
            snapshot: attachment,
            payloadHash,
            createdAt,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "attachment.created",
            entityType: "attachment",
            entityId: attachmentId,
            before: null,
            after: attachment,
            requestId: input.requestId,
            timestamp: createdAt,
            createdAt,
          },
          { session },
        );
        return attachment;
      });
      if (!result) throw new Error("La photo n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.attachmentCommands.findOne(commandFilter);
        if (existing?.action === "create") {
          return replay(existing);
        }
        throw new AttachmentConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async delete(input: {
    context: AuthorizedStoreContext;
    attachmentId: string;
    idempotencyKey: string;
    requestId: string;
  }): Promise<Attachment> {
    if (!input.context.permissions.includes("attachments.write"))
      throw new StoreAccessDeniedError();
    const scope = buildAttachmentScope(input.context);
    const storeId = new ObjectId(scope.storeId);
    const attachmentId = new ObjectId(input.attachmentId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: input.idempotencyKey,
    };
    const duplicate = await this.attachmentCommands.findOne(commandFilter);
    if (duplicate) {
      if (
        duplicate.action !== "delete" ||
        !duplicate.attachmentId.equals(attachmentId)
      ) {
        throw new AttachmentConflictError();
      }
      return attachmentSchema.parse(duplicate.snapshot);
    }
    if (!this.client)
      throw new Error("Client MongoDB requis pour cette opération");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const document = await this.attachments.findOne(
          {
            _id: attachmentId,
            organizationId: scope.organizationId,
            storeId,
          },
          { session },
        );
        if (!document) throw new AttachmentNotFoundError();
        // No remote objects can yet be created through the app. Until the
        // durable deletion worker ships, never orphan one via BSON deletion.
        if (document.storage && document.storage.backend !== "mongo_bson")
          throw new PrivateStorageError(
            "STORAGE_UNAVAILABLE",
            "La suppression des photos distantes n’est pas encore activée",
          );
        const attachment = toAttachment(document);

        await this.attachmentObjects.deleteOne(
          { _id: attachmentId, organizationId: scope.organizationId, storeId },
          { session },
        );
        await this.attachments.deleteOne(
          { _id: attachmentId, organizationId: scope.organizationId, storeId },
          { session },
        );
        const deletedAt = new Date();
        await this.attachmentCommands.insertOne(
          {
            ...commandFilter,
            action: "delete",
            attachmentId,
            snapshot: attachment,
            createdAt: deletedAt,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: input.context.userId,
            action: "attachment.deleted",
            entityType: "attachment",
            entityId: attachmentId,
            before: attachment,
            after: null,
            requestId: input.requestId,
            timestamp: deletedAt,
            createdAt: deletedAt,
          },
          { session },
        );
        return attachment;
      });
      if (!result) throw new Error("La photo n’a pas été supprimée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.attachmentCommands.findOne(commandFilter);
        if (
          existing?.action === "delete" &&
          existing.attachmentId.equals(attachmentId)
        ) {
          return attachmentSchema.parse(existing.snapshot);
        }
        throw new AttachmentConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
