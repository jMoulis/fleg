import "server-only";

import {
  Binary,
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type ClientSession,
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
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

type AttachmentDocument = Omit<
  Attachment,
  "id" | "storeId" | "createdAt" | "contentUrl"
> & {
  storeId: ObjectId;
  createdAt: Date;
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
    super(`La limite de ${attachmentMaxPerTarget} photos est atteinte pour cette cible`);
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
  private readonly layoutVersions;
  private readonly commercialEvents;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.attachments = db.collection<AttachmentDocument>("attachments");
    this.attachmentObjects =
      db.collection<AttachmentObjectDocument>("attachmentObjects");
    this.attachmentCommands =
      db.collection<AttachmentCommandDocument>("attachmentCommands");
    this.layoutVersions = db.collection("layoutVersions");
    this.commercialEvents = db.collection("commercialEvents");
    this.auditLogs = db.collection("auditLogs");
  }

  async listForStore(
    context: AuthorizedStoreContext,
    targetTypes?: AttachmentTarget["type"][],
  ): Promise<Attachment[]> {
    const scope = buildAttachmentScope(context);
    const documents = await this.attachments
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
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
    const scope = buildAttachmentScope(input.context);
    const attachmentId = new ObjectId(input.attachmentId);
    const storeId = new ObjectId(scope.storeId);
    const [attachmentDocument, objectDocument] = await Promise.all([
      this.attachments.findOne({
        _id: attachmentId,
        organizationId: scope.organizationId,
        storeId,
      }),
      this.attachmentObjects.findOne({
        _id: attachmentId,
        organizationId: scope.organizationId,
        storeId,
      }),
    ]);
    if (!attachmentDocument || !objectDocument) {
      throw new AttachmentNotFoundError();
    }
    return {
      attachment: toAttachment(attachmentDocument),
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
    const scope = buildAttachmentScope(context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: metadata.idempotencyKey,
    };
    const duplicate = await this.attachmentCommands.findOne(commandFilter);
    if (duplicate) {
      if (duplicate.action !== "create") throw new AttachmentConflictError();
      return attachmentSchema.parse(duplicate.snapshot);
    }
    if (!this.client) throw new Error("Client MongoDB requis pour cette opération");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        await this.assertTargetExists({
          organizationId: scope.organizationId,
          storeId,
          target: metadata.target,
          session,
        });
        const targetKey = attachmentTargetKey(metadata.target);
        const count = await this.attachments.countDocuments(
          {
            organizationId: scope.organizationId,
            storeId,
            targetKey,
          },
          { session },
        );
        if (count >= attachmentMaxPerTarget) throw new AttachmentLimitError();

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
          return attachmentSchema.parse(existing.snapshot);
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
    if (!this.client) throw new Error("Client MongoDB requis pour cette opération");

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

  private async assertTargetExists(input: {
    organizationId: string;
    storeId: ObjectId;
    target: AttachmentTarget;
    session: ClientSession;
  }): Promise<void> {
    if (input.target.type === "store") return;

    if (input.target.type === "layout") {
      const layout = await this.layoutVersions.findOne(
        {
          _id: new ObjectId(input.target.layoutVersionId),
          organizationId: input.organizationId,
          storeId: input.storeId,
        },
        { projection: { _id: 1 }, session: input.session },
      );
      if (layout) return;
      throw new AttachmentReferenceError();
    }

    if (input.target.type === "fixture") {
      const layout = await this.layoutVersions.findOne(
        {
          _id: new ObjectId(input.target.layoutVersionId),
          organizationId: input.organizationId,
          storeId: input.storeId,
          fixtures: { $elemMatch: { id: input.target.fixtureId } },
        },
        { projection: { _id: 1 }, session: input.session },
      );
      if (layout) return;
      throw new AttachmentReferenceError();
    }

    const event = await this.commercialEvents.findOne(
      {
        _id: new ObjectId(input.target.eventId),
        organizationId: input.organizationId,
        storeId: input.storeId,
      },
      { projection: { _id: 1 }, session: input.session },
    );
    if (!event) throw new AttachmentReferenceError();
  }
}
