import { createHash, randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
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
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import { CommercialBriefRepository } from "@/server/repositories/commercial-brief-repository";
import { authorizeUploadAuthor } from "@/server/auth/upload-author-context";
import { briefPolicy } from "@/domain/commercial-briefs/schemas";
import {
  briefTestConfig,
  briefTestExtraction,
  briefTestPages,
} from "@/test/helpers/commercial-brief-fixture";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
describe.skipIf(!uri)("commercial briefs on isolated MongoDB", () => {
  let client: MongoClient,
    db: Db,
    authDb: Db,
    repo: CommercialBriefRepository,
    clock: Date;
  const storeId = new ObjectId(),
    sourceId = new ObjectId();
  const scope = { organizationId: "brief-org", storeId };
  const collections = [
    "commercialBriefs",
    "commercialBriefBudgets",
    "documentSources",
    "documentProcessingJobs",
    "stores",
    "storeMemberships",
    "auditLogs",
    "products",
    "productAliases",
  ];
  beforeAll(async () => {
    client = await new MongoClient(requireLocalMongoUri(uri!), {
      serverSelectionTimeoutMS: 5000,
    }).connect();
    const suffix = randomUUID().replaceAll("-", "");
    db = client.db(`fleg_brief_test_${suffix}`);
    authDb = client.db(`fleg_brief_auth_${suffix}`);
    for (const name of collections) await db.createCollection(name);
    for (const name of ["user", "organization", "member"])
      await authDb.createCollection(name);
    await db
      .collection("commercialBriefs")
      .createIndex(
        { organizationId: 1, storeId: 1, checksumSha256: 1, policyVersion: 1 },
        { unique: true },
      );
  }, 30_000);
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
    repo = new CommercialBriefRepository(db, authDb, client, () => clock);
    await authDb
      .collection<{ _id: string }>("user")
      .insertOne({ _id: "owner" });
    await authDb
      .collection<{ _id: string }>("organization")
      .insertOne({ _id: scope.organizationId });
    await authDb
      .collection("member")
      .insertOne({
        organizationId: scope.organizationId,
        userId: "owner",
        role: "owner",
      });
    await db
      .collection("stores")
      .insertOne({
        _id: storeId,
        organizationId: scope.organizationId,
        active: true,
      });
    await seed(sourceId);
  });
  async function seed(id: ObjectId) {
    const checksumSha256 = createHash("sha256")
      .update(id.toHexString())
      .digest("hex");
    await db
      .collection("documentSources")
      .insertOne({
        ...scope,
        _id: id,
        mimeType: "application/pdf",
        storageState: "linked",
        checksumSha256,
      });
    await db
      .collection("documentProcessingJobs")
      .insertOne({
        ...scope,
        sourceId: id,
        checksumSha256,
        state: "ready",
        expiresAt: new Date(clock.getTime() + 86400_000),
        result: {
          extractorVersion: "pdfium-2.1.13-text-1",
          pages: briefTestPages,
        },
      });
  }
  const context = () =>
    authorizeUploadAuthor({ db, authDb, ...scope, ownerId: "owner" });
  const enqueue = async (config = briefTestConfig) =>
    repo.enqueue(await context(), sourceId.toHexString(), [1], config);
  const claim = () =>
    repo.claim({
      organizationId: scope.organizationId,
      storeId: storeId.toHexString(),
    });
  const providerResult = () => ({
    extraction: briefTestExtraction(),
    usage: { inputTokens: 1000, outputTokens: 500, estimatedUsdCents: 1 },
    responseModel: "synthetic-test-only",
  });
  async function draft() {
    await enqueue();
    const job = (await claim())!;
    await repo.workerSource(job);
    await repo.complete(job, providerResult());
    return (await repo.get(await context(), sourceId.toHexString()))!;
  }
  it("persists a grounded draft then audits corrections without applying operations", async () => {
    const before = await draft();
    expect(before.state).toBe("draft");
    const values = before.extraction!.sections[0]!.fields.map((f) => ({
      key: f.key,
      value: f.key === "selling_price_cents" ? 250 : f.value,
    }));
    const reviewed = await repo.review(
      await context(),
      sourceId.toHexString(),
      { expectedRevision: 0, section: 0, decision: "confirmed", values },
    );
    expect(reviewed.state).toBe("reviewed");
    expect(
      reviewed.extraction!.sections[0]!.fields.find(
        (f) => f.key === "selling_price_cents",
      )!.value,
    ).toBe(260);
    expect(
      reviewed.reviews[0]!.values.find((f) => f.key === "selling_price_cents")!
        .value,
    ).toBe(250);
    expect(
      await db
        .collection("auditLogs")
        .countDocuments({
          ...scope,
          action: "commercial_brief.transcription_reviewed",
        }),
    ).toBe(1);
    for (const name of [
      "commercialEvents",
      "orderSuggestions",
      "allocationPlans",
    ])
      expect(await db.collection(name).countDocuments({})).toBe(0);
  });
  it("deduplicates concurrent requests and reserves their spend only once", async () => {
    const jobs = await Promise.all([enqueue(), enqueue()]);
    expect(jobs[0]!.id).toBe(jobs[1]!.id);
    expect(await db.collection("commercialBriefs").countDocuments(scope)).toBe(
      1,
    );
    expect(
      (await db.collection("commercialBriefBudgets").findOne(scope))!.reserved,
    ).toBe(5);
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it("serializes daily budgets across different documents", async () => {
    const other = new ObjectId();
    await seed(other);
    const ctx = await context();
    const attempts = await Promise.allSettled([
      repo.enqueue(ctx, sourceId.toHexString(), [1], {
        ...briefTestConfig,
        dailyBudgetCents: 5,
      }),
      repo.enqueue(ctx, other.toHexString(), [1], {
        ...briefTestConfig,
        dailyBudgetCents: 5,
      }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.collection("commercialBriefBudgets").findOne(scope))!.reserved,
    ).toBe(5);
  });
  it("refuses unextracted, scanned and repeated pages without reserving spend", async () => {
    const ctx = await context();
    await expect(
      repo.enqueue(ctx, sourceId.toHexString(), [1, 1], briefTestConfig),
    ).rejects.toThrow();
    await expect(
      repo.enqueue(ctx, sourceId.toHexString(), [2], briefTestConfig),
    ).rejects.toThrow();
    await db.collection("documentProcessingJobs").deleteMany(scope);
    await expect(enqueue()).rejects.toThrow();
    expect(
      await db.collection("commercialBriefBudgets").countDocuments({}),
    ).toBe(0);
  });
  it("does not expose another store or organization, including catalogue matches", async () => {
    const ready = await draft();
    const ctx = await context();
    for (const foreign of [
      { ...ctx, storeId: new ObjectId().toHexString() },
      { ...ctx, organizationId: "other" },
    ]) {
      await expect(repo.get(foreign, sourceId.toHexString())).rejects.toThrow();
      await expect(repo.matches(foreign, ready)).rejects.toThrow();
      await expect(
        repo.enqueue(foreign, sourceId.toHexString(), [1], briefTestConfig),
      ).rejects.toThrow();
      await expect(
        repo.review(foreign, sourceId.toHexString(), {
          expectedRevision: 0,
          section: 0,
          decision: "excluded",
          values: [],
        }),
      ).rejects.toThrow();
    }
  });
  it("rechecks author access before spending and before saving the result", async () => {
    await enqueue();
    const job = (await claim())!;
    await authDb.collection("member").deleteMany({});
    await expect(repo.workerSource(job)).rejects.toThrow();
    await expect(repo.complete(job, providerResult())).rejects.toThrow();
  });
  it("refuses late completion after source revocation or checksum replacement", async () => {
    await enqueue();
    const job = (await claim())!;
    await db
      .collection("documentSources")
      .updateOne({ _id: sourceId }, { $set: { storageState: "deleting" } });
    await expect(repo.complete(job, providerResult())).rejects.toThrow();
    await db
      .collection("documentSources")
      .updateOne(
        { _id: sourceId },
        { $set: { storageState: "linked", checksumSha256: "a".repeat(64) } },
      );
    await expect(repo.complete(job, providerResult())).rejects.toThrow();
  });
  it("retains usage on invalid evidence and never retries an interrupted worker", async () => {
    await enqueue();
    const job = (await claim())!;
    const result = providerResult();
    result.extraction.sections[0]!.evidence.excerpt = "invented";
    await repo.complete(job, result);
    expect(
      await repo.get(await context(), sourceId.toHexString()),
    ).toMatchObject({
      state: "failed",
      extraction: null,
      usage: { estimatedUsdCents: 1 },
    });
    expect(await claim()).toBeNull();
    expect((await enqueue()).state).toBe("failed");
  });
  it("marks expired leases failed without another provider attempt", async () => {
    await enqueue();
    await claim();
    clock = new Date(clock.getTime() + briefPolicy.leaseMs + 1);
    expect(await claim()).toBeNull();
    expect(
      await repo.get(await context(), sourceId.toHexString()),
    ).toMatchObject({ state: "failed", error: "interrupted" });
  });
  it("expires private text independently of asynchronous TTL cleanup", async () => {
    await draft();
    clock = new Date(clock.getTime() + briefPolicy.retentionMs + 1);
    expect(await repo.get(await context(), sourceId.toHexString())).toBeNull();
    await expect(enqueue()).rejects.toThrow();
  });
  it("rejects stale reviews, changes to source keys and repeat confirmations", async () => {
    await draft();
    const ctx = await context();
    await expect(
      repo.review(ctx, sourceId.toHexString(), {
        expectedRevision: 1,
        section: 0,
        decision: "excluded",
        values: [],
      }),
    ).rejects.toThrow();
    await expect(
      repo.review(ctx, sourceId.toHexString(), {
        expectedRevision: 0,
        section: 0,
        decision: "confirmed",
        values: [],
      }),
    ).rejects.toThrow();
    await repo.review(ctx, sourceId.toHexString(), {
      expectedRevision: 0,
      section: 0,
      decision: "excluded",
      values: [],
    });
    await expect(
      repo.review(ctx, sourceId.toHexString(), {
        expectedRevision: 0,
        section: 0,
        decision: "excluded",
        values: [],
      }),
    ).rejects.toThrow();
  });
  it("resolves identifiers only within the store and never overrides them by a label", async () => {
    const ready = await draft();
    const ctx = await context();
    const productId = new ObjectId();
    await db
      .collection("products")
      .insertOne({
        ...scope,
        _id: productId,
        label: "Poires locales",
        normalizedLabel: "poires",
        active: true,
      });
    expect((await repo.matches(ctx, ready))[0]!.method).toBe("unresolved");
    await db
      .collection("productAliases")
      .insertOne({
        ...scope,
        source: "mercalys",
        externalKey: "plu:4001",
        productId,
        ignored: false,
      });
    expect((await repo.matches(ctx, ready))[0]).toMatchObject({
      method: "identifier",
      product: { id: productId.toHexString() },
    });
    await db
      .collection("productAliases")
      .insertOne({
        ...scope,
        source: "mercalys",
        externalKey: "plu:4001",
        productId: new ObjectId(),
        ignored: false,
      });
    expect((await repo.matches(ctx, ready))[0]!.method).toBe("ambiguous");
  });
});
