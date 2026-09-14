import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Binary, BSON, MongoClient, ObjectId, type Db } from "mongodb";
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
vi.mock("@vercel/blob", () => ({
  get: () => {
    throw new Error("No Blob during inventory");
  },
}));
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import { inventoryLegacyPhotos } from "@/server/repositories/photo-migration-inventory";
import * as authorAccess from "@/server/auth/upload-author-context";
import * as targetAccess from "@/server/repositories/attachment-target";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
const store = new ObjectId();
const scope = {
  organizationId: "migration-org",
  storeId: store.toHexString(),
  actorId: "operator",
};
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
describe.skipIf(!uri)(
  "photo migration read-only local MongoDB inventory",
  () => {
    let client: MongoClient, db: Db, authDb: Db;
    const commands: string[] = [];
    beforeAll(async () => {
      client = new MongoClient(requireLocalMongoUri(uri!), {
        monitorCommands: true,
        serverSelectionTimeoutMS: 5000,
      });
      client.on("commandStarted", (event) => commands.push(event.commandName));
      await client.connect();
      const suffix = randomUUID().replaceAll("-", "");
      db = client.db(`fleg_photo_migration_test_${suffix}`);
      authDb = client.db(`fleg_photo_migration_auth_test_${suffix}`);
      // Collection creation can wait behind other persistence suites' DDL.
      // Keep it in setup, not the timed per-test fixture reset.
      for (const name of [
        "attachments",
        "attachmentObjects",
        "stores",
        "storeMemberships",
        "layoutVersions",
      ])
        await db.createCollection(name);
      for (const name of ["user", "organization", "member"])
        await authDb.createCollection(name);
    }, 30000);
    afterAll(async () => {
      await db?.dropDatabase();
      await authDb?.dropDatabase();
      await client?.close();
    });
    beforeEach(async () => {
      for (const name of [
        "attachments",
        "attachmentObjects",
        "stores",
        "storeMemberships",
        "layoutVersions",
      ])
        await db.collection(name).deleteMany({});
      for (const name of ["user", "organization", "member"])
        await authDb.collection(name).deleteMany({});
      await authDb
        .collection<{ _id: string }>("user")
        .insertOne({ _id: scope.actorId });
      await authDb
        .collection<{ _id: string }>("organization")
        .insertOne({ _id: scope.organizationId });
      await authDb.collection("member").insertOne({
        organizationId: scope.organizationId,
        userId: scope.actorId,
        role: "owner",
      });
      await db.collection("stores").insertOne({
        _id: store,
        organizationId: scope.organizationId,
        active: true,
      });
    });
    async function seed(id = new ObjectId(), content = bytes) {
      const metadata = {
        _id: id,
        organizationId: scope.organizationId,
        storeId: store,
        target: { type: "store" },
        targetKey: "store",
        caption: "private-caption-never-in-report",
        originalFileName: "private-name.png",
        mimeType: "image/png",
        sizeBytes: content.length,
        checksumSha256: hash(content),
        retentionPolicy: "until_manual_deletion",
        uploadedBy: "operator",
        createdAt: new Date(),
      };
      await db.collection("attachments").insertOne(metadata);
      await db.collection("attachmentObjects").insertOne({
        _id: id,
        organizationId: scope.organizationId,
        storeId: store,
        mimeType: "image/png",
        sizeBytes: content.length,
        checksumSha256: hash(content),
        content: new Binary(content),
        createdAt: metadata.createdAt,
      });
      return id;
    }
    it("verifies bytes without writing any database command or leaking private content", async () => {
      await seed();
      const before = BSON.serialize({
        rows: await db.collection("attachmentObjects").find({}).toArray(),
      });
      commands.length = 0;
      const report = await inventoryLegacyPhotos(db, authDb, scope);
      expect(report.entries[0]?.status).toBe("eligible_for_copy");
      expect(report.bytesRead).toBe(8);
      expect(report.exhausted).toBe(true);
      expect(
        commands.every((name) =>
          ["find", "aggregate", "getMore", "killCursors"].includes(name),
        ),
      ).toBe(true);
      expect(
        Buffer.from(
          BSON.serialize({
            rows: await db.collection("attachmentObjects").find({}).toArray(),
          }),
        ).equals(Buffer.from(before)),
      ).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(
        /private-caption|private-name|contentUrl|vercel_blob_rw/,
      );
    });
    it("paginates the union of photos and orphan BSON without dropping or duplicating IDs", async () => {
      const ids = [new ObjectId(), new ObjectId(), new ObjectId()].sort(
        (a, b) => a.toHexString().localeCompare(b.toHexString()),
      );
      await seed(ids[0]);
      await seed(ids[2]);
      await db.collection("attachmentObjects").insertOne({
        _id: ids[1],
        organizationId: scope.organizationId,
        storeId: store,
        content: new Binary(bytes),
      });
      const seen: string[] = [];
      let after: string | null = null;
      for (let i = 0; i < 3; i++) {
        const page = await inventoryLegacyPhotos(db, authDb, {
          ...scope,
          pageSize: 1,
          after,
        });
        seen.push(page.entries[0]!.attachmentId);
        after = page.nextCursor;
        expect(page.exhausted).toBe(i === 2);
        if (i === 1) expect(page.entries[0]!.status).toBe("orphan_bson");
      }
      expect(seen).toEqual(ids.map((id) => id.toHexString()));
    });
    it("stops at the byte budget and resumes the unprocessed photo", async () => {
      const large = Buffer.alloc(3 * 1024 * 1024);
      bytes.copy(large);
      const a = await seed(undefined, large),
        b = await seed(undefined, large);
      const first = await inventoryLegacyPhotos(db, authDb, {
        ...scope,
        maxReadBytes: 4 * 1024 * 1024,
      });
      expect(first.entries).toHaveLength(1);
      expect(first.nextCursor).toBe(a.toHexString());
      expect(first.bytesRead).toBe(large.length);
      const second = await inventoryLegacyPhotos(db, authDb, {
        ...scope,
        after: first.nextCursor,
        maxReadBytes: 4 * 1024 * 1024,
      });
      expect(second.entries[0]?.attachmentId).toBe(b.toHexString());
      expect(second.exhausted).toBe(true);
    });
    it("excludes foreign-store objects and refuses forged, downgraded or revoked operators", async () => {
      const id = await seed();
      await db
        .collection("attachmentObjects")
        .updateOne({ _id: id }, { $set: { storeId: new ObjectId() } });
      expect(
        (await inventoryLegacyPhotos(db, authDb, scope)).entries[0]?.status,
      ).toBe("missing_bson");
      await expect(
        inventoryLegacyPhotos(db, authDb, {
          ...scope,
          storeId: new ObjectId().toHexString(),
        }),
      ).rejects.toThrow();
      await expect(
        inventoryLegacyPhotos(db, authDb, {
          ...scope,
          organizationId: "foreign",
        }),
      ).rejects.toThrow();
      await authDb
        .collection("member")
        .updateOne({}, { $set: { role: "member" } });
      await db.collection("storeMemberships").insertOne({
        organizationId: scope.organizationId,
        storeId: store,
        userId: scope.actorId,
        role: "department_manager",
        permissions: ["attachments.write"],
        active: true,
      });
      await expect(inventoryLegacyPhotos(db, authDb, scope)).rejects.toThrow();
      await authDb.collection("member").deleteMany({});
      await expect(inventoryLegacyPhotos(db, authDb, scope)).rejects.toThrow();
    });
    it("flags corrupt, oversized, missing, deleted and invalid-target photos without granting eligibility", async () => {
      const bad = await seed(),
        oversized = await seed(),
        missing = await seed(),
        deleting = await seed(),
        target = await seed();
      await db
        .collection("attachmentObjects")
        .updateOne(
          { _id: bad },
          { $set: { content: new Binary(Buffer.alloc(8)) } },
        );
      await db
        .collection("attachmentObjects")
        .updateOne(
          { _id: oversized },
          { $set: { content: new Binary(Buffer.alloc(5 * 1024 * 1024)) } },
        );
      await db.collection("attachmentObjects").deleteOne({ _id: missing });
      await db
        .collection("attachments")
        .updateOne({ _id: deleting }, { $set: { storageState: "deleting" } });
      const targetId = new ObjectId().toHexString();
      await db.collection("attachments").updateOne(
        { _id: target },
        {
          $set: {
            target: { type: "layout", layoutVersionId: targetId },
            targetKey: `layout:${targetId}`,
          },
        },
      );
      const report = await inventoryLegacyPhotos(db, authDb, scope);
      expect(report.entries.map((v) => v.status)).toEqual([
        "invalid_content",
        "invalid_content",
        "missing_bson",
        "deleting",
        "invalid_target",
      ]);
      expect(report.bytesRead).toBe(16); // oversized data never transferred to the process
    });
    it("classifies existing Blob references and BSON remnants without reading Blob", async () => {
      const clean = await seed(),
        remnant = await seed();
      const storage = {
        backend: "vercel_blob",
        storeId: "store_test",
        namespace: "local-test",
        pathname: `fleg/local-test/${hash(Buffer.from(scope.organizationId))}/${scope.storeId}/${randomUUID()}.png`,
      };
      await db
        .collection("attachments")
        .updateMany({}, { $set: { storage, storageState: "linked" } });
      await db.collection("attachmentObjects").deleteOne({ _id: clean });
      const report = await inventoryLegacyPhotos(db, authDb, scope);
      expect(report.entries.map((v) => [v.attachmentId, v.status])).toEqual([
        [clean.toHexString(), "already_blob"],
        [remnant.toHexString(), "blob_with_bson"],
      ]);
      expect(report.bytesRead).toBe(0);
    });
    it("detects a source deleted during target validation and does not recreate it", async () => {
      const id = await seed();
      const original = targetAccess.assertAttachmentTargetExists;
      const spy = vi
        .spyOn(targetAccess, "assertAttachmentTargetExists")
        .mockImplementationOnce(async (...args) => {
          await original(...args);
          await db.collection("attachments").deleteOne({ _id: id });
        });
      try {
        expect(
          (await inventoryLegacyPhotos(db, authDb, scope)).entries[0]?.status,
        ).toBe("changed_during_read");
        expect(await db.collection("attachments").countDocuments({})).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
    it("reauthorizes at the end and suppresses the report after membership revocation", async () => {
      await seed();
      const original = authorAccess.authorizeUploadAuthor;
      const spy = vi
        .spyOn(authorAccess, "authorizeUploadAuthor")
        .mockImplementationOnce(async (input) => {
          const context = await original(input);
          await authDb.collection("member").deleteMany({});
          return context;
        });
      try {
        await expect(
          inventoryLegacyPhotos(db, authDb, scope),
        ).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
    });
    it("runs the real CLI inventory then offline simulation against local synthetic data", async () => {
      const id = await seed();
      const dir = mkdtempSync(join(tmpdir(), "fleg-inventory-cli-test-"));
      const report = join(dir, "inventory.json"),
        plan = join(dir, "plan.json");
      const cli = [
        "--import",
        "tsx",
        "--conditions=react-server",
        resolve("src/scripts/plan-photo-migration.ts"),
      ];
      const env = { ...process.env, PHOTO_MIGRATION_MONGODB_URI: uri! };
      try {
        execFileSync(
          process.execPath,
          [
            ...cli,
            "--read",
            "--organization",
            scope.organizationId,
            "--store",
            scope.storeId,
            "--actor",
            scope.actorId,
            "--app-db",
            db.databaseName,
            "--auth-db",
            authDb.databaseName,
            "--confirm-host",
            new URL(uri!).host,
            "--confirm-scope",
            `${scope.organizationId}/${scope.storeId}`,
            "--output",
            report,
          ],
          { env },
        );
        execFileSync(
          process.execPath,
          [...cli, "--snapshot", report, "--output", plan],
          { env: { ...env, PHOTO_MIGRATION_MONGODB_URI: "must-not-be-used" } },
        );
        expect(JSON.parse(readFileSync(plan, "utf8"))).toMatchObject({
          mode: "dry-run",
          inspected: 1,
          eligibleLogicalBytes: 8,
          bytesFreed: 0,
          candidates: [{ attachmentId: id.toHexString() }],
        });
        expect(
          await db.collection("attachmentObjects").countDocuments({}),
        ).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);
