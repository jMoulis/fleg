import { createHash, randomUUID } from "node:crypto";
import { BSON, MongoClient, ObjectId, type Db } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
// Even an accidental adapter construction in this suite cannot touch Blob.
vi.mock("@vercel/blob", () => ({
  get: vi.fn(() => {
    throw new Error("No live Blob in tests");
  }),
}));
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { uploadIntentInputSchema } from "@/domain/attachments/private-storage";
import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";
import { AttachmentRepository } from "@/server/repositories/attachment-repository";
import { UploadIntentRepository } from "@/server/repositories/upload-intent-repository";
import { scopedObjectPrefix } from "@/server/storage/private-object-reader";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
const context: AuthorizedStoreContext = {
  organizationId: "private-storage-org",
  storeId: new ObjectId().toHexString(),
  userId: "manager",
  role: "department_manager",
  permissions: ["attachments.write", "stores.read"],
};
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const checksum = createHash("sha256").update(bytes).digest("hex");
const config = {
  storeId: "store_test",
  namespace: "local-test",
  token: "never-used",
  readTimeoutMs: 1000,
  storeQuotaBytes: 100000,
  environmentQuotaBytes: 200000,
  storeQuotaObjects: 100,
  environmentQuotaObjects: 200,
};
function payload() {
  const input = uploadIntentInputSchema.parse({
    idempotencyKey: randomUUID(),
    kind: "photo",
    target: { type: "store" },
    mimeType: "image/png",
    sizeBytes: bytes.length,
    checksumSha256: checksum,
    originalFileName: "rayon.png",
    caption: null,
  });
  if (input.kind !== "photo") throw new Error("Photo fixture required");
  return input;
}

