import { createHash, randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(() => {
    throw new Error("No live Blob");
  }),
  del: vi.fn(() => {
    throw new Error("No live Blob");
  }),
}));
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import {
  uploadIntentInputSchema,
  PrivateStorageError,
} from "@/domain/attachments/private-storage";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import type { AttachmentTarget } from "@/domain/attachments/schemas";
import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";
import {
  UploadIntentRepository,
  type IntentDocument,
} from "@/server/repositories/upload-intent-repository";
import { UploadLifecycleRepository } from "@/server/repositories/upload-lifecycle-repository";
import { DocumentSourceRepository } from "@/server/repositories/document-source-repository";
import { AttachmentRepository } from "@/server/repositories/attachment-repository";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
const organization = new ObjectId();
const owner = new ObjectId();
const context: AuthorizedStoreContext = {
  organizationId: organization.toHexString(),
  storeId: new ObjectId().toHexString(),
  userId: owner.toHexString(),
  role: "department_manager",
  permissions: ["stores.read", "attachments.write"],
};
const config = {
  storeId: "store_test",
  namespace: "local-test",
  token: "never-used",
  readTimeoutMs: 1000,
  storeQuotaBytes: 1000000,
  environmentQuotaBytes: 2000000,
  storeQuotaObjects: 100,
  environmentQuotaObjects: 200,
};
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
// A complete one-page source, xref offsets computed from ASCII objects.
function pdf() {
  let data = "%PDF-1.7\n";
  const offsets: number[] = [];
  for (const object of [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
  ]) {
    offsets.push(data.length);
    data += `${offsets.length} 0 obj\n${object}\nendobj\n`;
  }
  const start = data.length;
  data += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(data);
}

