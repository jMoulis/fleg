import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, BSON, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import {
  InventorySyncRepository,
  InventorySyncConflict,
} from "@/server/repositories/inventory-sync-repository";
import { InventoryRepository } from "@/server/repositories/inventory-repository";
import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { inventorySyncInputSchema } from "@/domain/offline/sync";

const uri = process.env.STORAGE_TEST_MONGODB_URI;
const context: AuthorizedStoreContext = {
  organizationId: "sync-org",
  storeId: new ObjectId().toHexString(),
  userId: "manager",
  role: "department_manager",
  permissions: ["inventory.read", "inventory.write"],
};
const productIds = [new ObjectId().toHexString(), new ObjectId().toHexString()];
const observedAt = new Date(Date.now() - 3600000).toISOString();
function input(businessDate: string) {
  return inventorySyncInputSchema.parse({
    schemaVersion: 1,
    operationId: randomUUID(),
    draftId: randomUUID(),
    owner: {
      userId: context.userId,
      storeId: context.storeId,
      organizationId: context.organizationId,
    },
    businessDate,
    timeZone: "Europe/Paris",
    createdAt: observedAt,
    baseCountId: null,
    basedOnRevision: null,
    lines: [
      {
        productId: productIds[0],
        familyCode: "3400",
        stockUnit: "kg",
        packSize: 18.5,
        reserveCaseCount: 2,
        shelfQuantity: 1.5,
        observedAt,
      },
    ],
  });
}