describe.skipIf(!uri)("TECH-04 isolated MongoDB persistence", () => {
  let client: MongoClient;
  let db: Db;
  let repo: UploadIntentRepository;
  let legacy: AttachmentRepository;
  beforeAll(async () => {
    client = new MongoClient(requireLocalMongoUri(uri!), {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(`fleg_blob_test_${randomUUID().replaceAll("-", "")}`);
    await ensureFoundationIndexesForDb(db);
  }, 30000);
  beforeEach(async () => {
    for (const name of [
      "uploadIntents",
      "objectStorageQuotas",
      "attachmentTargetLocks",
      "attachments",
      "attachmentObjects",
      "attachmentCommands",
      "auditLogs",
      "layoutVersions",
      "commercialEvents",
    ])
      await db.collection(name).deleteMany({});
    repo = new UploadIntentRepository(db, client, config);
    legacy = new AttachmentRepository(db, client);
  });
  afterAll(async () => {
    if (db) await db.dropDatabase();
    await client?.close();
  });

  const createLegacy = (
    metadata = {
      target: { type: "store" as const },
      caption: null,
      idempotencyKey: randomUUID(),
    },
  ) =>
    legacy.create({
      context,
      metadata,
      originalFileName: "rayon.png",
      mimeType: "image/png",
      bytes,
      checksumSha256: checksum,
      requestId: randomUUID(),
    });

  it("reserves once under duplicate requests and lost ACK, with no binary or credentials", async () => {
    const input = payload();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.reserve(context, input, randomUUID()),
      ),
    );
    expect(results.every((item) => item.id === results[0].id)).toBe(true);
    expect(await repo.get(context, results[0].id)).toEqual(results[0]);
    await expect(
      repo.reserve(
        context,
        { ...input, checksumSha256: "a".repeat(64) },
        randomUUID(),
      ),
    ).rejects.toThrow("autre contenu");
    await expect(
      repo.reserve({ ...context, userId: "other" }, input, randomUUID()),
    ).rejects.toThrow("propriétaire");
    expect(await db.collection("uploadIntents").countDocuments()).toBe(1);
    expect(await db.collection("attachmentObjects").countDocuments()).toBe(0);
    expect(await db.collection("attachments").countDocuments()).toBe(0);
    const quota = await db
      .collection<{ _id: string; bytes: number }>("objectStorageQuotas")
      .findOne({ _id: `environment:${config.storeId}` });
    expect(quota?.bytes).toBe(bytes.length);
    const audit = await db.collection("auditLogs").find().toArray();
    expect(audit).toHaveLength(1);
    expect(BSON.calculateObjectSize(audit[0])).toBeLessThan(1500);
    expect(JSON.stringify(audit)).not.toMatch(/token|pathname|content|base64/);
    expect(JSON.stringify(results[0])).not.toMatch(
      /token|pathname|storage|ownerId/,
    );
    expect(results[0]).toMatchObject({
      state: "reserved",
      uploadAvailable: false,
    });
  });

  it("isolates owner, organization, store, namespace and reader role", async () => {
    const saved = await repo.reserve(context, payload(), randomUUID());
    for (const other of [
      { ...context, organizationId: "foreign" },
      { ...context, storeId: new ObjectId().toHexString() },
      { ...context, userId: "other" },
      { ...context, permissions: ["stores.read" as const] },
    ])
      await expect(repo.get(other, saved.id)).rejects.toThrow();
    await expect(
      repo.reserve(
        { ...context, permissions: ["stores.read"] },
        payload(),
        randomUUID(),
      ),
    ).rejects.toThrow("accès refusé");
    await expect(
      new UploadIntentRepository(db, client, {
        ...config,
        namespace: "local-other",
      }).get(context, saved.id),
    ).rejects.toThrow();
  });

  it("refuses missing, foreign and forged fixture-version targets transactionally", async () => {
    const layoutId = new ObjectId();
    await db.collection("layoutVersions").insertOne({
      _id: layoutId,
      organizationId: context.organizationId,
      storeId: new ObjectId(context.storeId),
      fixtures: [{ id: "fixture-a" }],
      version: 1,
    });
    const input = payload();
    const good = {
      ...input,
      target: {
        type: "fixture" as const,
        layoutVersionId: layoutId.toHexString(),
        fixtureId: "fixture-a",
      },
    };
    await repo.reserve(context, good, randomUUID());
    for (const target of [
      {
        type: "fixture" as const,
        layoutVersionId: layoutId.toHexString(),
        fixtureId: "missing",
      },
      {
        type: "layout" as const,
        layoutVersionId: new ObjectId().toHexString(),
      },
      {
        type: "commercial_event" as const,
        eventId: new ObjectId().toHexString(),
      },
    ])
      await expect(
        repo.reserve(context, { ...payload(), target }, randomUUID()),
      ).rejects.toThrow("cible");
    await expect(
      repo.reserve(
        { ...context, storeId: new ObjectId().toHexString() },
        good,
        randomUUID(),
      ),
    ).rejects.toThrow("cible");
    expect(await db.collection("uploadIntents").countDocuments()).toBe(1);
    expect(await db.collection("auditLogs").countDocuments()).toBe(1);
    expect(await db.collection("attachmentTargetLocks").countDocuments()).toBe(
      1,
    );
  });

  it("atomically enforces store bytes under parallel reservations", async () => {
    repo = new UploadIntentRepository(db, client, {
      ...config,
      storeQuotaBytes: bytes.length * 2,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        repo.reserve(context, payload(), randomUUID()),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(2);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every((result) => result.reason.code === "UPLOAD_QUOTA"),
    ).toBe(true);
    expect(await db.collection("uploadIntents").countDocuments()).toBe(2);
    const quotas = await db.collection("objectStorageQuotas").find().toArray();
    expect(quotas.every((quota) => quota.bytes === bytes.length * 2)).toBe(
      true,
    );
  });

  it("shares the environment byte limit across stores and namespaces", async () => {
    const limited = {
      ...config,
      storeQuotaBytes: bytes.length,
      environmentQuotaBytes: bytes.length,
    };
    const left = new UploadIntentRepository(db, client, limited);
    const right = new UploadIntentRepository(db, client, {
      ...limited,
      namespace: "preview-other",
    });
    const result = await Promise.allSettled([
      left.reserve(context, payload(), randomUUID()),
      right.reserve(
        { ...context, storeId: new ObjectId().toHexString() },
        payload(),
        randomUUID(),
      ),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(await db.collection("uploadIntents").countDocuments()).toBe(1);
  });

  it("bounds metadata growth from tiny PDF intents independently of bytes", async () => {
    repo = new UploadIntentRepository(db, client, {
      ...config,
      storeQuotaObjects: 2,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        repo.reserve(
          context,
          uploadIntentInputSchema.parse({
            ...payload(),
            kind: "document",
            mimeType: "application/pdf",
            sizeBytes: 1,
          }),
          randomUUID(),
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(2);
    expect(await db.collection("uploadIntents").countDocuments()).toBe(2);
    const quotas = await db.collection("objectStorageQuotas").find().toArray();
    expect(
      quotas.every((quota) => quota.objects === 2 && quota.bytes === 2),
    ).toBe(true);
  });

  it("shares the 20-photo limit with legacy creates without write skew", async () => {
    for (let index = 0; index < 19; index++) await createLegacy();
    const result = await Promise.allSettled([
      createLegacy(),
      repo.reserve(context, payload(), randomUUID()),
      repo.reserve(context, payload(), randomUUID()),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      (await db.collection("attachments").countDocuments()) +
        (await db.collection("uploadIntents").countDocuments()),
    ).toBe(20);
    expect(
      result
        .filter((item) => item.status === "rejected")
        .every((item) => item.reason.code === "ATTACHMENT_LIMIT_REACHED"),
    ).toBe(true);
  });

  it("keeps abandoned/quarantined/deleting reservations charged with no destructive TTL", async () => {
    repo = new UploadIntentRepository(db, client, {
      ...config,
      storeQuotaBytes: bytes.length,
    });
    const saved = await repo.reserve(context, payload(), randomUUID());
    for (const state of ["uploaded", "rejected", "cancelled", "deleting"]) {
      await db
        .collection<{ _id: string }>("uploadIntents")
        .updateOne(
          { _id: saved.id },
          { $set: { state, reconcileAfter: new Date(0) } },
        );
      await expect(
        repo.reserve(context, payload(), randomUUID()),
      ).rejects.toThrow("plafond");
      expect((await repo.get(context, saved.id)).state).toBe(state);
    }
    expect(
      (await db.collection("uploadIntents").indexes()).every(
        (index) => index.expireAfterSeconds === undefined,
      ),
    ).toBe(true);
  });

  it("preserves legacy BSON reads, deletion, audit and immutable replay checks", async () => {
    const metadata = {
      target: { type: "store" as const },
      caption: null,
      idempotencyKey: randomUUID(),
    };
    const photo = await createLegacy(metadata);
    expect(await createLegacy(metadata)).toEqual(photo);
    await expect(
      legacy.create({
        context,
        metadata,
        originalFileName: "different.png",
        mimeType: "image/png",
        bytes,
        checksumSha256: checksum,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("idempotence");
    // Pre-TECH-04 receipts must reject changed content too, without migration.
    await db
      .collection("attachmentCommands")
      .updateOne(
        { idempotencyKey: metadata.idempotencyKey },
        { $unset: { payloadHash: "" } },
      );
    expect(await createLegacy(metadata)).toEqual(photo);
    await expect(
      legacy.create({
        context,
        metadata,
        originalFileName: "changed-old-receipt.png",
        mimeType: "image/png",
        bytes,
        checksumSha256: checksum,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("idempotence");
    expect(
      (await legacy.getContent({ context, attachmentId: photo.id })).bytes,
    ).toEqual(bytes);
    await expect(
      legacy.getContent({
        context: { ...context, storeId: new ObjectId().toHexString() },
        attachmentId: photo.id,
      }),
    ).rejects.toThrow();
    const deletion = {
      context,
      attachmentId: photo.id,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    };
    expect(await legacy.delete(deletion)).toEqual(photo);
    expect(await legacy.delete(deletion)).toEqual(photo);
    expect(await db.collection("attachmentObjects").countDocuments()).toBe(0);
    expect(await db.collection("auditLogs").countDocuments()).toBe(2);
  });

  it("reads only linked Blob references with no fallback, hides deletion and preserves cleanup evidence", async () => {
    const photo = await createLegacy();
    const storage = {
      backend: "vercel_blob",
      storeId: config.storeId,
      namespace: config.namespace,
      pathname: `${scopedObjectPrefix(context, config.namespace)}${randomUUID()}.png`,
    };
    await db
      .collection("attachments")
      .updateOne(
        { _id: new ObjectId(photo.id) },
        { $set: { storage, storageState: "linked" } },
      );
    const readPhoto = vi.fn(async () => bytes);
    const hybrid = new AttachmentRepository(db, client, () => ({ readPhoto }));
    expect(
      (await hybrid.getContent({ context, attachmentId: photo.id })).bytes,
    ).toEqual(bytes);
    expect(readPhoto).toHaveBeenCalledTimes(1);
    await expect(
      legacy.getContent({ context, attachmentId: photo.id }),
    ).rejects.toThrow("indisponible");
    await expect(
      legacy.delete({
        context,
        attachmentId: photo.id,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("pas encore activée");
    expect(await db.collection("attachments").countDocuments()).toBe(1);
    readPhoto.mockImplementation(async () => {
      await db
        .collection("attachments")
        .updateOne(
          { _id: new ObjectId(photo.id) },
          { $set: { storageState: "deleting" } },
        );
      return bytes;
    });
    await expect(
      hybrid.getContent({ context, attachmentId: photo.id }),
    ).rejects.toThrow("introuvable");
    expect(await hybrid.listForStore(context)).toEqual([]);
    readPhoto.mockClear();
    await expect(
      hybrid.getContent({ context, attachmentId: photo.id }),
    ).rejects.toThrow();
    expect(readPhoto).not.toHaveBeenCalled();
    await db
      .collection("attachments")
      .updateOne(
        { _id: new ObjectId(photo.id) },
        { $unset: { storageState: "" } },
      );
    await expect(
      hybrid.getContent({ context, attachmentId: photo.id }),
    ).rejects.toThrow();
    expect(readPhoto).not.toHaveBeenCalled();
  });
});
