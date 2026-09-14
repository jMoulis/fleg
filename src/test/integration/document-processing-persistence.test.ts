import { randomUUID, createHash } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import {
  DocumentProcessingRepository,
  processOneDocument,
} from "@/server/repositories/document-processing-repository";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";
import { documentProcessingPolicy as policy } from "@/domain/attachments/document-processing";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { textPdf } from "@/test/fixtures/text-pdf";
import { extractPdfText } from "@/server/storage/pdf-validator";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
const storeId = new ObjectId(),
  sourceId = new ObjectId();
const scope = { organizationId: "doc-org", storeId: storeId.toHexString() };
const bytes = textPdf(["Synthetic source"]);
const checksum = createHash("sha256").update(bytes).digest("hex");
describe.skipIf(!uri)("durable document jobs on isolated MongoDB", () => {
  let client: MongoClient,
    db: Db,
    authDb: Db,
    repo: DocumentProcessingRepository,
    clock: Date;
  const collections = [
    "documentSources",
    "documentProcessingJobs",
    "documentProcessingLanes",
    "stores",
    "storeMemberships",
    "auditLogs",
  ];
  beforeAll(async () => {
    client = await new MongoClient(requireLocalMongoUri(uri!), {
      serverSelectionTimeoutMS: 5000,
    }).connect();
    const suffix = randomUUID().replaceAll("-", "");
    db = client.db(`fleg_doc_jobs_test_${suffix}`);
    authDb = client.db(`fleg_doc_jobs_auth_${suffix}`);
    for (const name of collections) await db.createCollection(name);
    for (const name of ["user", "organization", "member"])
      await authDb.createCollection(name);
  }, 30000);
  afterAll(async () => {
    await db?.dropDatabase();
    await authDb?.dropDatabase();
    await client?.close();
  });
  beforeEach(async () => {
    for (const name of collections) await db.collection(name).deleteMany({});
    for (const name of ["user", "organization", "member"])
      await authDb.collection(name).deleteMany({});
    clock = new Date();
    repo = new DocumentProcessingRepository(db, authDb, client, () => clock);
    await authDb
      .collection<{ _id: string }>("user")
      .insertOne({ _id: "owner" });
    await authDb
      .collection<{ _id: string }>("organization")
      .insertOne({ _id: scope.organizationId });
    await authDb.collection("member").insertOne({
      organizationId: scope.organizationId,
      userId: "owner",
      role: "owner",
    });
    await db.collection("stores").insertOne({
      _id: storeId,
      organizationId: scope.organizationId,
      active: true,
    });
    await seed(sourceId);
  });
  async function context() {
    return authorizeUploadAuthor({
      db,
      authDb,
      organizationId: scope.organizationId,
      storeId,
      ownerId: "owner",
    });
  }
  async function seed(id: ObjectId) {
    await db.collection("documentSources").insertOne({
      _id: id,
      organizationId: scope.organizationId,
      storeId,
      checksumSha256: checksum,
      mimeType: "application/pdf",
      storageState: "linked",
      storage: {
        backend: "vercel_blob",
        storeId: "store_test",
        namespace: "local-test",
        pathname: `fleg/local-test/${"a".repeat(64)}/${storeId}/${randomUUID()}.pdf`,
      },
      verification: {
        pageCount: 1,
        parserVersion: "pdfium-2.1.13-fleg-2",
        verifiedAt: clock,
      },
    });
  }
  const result = {
    extractorVersion: "pdfium-2.1.13-text-1" as const,
    pages: [{ page: 1, text: "Synthetic source" }],
  };
  it("deduplicates concurrent submissions and publishes literal page text once after repository restart", async () => {
    const ctx = await context();
    await Promise.all([
      repo.enqueue(ctx, sourceId.toHexString()),
      repo.enqueue(ctx, sourceId.toHexString()),
    ]);
    expect(
      await db.collection("documentProcessingJobs").countDocuments({}),
    ).toBe(1);
    repo = new DocumentProcessingRepository(db, authDb, client, () => clock);
    expect(
      await processOneDocument({
        repository: repo,
        scope,
        read: async () => bytes,
        extract: extractPdfText,
      }),
    ).toMatchObject({ outcome: "ready" });
    expect(await repo.get(ctx, sourceId.toHexString())).toMatchObject({
      state: "ready",
      result,
      providerSpendCents: 0,
      reviewState: "unreviewed",
    });
    expect(await repo.claim(scope)).toBeNull();
    expect(
      JSON.stringify(await db.collection("auditLogs").find({}).toArray()),
    ).not.toContain("Synthetic source");
  });
  it("permits one worker per store, reclaims an interrupted worker and fences its stale result", async () => {
    await repo.enqueue(await context(), sourceId.toHexString());
    const claims = await Promise.all([repo.claim(scope), repo.claim(scope)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const old = claims.find(Boolean)!;
    clock = new Date(clock.getTime() + policy.leaseMs + 1);
    const fresh = await new DocumentProcessingRepository(
      db,
      authDb,
      client,
      () => clock,
    ).claim(scope);
    expect(fresh?.attempts).toBe(2);
    expect(await repo.complete(old, result)).toBe(false);
    await repo.release(old);
    expect(await repo.claim(scope)).toBeNull();
    expect(await repo.complete(fresh!, result)).toBe(true);
  });
  it("limits retries and marks a final crashed attempt exhausted", async () => {
    await repo.enqueue(await context(), sourceId.toHexString());
    for (let i = 0; i < policy.maxAttempts; i++) {
      expect((await repo.claim(scope))?.attempts).toBe(i + 1);
      clock = new Date(clock.getTime() + policy.leaseMs + 1);
    }
    expect(await repo.claim(scope)).toBeNull();
    expect(
      await repo.get(await context(), sourceId.toHexString()),
    ).toMatchObject({
      state: "failed",
      error: "budget_exhausted",
      attempts: 3,
    });
  });
  it("backs off transient reads, does not retry integrity failures and never persists provider diagnostics", async () => {
    const ctx = await context();
    await repo.enqueue(ctx, sourceId.toHexString());
    await processOneDocument({
      repository: repo,
      scope,
      read: async () => {
        throw Error("secret-token-private-url");
      },
      extract: extractPdfText,
    });
    expect(await repo.claim(scope)).toBeNull();
    expect(await repo.get(ctx, sourceId.toHexString())).toMatchObject({
      state: "queued",
      error: "temporary",
    });
    clock = new Date(clock.getTime() + policy.retryMs + 1);
    await processOneDocument({
      repository: repo,
      scope,
      read: async () => Buffer.from("changed"),
      extract: extractPdfText,
    });
    expect(await repo.get(ctx, sourceId.toHexString())).toMatchObject({
      state: "failed",
      error: "invalid_pdf",
    });
    expect(
      JSON.stringify(
        await db.collection("documentProcessingJobs").find({}).toArray(),
      ),
    ).not.toContain("secret-token");
  });
  it("cancels in-flight results and removes existing extracted text without deleting the original", async () => {
    const ctx = await context();
    await repo.enqueue(ctx, sourceId.toHexString());
    const job = (await repo.claim(scope))!;
    await repo.cancel(ctx, sourceId.toHexString());
    expect(await repo.complete(job, result)).toBe(false);
    expect(await repo.get(ctx, sourceId.toHexString())).toMatchObject({
      state: "cancelled",
      result: null,
    });
    expect(
      await db
        .collection("documentSources")
        .countDocuments({ storageState: "linked" }),
    ).toBe(1);
  });
  it("refuses missing/deleted/changed sources and revoked authors before reads and publication", async () => {
    const ctx = await context();
    await repo.enqueue(ctx, sourceId.toHexString());
    const job = (await repo.claim(scope))!;
    await authDb.collection("member").deleteMany({});
    await expect(repo.workerContext(job)).rejects.toThrow();
    await expect(repo.complete(job, result)).rejects.toThrow();
    await db
      .collection("documentSources")
      .updateOne({ _id: sourceId }, { $set: { storageState: "deleting" } });
    await expect(repo.get(ctx, sourceId.toHexString())).rejects.toThrow();
    expect(
      await db
        .collection("documentProcessingJobs")
        .countDocuments({ result: { $exists: true } }),
    ).toBe(0);
  });
  it("isolates foreign-store status, enqueue, cancel and worker scope", async () => {
    const ctx = await context();
    await repo.enqueue(ctx, sourceId.toHexString());
    const foreign = { ...ctx, storeId: new ObjectId().toHexString() };
    await expect(repo.get(foreign, sourceId.toHexString())).rejects.toThrow();
    await expect(
      repo.enqueue(foreign, sourceId.toHexString()),
    ).rejects.toThrow();
    await expect(
      repo.cancel(foreign, sourceId.toHexString()),
    ).rejects.toThrow();
    expect(await repo.claim({ ...scope, storeId: foreign.storeId })).toBeNull();
    await expect(
      repo.get({ ...ctx, organizationId: "foreign" }, sourceId.toHexString()),
    ).rejects.toThrow();
  });
  it("refuses late publication after source deletion or a source checksum change", async () => {
    const ctx = await context();
    await repo.enqueue(ctx, sourceId.toHexString());
    const job = (await repo.claim(scope))!;
    await db
      .collection("documentSources")
      .updateOne(
        { _id: sourceId },
        { $set: { checksumSha256: "f".repeat(64) } },
      );
    await expect(repo.complete(job, result)).rejects.toMatchObject({
      code: "UPLOAD_NOT_FOUND",
    });
    await db.collection("documentSources").deleteOne({ _id: sourceId });
    await expect(repo.complete(job, result)).rejects.toMatchObject({
      code: "UPLOAD_NOT_FOUND",
    });
    expect(await db.collection("documentSources").countDocuments({})).toBe(0);
    expect(
      await db
        .collection("documentProcessingJobs")
        .countDocuments({ result: { $exists: true } }),
    ).toBe(0);
  });
  it("serializes admission limits and hides expired results even before TTL cleanup", async () => {
    const ctx = await context();
    for (let i = 0; i < policy.maxJobsPerStore - 1; i++) {
      const id = new ObjectId();
      await seed(id);
      await repo.enqueue(ctx, id.toHexString());
    }
    const other = new ObjectId();
    await seed(other);
    const results = await Promise.allSettled([
      repo.enqueue(ctx, other.toHexString()),
      repo.enqueue(ctx, sourceId.toHexString()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.collection("documentProcessingJobs").countDocuments({}),
    ).toBe(policy.maxJobsPerStore);
    clock = new Date(clock.getTime() + policy.retentionMs + 1);
    expect(await repo.get(ctx, other.toHexString())).toBeNull();
    expect(await repo.claim(scope)).toBeNull();
  });
  it("rejects partial or inconsistent extraction results", async () => {
    await repo.enqueue(await context(), sourceId.toHexString());
    const job = (await repo.claim(scope))!;
    await expect(
      repo.complete(job, { ...result, pages: [] }),
    ).rejects.toThrow();
    await expect(
      repo.complete(job, {
        ...result,
        pages: [
          { page: 1, text: "a" },
          { page: 2, text: "b" },
        ],
      }),
    ).rejects.toBeInstanceOf(PrivateStorageError);
  });
});
