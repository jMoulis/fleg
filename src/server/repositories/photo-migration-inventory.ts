import "server-only";
import { createHash } from "node:crypto";
import { Binary, BSON, ObjectId, type Db, type Document } from "mongodb";
import { z } from "zod";
import {
  attachmentSchema,
  attachmentTargetKey,
  attachmentMaxSizeBytes,
} from "@/domain/attachments/schemas";
import { privateBlobReferenceSchema } from "@/domain/attachments/private-storage";
import { validatePhotoBytes } from "@/domain/attachments/photo-validation";
import {
  migrationInventoryLimits,
  migrationScopeSchema,
  migrationSnapshotSchema,
  type MigrationEntry,
} from "@/domain/attachments/migration-plan";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";
import { assertAttachmentTargetExists } from "./attachment-target";
import { AttachmentReferenceError } from "./attachment-repository";

const optionsSchema = migrationScopeSchema.extend({
  actorId: z.string().min(1).max(128),
  after: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .nullable()
    .default(null),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(migrationInventoryLimits.maxPageSize)
    .default(migrationInventoryLimits.defaultPageSize),
  maxReadBytes: z
    .number()
    .int()
    .min(attachmentMaxSizeBytes)
    .max(migrationInventoryLimits.maxReadBytes)
    .default(migrationInventoryLimits.defaultReadBytes),
});
const metadataProjection = {
  _id: 1,
  organizationId: 1,
  storeId: 1,
  target: 1,
  targetKey: 1,
  caption: 1,
  originalFileName: 1,
  mimeType: 1,
  sizeBytes: 1,
  checksumSha256: 1,
  retentionPolicy: 1,
  uploadedBy: 1,
  createdAt: 1,
  storage: 1,
  storageState: 1,
};
const bsonSizeExpression = {
  $cond: [
    { $eq: [{ $type: "$content" }, "binData"] },
    { $binarySize: "$content" },
    null,
  ],
};
const fingerprint = (value: Document) =>
  createHash("sha256").update(BSON.EJSON.stringify(value)).digest("hex");

