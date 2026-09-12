import "server-only";
import { ObjectId, type Db } from "mongodb";
import * as z from "zod";
import {
  documentSourceIdSchema,
  documentSourceSchema,
  documentSourceListSchema,
} from "@/domain/attachments/document-source";
import {
  PrivateStorageError,
  privateBlobReferenceSchema,
  uploadIntentInputSchema,
} from "@/domain/attachments/private-storage";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { PrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { pdfValidationSchema } from "@/server/storage/pdf-validator";

const storedSourceSchema = documentSourceSchema
  .omit({ id: true, createdAt: true, contentUrl: true, pageCount: true })
  .extend({
    _id: z.instanceof(ObjectId),
    createdAt: z.date(),
    storage: privateBlobReferenceSchema,
    verification: pdfValidationSchema.extend({ verifiedAt: z.date() }),
    uploadIntentId: z.uuid(),
    mimeType: z.literal("application/pdf"),
  });

export class DocumentSourceRepository {
  constructor(private readonly db: Db) {}
  private scope(context: AuthorizedStoreContext) {
    if (!context.permissions.includes("stores.read"))
      throw new StoreAccessDeniedError();
    return {
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      storageState: "linked" as const,
    };
  }
  async list(context: AuthorizedStoreContext, cursor?: string) {
    const scope = this.scope(context);
    const documents = await this.db
      .collection("documentSources")
      .find({
        ...scope,
        ...(cursor
          ? { _id: { $lt: new ObjectId(documentSourceIdSchema.parse(cursor)) } }
          : {}),
      })
      .sort({ _id: -1 })
      .limit(21)
      .toArray();
    const parsed = documents.map((document) =>
      storedSourceSchema.parse(document),
    );
    return documentSourceListSchema.parse({
      sources: parsed.slice(0, 20).map((document) =>
        documentSourceSchema.parse({
          ...document,
          id: document._id.toHexString(),
          createdAt: document.createdAt.toISOString(),
          pageCount: document.verification.pageCount,
          contentUrl: `/api/stores/${context.storeId}/attachments/documents/${document._id.toHexString()}/content`,
        }),
      ),
      nextCursor: parsed.length > 20 ? parsed[19]!._id.toHexString() : null,
    });
  }
  async content(
    context: AuthorizedStoreContext,
    id: string,
    objects: PrivateUploadObjectStore,
  ) {
    const filter = {
      ...this.scope(context),
      _id: new ObjectId(documentSourceIdSchema.parse(id)),
    };
    const sources = this.db.collection("documentSources");
    const rawDocument = await sources.findOne(filter);
    if (!rawDocument)
      throw new PrivateStorageError(
        "UPLOAD_NOT_FOUND",
        "Document introuvable ou accès refusé",
      );
    // Validate persisted proof and metadata; the bytes are hashed again on every
    // download but the expensive PDF parse is not repeated for immutable data.
    const document = storedSourceSchema.parse(rawDocument);
    const verification = document.verification;
    const reference = document.storage;
    const input = uploadIntentInputSchema.parse({
      kind: "document",
      target: { type: "store" },
      idempotencyKey: document.uploadIntentId,
      originalFileName: document.originalFileName,
      caption: document.caption,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      checksumSha256: document.checksumSha256,
    });
    const bytes = await objects.read(context, reference, input);
    if (!bytes)
      throw new PrivateStorageError(
        "STORAGE_UNAVAILABLE",
        "Document temporairement indisponible",
      );
    const current = await sources.findOne(
      {
        ...filter,
        "storage.pathname": reference.pathname,
        "storage.storeId": reference.storeId,
        "storage.namespace": reference.namespace,
        checksumSha256: input.checksumSha256,
      },
      { projection: { _id: 1 } },
    );
    if (!current)
      throw new PrivateStorageError(
        "UPLOAD_NOT_FOUND",
        "Document introuvable ou accès refusé",
      );
    return {
      bytes,
      originalFileName: input.originalFileName,
      pageCount: verification.pageCount,
    };
  }
}