describe.skipIf(!uri)(
  "TECH-03 transactions against disposable local MongoDB",
  () => {
    let client: MongoClient;
    let db: Db;
    let repo: InventorySyncRepository;
    beforeAll(async () => {
      client = new MongoClient(requireLocalMongoUri(uri!), {
        serverSelectionTimeoutMS: 5000,
      });
      await client.connect();
      db = client.db(`fleg_sync_test_${randomUUID().replaceAll("-", "")}`);
      await ensureFoundationIndexesForDb(db);
      await db.collection("stores").insertOne({
        _id: new ObjectId(context.storeId),
        organizationId: context.organizationId,
        code: "SYNC",
        active: true,
        dataRevision: 1,
      });
      await db.collection("products").insertMany(
        productIds.map((id, i) => ({
          _id: new ObjectId(id),
          organizationId: context.organizationId,
          storeId: new ObjectId(context.storeId),
          label: `Article ${i}`,
          canonicalKey: id,
          active: true,
        })),
      );
      repo = new InventorySyncRepository(db, client);
    }, 30000);
    afterAll(async () => {
      if (db) await db.dropDatabase();
      await client?.close();
    });

    it("replays a lost ACK exactly, including concurrent duplicate requests, with one audit and compact receipt", async () => {
      const payload = input("2026-09-01");
      const [first, second] = await Promise.all([
        repo.apply(context, payload, randomUUID()),
        repo.apply(context, payload, randomUUID()),
      ]);
      expect(second).toEqual(first);
      expect(await repo.apply(context, payload, randomUUID())).toEqual(first);
      await expect(
        repo.apply(
          context,
          { ...payload, lines: [{ ...payload.lines[0], shelfQuantity: 99 }] },
          randomUUID(),
        ),
      ).rejects.toThrow("autre contenu");
      expect(
        await db
          .collection("inventoryCounts")
          .countDocuments({ businessDate: payload.businessDate }),
      ).toBe(1);
      expect(
        await db
          .collection("auditLogs")
          .countDocuments({ entityId: new ObjectId(first.countId) }),
      ).toBe(1);
      const commands = await db
        .collection("inventorySyncCommands")
        .find()
        .toArray();
      expect(commands).toHaveLength(1);
      expect(BSON.calculateObjectSize(commands[0])).toBeLessThan(1500);
      expect(commands[0]).not.toHaveProperty("lines");
      expect(commands[0]).not.toHaveProperty("countSnapshot");
      expect(await db.collection("stockSnapshots").countDocuments()).toBe(0);
      expect(
        (
          await db
            .collection("stores")
            .findOne({ _id: new ObjectId(context.storeId) })
        )?.dataRevision,
      ).toBe(1);
    });

    it("rejects another owner/store/permission and foreign products before any mutation", async () => {
      const payload = input("2026-09-02");
      for (const altered of [
        { ...context, userId: "other" },
        { ...context, storeId: new ObjectId().toHexString() },
        { ...context, organizationId: "foreign" },
        { ...context, permissions: [] },
      ])
        await expect(
          repo.apply(altered, payload, randomUUID()),
        ).rejects.toThrow();
      await expect(
        repo.apply(
          context,
          {
            ...payload,
            lines: [
              { ...payload.lines[0], productId: new ObjectId().toHexString() },
            ],
          },
          randomUUID(),
        ),
      ).rejects.toThrow("article");
      expect(
        await db
          .collection("inventoryCounts")
          .countDocuments({ businessDate: payload.businessDate }),
      ).toBe(0);
    });

    it("CAS rejects stale devices while patching only changed lines", async () => {
      const payload = input("2026-09-03");
      const first = await repo.apply(context, payload, randomUUID());
      const next = {
        ...payload,
        operationId: randomUUID(),
        baseCountId: first.countId,
        basedOnRevision: first.revision,
        lines: [
          { ...payload.lines[0], productId: productIds[1], shelfQuantity: 7 },
        ],
      };
      const results = await Promise.allSettled([
        repo.apply(context, next, randomUUID()),
        repo.apply(
          context,
          {
            ...next,
            operationId: randomUUID(),
            lines: [{ ...next.lines[0], shelfQuantity: 8 }],
          },
          randomUUID(),
        ),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
        InventorySyncConflict,
      );
      const count = (await repo.current(context, payload.businessDate))!;
      expect(count.revision).toBe(2);
      expect(count.lines).toHaveLength(2);
      expect(
        count.lines.find((line) => line.productId === productIds[0]),
      ).toEqual(payload.lines[0]);
      // A later revision must not change the response for the original operation.
      expect(await repo.apply(context, payload, randomUUID())).toEqual(first);
    });

    it("rolls back the count and receipt if the audit insert fails", async () => {
      const payload = input("2026-09-04");
      await db.command({
        collMod: "auditLogs",
        validator: { action: { $ne: "inventory.count.offline_synchronized" } },
      });
      try {
        await expect(
          repo.apply(context, payload, randomUUID()),
        ).rejects.toThrow();
      } finally {
        await db.command({ collMod: "auditLogs", validator: {} });
      }
      expect(await repo.current(context, payload.businessDate)).toBeNull();
      expect(
        await db
          .collection("inventorySyncCommands")
          .countDocuments({ "receipt.operationId": payload.operationId }),
      ).toBe(0);
      expect((await repo.apply(context, payload, randomUUID())).revision).toBe(
        1,
      );
    });

    it("preserves offline observation time through explicit commitment and requires a correction afterwards", async () => {
      const payload = input("2026-09-05");
      const ack = await repo.apply(context, payload, randomUUID());
      const inventory = new InventoryRepository(db, client);
      await inventory.commitDraft({
        context,
        countId: ack.countId,
        basedOnRevision: ack.revision,
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
      });
      const snapshot = await db
        .collection("stockSnapshots")
        .findOne({ businessDate: payload.businessDate });
      expect(snapshot?.observedAt.toISOString()).toBe(observedAt);
      expect(snapshot?.onHandQuantity).toBe(38.5);
      expect(snapshot?.createdAt.getTime()).toBeGreaterThan(
        Date.parse(observedAt),
      );
      await expect(
        repo.apply(
          context,
          {
            ...payload,
            operationId: randomUUID(),
            baseCountId: ack.countId,
            basedOnRevision: ack.revision,
          },
          randomUUID(),
        ),
      ).rejects.toThrow("validé");
      const correction = await inventory.createDraft({
        context,
        createInput: {
          businessDate: payload.businessDate,
          idempotencyKey: randomUUID(),
        },
        requestId: randomUUID(),
      });
      expect(
        correction.lines.find((line) => line.productId === productIds[0])
          ?.observedAt,
      ).toBe(observedAt);
      const corrected = await repo.apply(
        context,
        {
          ...payload,
          operationId: randomUUID(),
          baseCountId: correction.id,
          basedOnRevision: correction.revision,
        },
        randomUUID(),
      );
      expect(corrected.countId).toBe(correction.id);
    });

    it("rejects future device time and changed store timezone", async () => {
      const payload = input("2026-09-06");
      const future = new Date(Date.now() + 86400000).toISOString();
      await expect(
        repo.apply(
          context,
          {
            ...payload,
            createdAt: future,
            lines: [{ ...payload.lines[0], observedAt: future }],
          },
          randomUUID(),
        ),
      ).rejects.toThrow("Horloge");
      await expect(
        repo.apply(
          context,
          { ...payload, timeZone: "America/New_York" },
          randomUUID(),
        ),
      ).rejects.toThrow("fuseau");
      expect(await repo.current(context, payload.businessDate)).toBeNull();
    });

    it("normalizes product ObjectIds before patching an existing line", async () => {
      const payload = input("2026-09-07");
      const ack = await repo.apply(context, payload, randomUUID());
      await repo.apply(
        context,
        {
          ...payload,
          operationId: randomUUID(),
          baseCountId: ack.countId,
          basedOnRevision: ack.revision,
          lines: [
            {
              ...payload.lines[0],
              productId: productIds[0].toUpperCase(),
              shelfQuantity: 8,
            },
          ],
        },
        randomUUID(),
      );
      const count = (await repo.current(context, payload.businessDate))!;
      expect(count.lines).toHaveLength(1);
      expect(count.lines[0].shelfQuantity).toBe(8);
    });
  },
);