// Read-only by construction: no Blob SDK, index creation, writes or audit inserts.
// Authorization is rebuilt from Better Auth + live store membership, not CLI role claims.
export async function inventoryLegacyPhotos(db: Db, authDb: Db, raw: unknown) {
  const input = optionsSchema.parse(raw);
  const context = await authorizeUploadAuthor({
    db,
    authDb,
    organizationId: input.organizationId,
    storeId: new ObjectId(input.storeId),
    ownerId: input.actorId,
  });
  if (context.role !== "organization_admin") throw new StoreAccessDeniedError();
  const scope = {
    organizationId: context.organizationId,
    storeId: new ObjectId(context.storeId),
  };
  const filter = {
    ...scope,
    ...(input.after ? { _id: { $gt: new ObjectId(input.after) } } : {}),
  };
  const queryOptions = { projection: { _id: 1 }, maxTimeMS: 5000 };
  // Merge two bounded ID pages so orphan BSON is not invisible to the inventory.
  const pages = await Promise.all(
    ["attachments", "attachmentObjects"].map((name) =>
      db
        .collection(name)
        .find(filter, queryOptions)
        .sort({ _id: 1 })
        .limit(input.pageSize + 1)
        .toArray(),
    ),
  );
  const ids = [
    ...new Set(
      pages.flat().map((row) => {
        if (!(row._id instanceof ObjectId))
          throw new Error("Identifiant historique invalide");
        return row._id.toHexString();
      }),
    ),
  ].sort();
  const entries: MigrationEntry[] = [];
  let bytesRead = 0;
  let budgetStopped = false;
  for (const id of ids.slice(0, input.pageSize)) {
    const exact = { ...scope, _id: new ObjectId(id) };
    const [metadata, objects] = await Promise.all([
      db
        .collection("attachments")
        .findOne(exact, { projection: metadataProjection, maxTimeMS: 5000 }),
      db
        .collection("attachmentObjects")
        .aggregate(
          [
            { $match: exact },
            { $limit: 1 },
            {
              $project: {
                _id: 1,
                mimeType: 1,
                sizeBytes: 1,
                checksumSha256: 1,
                contentSize: bsonSizeExpression,
              },
            },
          ],
          { maxTimeMS: 5000 },
        )
        .toArray(),
    ]);
    const object = objects[0];
    const base: MigrationEntry = {
      organizationId: context.organizationId,
      storeId: context.storeId,
      attachmentId: id,
      status: "invalid_metadata",
      bsonBytes:
        typeof object?.contentSize === "number" ? object.contentSize : null,
      checksumSha256: null,
      metadataFingerprint: metadata ? fingerprint(metadata) : null,
    };
    const add = (status: MigrationEntry["status"]) =>
      entries.push({ ...base, status });
    if (!metadata) {
      add(object ? "orphan_bson" : "changed_during_read");
      continue;
    }
    if (metadata.storageState === "deleting") {
      add("deleting");
      continue;
    }
    const parsed = attachmentSchema.safeParse({
      ...metadata,
      id,
      storeId: context.storeId,
      createdAt:
        metadata.createdAt instanceof Date
          ? metadata.createdAt.toISOString()
          : null,
      contentUrl: `/api/stores/${context.storeId}/attachments/${id}/content`,
    });
    if (
      !parsed.success ||
      parsed.data.targetKey !== attachmentTargetKey(parsed.data.target)
    ) {
      add("invalid_metadata");
      continue;
    }
    const attachment = parsed.data;
    base.checksumSha256 = attachment.checksumSha256;
    if (metadata.storage?.backend === "vercel_blob") {
      if (
        !privateBlobReferenceSchema.safeParse(metadata.storage).success ||
        metadata.storageState !== "linked"
      )
        add("invalid_metadata");
      else add(object ? "blob_with_bson" : "already_blob");
      continue;
    }
    if (metadata.storage && metadata.storage.backend !== "mongo_bson") {
      add("invalid_metadata");
      continue;
    }
    if (!object) {
      add("missing_bson");
      continue;
    }
    if (
      base.bsonBytes !== attachment.sizeBytes ||
      object.sizeBytes !== attachment.sizeBytes ||
      object.mimeType !== attachment.mimeType ||
      object.checksumSha256 !== attachment.checksumSha256
    ) {
      add("invalid_content");
      continue;
    }
    if (bytesRead + attachment.sizeBytes > input.maxReadBytes) {
      budgetStopped = true;
      break;
    }
    // Recheck size in the SAME server projection that returns bytes: a concurrent
    // oversized replacement cannot cause an unbounded client allocation.
    const actual = (
      await db
        .collection("attachmentObjects")
        .aggregate(
          [
            { $match: exact },
            { $limit: 1 },
            {
              $project: {
                content: {
                  $cond: [
                    {
                      $and: [
                        { $eq: [{ $type: "$content" }, "binData"] },
                        { $eq: [bsonSizeExpression, attachment.sizeBytes] },
                      ],
                    },
                    "$content",
                    "$$REMOVE",
                  ],
                },
              },
            },
          ],
          { maxTimeMS: 5000 },
        )
        .toArray()
    )[0];
    if (!(actual?.content instanceof Binary)) {
      add("changed_during_read");
      continue;
    }
    const bytes = new Uint8Array(actual.content.value());
    bytesRead += bytes.byteLength;
    try {
      validatePhotoBytes({
        bytes,
        declaredMimeType: attachment.mimeType,
        declaredSizeBytes: attachment.sizeBytes,
      });
    } catch {
      add("invalid_content");
      continue;
    }
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      attachment.checksumSha256
    ) {
      add("invalid_content");
      continue;
    }
    try {
      await assertAttachmentTargetExists(db, context, attachment.target);
    } catch (error) {
      if (!(error instanceof AttachmentReferenceError)) throw error;
      add("invalid_target");
      continue;
    }
    const current = await db
      .collection("attachments")
      .findOne(exact, { projection: metadataProjection, maxTimeMS: 5000 });
    add(
      current && fingerprint(current) === base.metadataFingerprint
        ? "eligible_for_copy"
        : "changed_during_read",
    );
  }
  // Revocation during a long inventory prevents returning its private report.
  const finalContext = await authorizeUploadAuthor({
    db,
    authDb,
    organizationId: input.organizationId,
    storeId: new ObjectId(input.storeId),
    ownerId: input.actorId,
  });
  if (finalContext.role !== "organization_admin")
    throw new StoreAccessDeniedError();
  const exhausted = !budgetStopped && ids.length <= input.pageSize;
  return migrationSnapshotSchema.parse({
    schemaVersion: 1,
    mode: "read-only-inventory",
    databases: { app: db.databaseName, auth: authDb.databaseName },
    scope: { organizationId: input.organizationId, storeId: input.storeId },
    capturedAt: new Date().toISOString(),
    after: input.after,
    nextCursor: exhausted ? null : entries.at(-1)?.attachmentId,
    exhausted,
    bytesRead,
    entries,
  });
}