describe.skipIf(!uri)("TECH-04 durable validation and cleanup", () => {
  let client: MongoClient;
  let db: Db;
  let authDb: Db;
  let repo: UploadIntentRepository;
  let lifecycle: UploadLifecycleRepository;
  const objects = { read: vi.fn(), remove: vi.fn() };
  beforeAll(async () => {
    client = await MongoClient.connect(requireLocalMongoUri(uri!));
    const suffix = randomUUID().replaceAll("-", "");
    db = client.db(`fleg_lifecycle_test_${suffix}`);
    authDb = client.db(`fleg_lifecycle_auth_test_${suffix}`);
    await ensureFoundationIndexesForDb(db);
  }, 30000);
  beforeEach(async () => {
    for (const name of [
      "uploadIntents",
      "objectStorageQuotas",
      "attachmentTargetLocks",
      "attachments",
      "documentSources",
      "auditLogs",
      "stores",
      "storeMemberships",
      "commercialEvents",
    ])
      await db.collection(name).deleteMany({});
    for (const name of ["user", "organization", "member"])
      await authDb.collection(name).deleteMany({});
    await authDb.collection("user").insertOne({ _id: owner });
    await authDb.collection("organization").insertOne({ _id: organization });
    await authDb.collection("member").insertOne({
      organizationId: organization,
      userId: owner,
      role: "member",
    });
    await db.collection("stores").insertOne({
      _id: new ObjectId(context.storeId),
      organizationId: context.organizationId,
      active: true,
    });
    await db.collection("storeMemberships").insertOne({
      ...context,
      storeId: new ObjectId(context.storeId),
      active: true,
    });
    objects.read.mockReset().mockResolvedValue(png);
    objects.remove.mockReset().mockResolvedValue(undefined);
    repo = new UploadIntentRepository(db, client, config);
    lifecycle = new UploadLifecycleRepository(
      db,
      authDb,
      client,
      config,
      objects,
    );
  });
  afterAll(async () => {
    await db?.dropDatabase();
    await authDb?.dropDatabase();
    await client?.close();
  });
  const intents = () => db.collection<IntentDocument>("uploadIntents");
  async function reserve(
    bytes = png,
    kind: "photo" | "document" = "photo",
    target: AttachmentTarget = { type: "store" },
  ) {
    return repo.reserve(
      context,
      uploadIntentInputSchema.parse({
        idempotencyKey: randomUUID(),
        kind,
        target,
        mimeType: kind === "photo" ? "image/png" : "application/pdf",
        sizeBytes: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        originalFileName: kind === "photo" ? "rayon.png" : "brief.pdf",
        caption: null,
      }),
      randomUUID(),
    );
  }
  async function ready(
    bytes = png,
    kind: "photo" | "document" = "photo",
    target: AttachmentTarget = { type: "store" },
  ) {
    const receipt = await reserve(bytes, kind, target);
    const grant = await repo.beginAuthorization(
      context,
      receipt.id,
      randomUUID(),
    );
    await intents().updateOne(
      { _id: receipt.id },
      {
        $set: {
          "authorization.validUntil": new Date(0),
          reconcileAfter: new Date(0),
        },
      },
    );
    return { receipt, grant };
  }
  const reconcile = () => lifecycle.reconcile(context, randomUUID());

  it("recovers a lost callback and links once transactionally under parallel reconciliation", async () => {
    const { receipt } = await ready();
    const results = await Promise.all([reconcile(), reconcile()]);
    expect(
      results.some((result) => result.processed && result.outcome === "linked"),
    ).toBe(true);
    const persisted = await intents().findOne({ _id: receipt.id });
    expect(persisted).toMatchObject({ state: "linked", budgetHeld: true });
    expect(await db.collection("attachments").countDocuments()).toBe(1);
    expect(
      await db
        .collection("auditLogs")
        .countDocuments({ action: "attachment.upload_linked" }),
    ).toBe(1);
    expect((await repo.get(context, receipt.id)).sourceId).toBe(
      persisted!.sourceId!.toHexString(),
    );
    expect(await db.collection("attachmentObjects").countDocuments()).toBe(0);
    expect(await reconcile()).toEqual({ processed: false });
  });
  it("transfers a full 20-photo reservation without double admission", async () => {
    await ready();
    for (let index = 1; index < 20; index++) await reserve();
    expect(await reconcile()).toMatchObject({ outcome: "linked" });
    await expect(reserve()).rejects.toMatchObject({
      code: "ATTACHMENT_LIMIT_REACHED",
    });
  });
  it("checks the author's current membership again after the remote read", async () => {
    const { receipt } = await ready();
    objects.read.mockImplementationOnce(async () => {
      await db
        .collection("storeMemberships")
        .updateMany({}, { $set: { active: false } });
      return png;
    });
    expect(await reconcile()).toMatchObject({ outcome: "rejected" });
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "rejected",
      budgetHeld: true,
    });
    expect(await db.collection("attachments").countDocuments()).toBe(0);
  });
  it("rejects a target removed while its object is being verified", async () => {
    const eventId = new ObjectId();
    await db
      .collection("commercialEvents")
      .insertOne({
        _id: eventId,
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      });
    await ready(png, "photo", {
      type: "commercial_event",
      eventId: eventId.toHexString(),
    });
    objects.read.mockImplementationOnce(async () => {
      await db.collection("commercialEvents").deleteOne({ _id: eventId });
      return png;
    });
    expect(await reconcile()).toMatchObject({ outcome: "rejected" });
    expect(await db.collection("attachments").countDocuments()).toBe(0);
  });
  it("paginates document metadata without duplicates or foreign records", async () => {
    const bytes = pdf();
    objects.read.mockResolvedValue(bytes);
    await ready(bytes, "document");
    await reconcile();
    const template = (await db.collection("documentSources").findOne({}))!;
    for (let index = 0; index < 24; index++)
      await db
        .collection("documentSources")
        .insertOne({
          ...template,
          _id: new ObjectId(),
          uploadIntentId: randomUUID(),
        });
    await db
      .collection("documentSources")
      .insertOne({
        ...template,
        _id: new ObjectId(),
        storeId: new ObjectId(),
        uploadIntentId: randomUUID(),
      });
    const sources = new DocumentSourceRepository(db);
    const first = await sources.list(context);
    expect(first.sources).toHaveLength(20);
    const second = await sources.list(context, first.nextCursor!);
    expect(second.sources).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.sources, ...second.sources].map((source) => source.id))
        .size,
    ).toBe(25);
  });
  it("reauthorizes Better Auth membership and requires a live user even for organization owners", async () => {
    await authDb
      .collection("member")
      .updateMany({}, { $set: { role: "owner" } });
    await db.collection("storeMemberships").deleteMany({});
    expect(
      (
        await authorizeUploadAuthor({
          db,
          authDb,
          organizationId: context.organizationId,
          storeId: new ObjectId(context.storeId),
          ownerId: context.userId,
        })
      ).role,
    ).toBe("organization_admin");
    await ready();
    await authDb.collection("user").deleteMany({});
    expect(await reconcile()).toMatchObject({ outcome: "rejected" });
    expect(objects.read).not.toHaveBeenCalled();
  });
  it("cancellation invalidates an in-flight verifier and never resurrects the source", async () => {
    const { receipt } = await ready();
    objects.read.mockImplementationOnce(async () => {
      await repo.cancel(context, receipt.id, randomUUID());
      return png;
    });
    expect(await reconcile()).toMatchObject({ outcome: "superseded" });
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "cancelled",
      budgetHeld: true,
    });
    expect(await db.collection("attachments").countDocuments()).toBe(0);
  });
  it("reclaims an expired worker lease without consuming another reservation", async () => {
    const { receipt } = await ready();
    await intents().updateOne(
      { _id: receipt.id },
      {
        $set: {
          lease: { token: randomUUID(), until: new Date(Date.now() + 10000) },
        },
      },
    );
    expect(await reconcile()).toEqual({ processed: false });
    await intents().updateOne(
      { _id: receipt.id },
      { $set: { "lease.until": new Date(0) } },
    );
    expect(await reconcile()).toMatchObject({ outcome: "linked" });
  });
  it("does not interpret missing objects or timeouts as deleted and retains quota", async () => {
    const { receipt } = await ready();
    objects.read.mockResolvedValueOnce(null);
    expect(await reconcile()).toMatchObject({ outcome: "retry" });
    await intents().updateOne(
      { _id: receipt.id },
      { $set: { reconcileAfter: new Date(0) } },
    );
    objects.read.mockRejectedValueOnce(
      new PrivateStorageError("STORAGE_UNAVAILABLE", "timeout"),
    );
    expect(await reconcile()).toMatchObject({ outcome: "retry" });
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "reserved",
      budgetHeld: true,
      lastMaintenanceCode: "RETRY",
    });
    expect(objects.remove).not.toHaveBeenCalled();
  });
  it("releases only a never-issued cancelled reservation, once, without contacting Blob", async () => {
    const receipt = await reserve();
    await repo.cancel(context, receipt.id, randomUUID());
    await Promise.all([reconcile(), reconcile()]);
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "deleted",
      budgetHeld: false,
    });
    expect(
      await db.collection("objectStorageQuotas").find({}).toArray(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bytes: 0, objects: 0 }),
      ]),
    );
    expect(objects.remove).not.toHaveBeenCalled();
    expect(
      await db
        .collection("auditLogs")
        .countDocuments({ action: "attachment.upload_reservation_released" }),
    ).toBe(1);
  });
  it("keeps issued tombstones charged after absence and cleans again after a late callback", async () => {
    const { receipt, grant } = await ready();
    await repo.cancel(context, receipt.id, randomUUID());
    expect(await reconcile()).toMatchObject({ outcome: "cleanup_pending" });
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "cancelled",
      budgetHeld: true,
      cleanupRequired: true,
      lastMaintenanceCode: "AWAITING_TRANSPORT_PROOF",
    });
    await repo.recordCompletion(
      {
        intentId: grant.intentId,
        attemptId: grant.attemptId,
        pathname: grant.storage.pathname,
        contentType: "image/png",
        url: `https://test.private.blob.vercel-storage.com/${grant.storage.pathname}`,
      },
      randomUUID(),
    );
    expect(await reconcile()).toMatchObject({ outcome: "cleanup_pending" });
    expect(objects.remove).toHaveBeenCalledTimes(2);
    expect(await db.collection("attachments").countDocuments()).toBe(0);
  });
  it("never deletes while a recorded grant is still valid", async () => {
    const receipt = await reserve();
    await repo.beginAuthorization(context, receipt.id, randomUUID());
    await repo.cancel(context, receipt.id, randomUUID());
    expect(await reconcile()).toMatchObject({ outcome: "waiting" });
    expect(objects.remove).not.toHaveBeenCalled();
  });
  it("isolates maintenance and deletion by organization, domain store, resource and namespace", async () => {
    const { receipt } = await ready();
    for (const other of [
      { ...context, storeId: new ObjectId().toHexString() },
      { ...context, organizationId: "other" },
    ])
      expect(await lifecycle.reconcile(other, randomUUID())).toEqual({
        processed: false,
      });
    expect(
      await new UploadLifecycleRepository(
        db,
        authDb,
        client,
        { ...config, namespace: "local-other" },
        objects,
      ).reconcile(context, randomUUID()),
    ).toEqual({ processed: false });
    await expect(
      lifecycle.reconcile(
        { ...context, permissions: ["stores.read"] },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND_OR_FORBIDDEN" });
    expect(await reconcile()).toMatchObject({ outcome: "linked" });
    const document = (await intents().findOne({ _id: receipt.id }))!;
    await expect(
      lifecycle.removeSource(
        { ...context, storeId: new ObjectId().toHexString() },
        document.sourceId!,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
  });
  it("verifies a real PDF before listing, and deletion during download removes visibility", async () => {
    const bytes = pdf();
    objects.read.mockResolvedValue(bytes);
    const { receipt } = await ready(bytes, "document");
    const sources = new DocumentSourceRepository(db);
    expect(await sources.list(context)).toEqual({
      sources: [],
      nextCursor: null,
    });
    expect(await reconcile()).toMatchObject({ outcome: "linked" });
    const list = await sources.list(context);
    expect(list.sources[0]).toMatchObject({
      pageCount: 1,
      originalFileName: "brief.pdf",
    });
    expect(JSON.stringify(list)).not.toMatch(/pathname|token|vercel_blob/);
    const sourceId = list.sources[0]!.id;
    expect((await sources.content(context, sourceId, objects)).bytes).toEqual(
      bytes,
    );
    expect(
      (
        await sources.list({
          ...context,
          storeId: new ObjectId().toHexString(),
        })
      ).sources,
    ).toEqual([]);
    objects.read.mockImplementationOnce(async () => {
      await lifecycle.removeSource(
        context,
        new ObjectId(sourceId),
        randomUUID(),
      );
      return bytes;
    });
    await expect(
      sources.content(context, sourceId, objects),
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_FOUND" });
    expect((await sources.list(context)).sources).toEqual([]);
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "deleting",
      budgetHeld: true,
    });
    expect(await reconcile()).toMatchObject({ outcome: "cleanup_pending" });
    expect(
      await lifecycle.removeSource(
        context,
        new ObjectId(sourceId),
        randomUUID(),
      ),
    ).toEqual({ state: "deleting", deletionComplete: false });
  });
  it("retains failed deletions for a later pass without exposing the hidden photo", async () => {
    const { receipt } = await ready();
    await reconcile();
    const sourceId = (await intents().findOne({ _id: receipt.id }))!.sourceId!;
    await lifecycle.removeSource(context, sourceId, randomUUID());
    objects.remove.mockRejectedValueOnce(new Error("provider 503"));
    expect(await reconcile()).toMatchObject({ outcome: "retry" });
    expect(await new AttachmentRepository(db).listForStore(context)).toEqual(
      [],
    );
    expect(await intents().findOne({ _id: receipt.id })).toMatchObject({
      state: "deleting",
      budgetHeld: true,
      cleanupRequired: true,
    });
  });
  it("rejects wrong signatures and integrity mismatches without linking", async () => {
    await ready();
    objects.read.mockResolvedValueOnce(new Uint8Array(8));
    expect(await reconcile()).toMatchObject({ outcome: "rejected" });
    await ready();
    objects.read.mockRejectedValueOnce(
      new PrivateStorageError("STORAGE_INTEGRITY", "hash mismatch"),
    );
    expect(await reconcile()).toMatchObject({ outcome: "rejected" });
    expect(await db.collection("attachments").countDocuments()).toBe(0);
  });
});
