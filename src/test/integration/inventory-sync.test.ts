import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { offlineDb as db } from "@/lib/offline/storage";
import {
  forgetPreparedWorkspace,
  preparationEpoch,
  savePreparedWorkspace,
} from "@/lib/offline/database";
import {
  discardLocalDraft,
  readLocalDraft,
  saveLocalLine,
  startLocalDraft,
} from "@/lib/offline/inventory-drafts";
import {
  acknowledgeInventorySync,
  enableInventorySync,
  prepareSyncOperation,
  readInventorySync,
  resolveSyncConflict,
  reviseRejectedSync,
  synchronizeInventory,
} from "@/lib/offline/inventory-sync";
import { draftScope } from "@/domain/offline/inventory-draft";
import {
  inventorySyncInputSchema,
  nextSyncRetry,
  syncTransportPolicy,
  type InventorySyncInput,
} from "@/domain/offline/sync";
import { preparedFixture } from "@/test/fixtures/offline";

const now = Date.parse("2026-09-11T07:00:00Z");
const workspace = { ...preparedFixture(500), canWriteInventory: true };
async function prepare(copy = workspace) {
  await savePreparedWorkspace(copy, await preparationEpoch());
}
async function edit(quantity = "2", index = 0) {
  const draft = (await readLocalDraft(workspace))!;
  return saveLocalLine({
    workspace,
    draftId: draft.id,
    expectedRevision: draft.revision,
    line: {
      ...draft.lines[index],
      familyCode: "3400",
      stockUnit: "kg",
      packSize: "18,5",
      reserveCaseCount: quantity,
      shelfQuantity: "0",
      observedAt: new Date(now).toISOString(),
    },
  });
}
function receipt(payload: InventorySyncInput) {
  return {
    kind: "acknowledged",
    operationId: payload.operationId,
    draftId: payload.draftId,
    owner: payload.owner,
    businessDate: payload.businessDate,
    countId: payload.baseCountId ?? "f".repeat(24),
    revision: (payload.basedOnRevision ?? 0) + 1,
    receivedAt: new Date(now).toISOString(),
  };
}
async function enabled() {
  await prepare();
  await startLocalDraft(workspace);
  const draft = await edit();
  await enableInventorySync(workspace, draft.id, draft.revision);
  return draft;
}
const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const access = () =>
  respond({ ...workspace.identity, canWriteInventory: true });
function transport(
  post: (input: InventorySyncInput) => Response | Promise<Response>,
) {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? post(inventorySyncInputSchema.parse(JSON.parse(String(init.body))))
      : access(),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("offline sync persistence and replay", () => {
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          task: (lock: object) => Promise<void>,
        ) => task({}),
      },
    });
    await forgetPreparedWorkspace();
    await db.drafts.clear();
    await db.operations.clear();
    await db.sync.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps old drafts opt-in and upgrades without replacing 500 catalogue lines", async () => {
    await prepare();
    const draft = await startLocalDraft(workspace);
    await edit();
    expect(await prepareSyncOperation(workspace)).toBeNull();
    const changed = (await readLocalDraft(workspace))!;
    await enableInventorySync(workspace, draft.id, changed.revision);
    expect(await readLocalDraft(workspace)).toMatchObject({
      schemaVersion: 2,
      id: draft.id,
      lines: changed.lines,
    });
    const payload = (await prepareSyncOperation(workspace))!;
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      reserveCaseCount: 2,
      shelfQuantity: 0,
      packSize: 18.5,
    });
  });

  it("upgrades an existing TECH-02 database without losing its pending edits", async () => {
    await prepare();
    await startLocalDraft(workspace);
    const draft = await edit("8");
    const operations = await db.operations.toArray();
    await db.delete(); // This suite uses fake-indexeddb only.
    const legacy = new Dexie(db.name);
    legacy
      .version(2)
      .stores({
        copies: "key",
        meta: "key",
        drafts: "key",
        operations: "key,draftId",
      });
    await legacy.table("copies").put({ key: "current", value: workspace });
    await legacy
      .table("drafts")
      .put({ key: draftScope(workspace), value: draft });
    await legacy.table("operations").bulkPut(operations);
    legacy.close();
    await db.open();
    expect(await readLocalDraft(workspace)).toEqual(draft);
    expect(await db.operations.toArray()).toEqual(operations);
    expect(await readInventorySync(workspace)).toBeNull();
    await enableInventorySync(workspace, draft.id, draft.revision);
    expect(
      (await prepareSyncOperation(workspace))?.lines[0].reserveCaseCount,
    ).toBe(8);
  });

  it("bounds retry attempts even when a process closes without recording its failure", async () => {
    await enabled();
    for (let attempt = 0; attempt < syncTransportPolicy.maxAttempts; attempt++)
      expect(await prepareSyncOperation(workspace)).not.toBeNull();
    db.close();
    await db.open();
    expect(await prepareSyncOperation(workspace)).toBeNull();
    expect((await readInventorySync(workspace))?.phase).toBe("failed");
    expect(await prepareSyncOperation(workspace, true)).not.toBeNull();
  });

  it("reopens the exact immutable operation and removes only acknowledged edits", async () => {
    await enabled();
    const payload = (await prepareSyncOperation(workspace))!;
    await edit("3");
    db.close();
    await db.open();
    expect(await prepareSyncOperation(workspace, true)).toEqual(payload);
    await acknowledgeInventorySync(workspace, receipt(payload));
    expect(await readInventorySync(workspace)).toMatchObject({
      phase: "pending",
      serverRevision: 1,
    });
    const next = (await prepareSyncOperation(workspace))!;
    expect(next.operationId).not.toBe(payload.operationId);
    expect(next.lines[0].reserveCaseCount).toBe(3);
    expect(next.basedOnRevision).toBe(1);
    await acknowledgeInventorySync(workspace, receipt(next));
    expect(await db.operations.count()).toBe(0);
    expect((await readInventorySync(workspace))?.phase).toBe("synchronized");
    expect(await prepareSyncOperation(workspace)).toBeNull();
  });

  it("does not delete work on forged ACK or quota failure during ACK", async () => {
    await enabled();
    const payload = (await prepareSyncOperation(workspace))!;
    await expect(
      acknowledgeInventorySync(workspace, { ...receipt(payload), revision: 9 }),
    ).rejects.toThrow("hors périmètre");
    const fail = () => {
      throw new DOMException("Quota", "QuotaExceededError");
    };
    db.sync.hook("updating", fail);
    try {
      await expect(
        acknowledgeInventorySync(workspace, receipt(payload)),
      ).rejects.toThrow("Quota");
    } finally {
      db.sync.hook("updating").unsubscribe(fail);
    }
    expect(await db.operations.count()).toBe(2);
    expect((await readInventorySync(workspace))?.inFlight?.payload).toEqual(
      payload,
    );
    await expect(
      discardLocalDraft(
        workspace,
        payload.draftId,
        (await readLocalDraft(workspace))!.revision,
      ),
    ).rejects.toThrow("peut-être");
  });

  it("does not send incomplete raw values and keeps their operations after another line ACK", async () => {
    await enabled();
    await edit("1,", 1);
    const payload = (await prepareSyncOperation(workspace))!;
    expect(payload.lines).toHaveLength(1);
    await acknowledgeInventorySync(workspace, receipt(payload));
    expect(await prepareSyncOperation(workspace)).toBeNull();
    expect(await readInventorySync(workspace)).toMatchObject({
      phase: "pending",
      pendingLines: [expect.objectContaining({ reserveCaseCount: "1," })],
    });
  });

  it("retries a lost ACK with the same payload, bounds automatic attempts, and resumes manually", async () => {
    await enabled();
    const payloads: InventorySyncInput[] = [];
    transport((payload) => {
      payloads.push(payload);
      throw new TypeError("Network lost");
    });
    for (
      let attempt = 1;
      attempt <= syncTransportPolicy.maxAttempts;
      attempt++
    ) {
      vi.spyOn(Date, "now").mockReturnValue(now + attempt * 65000);
      await synchronizeInventory(workspace);
    }
    expect((await readInventorySync(workspace))?.phase).toBe("failed");
    await synchronizeInventory(workspace);
    expect(payloads).toHaveLength(5);
    expect(
      payloads.every(
        (payload) => JSON.stringify(payload) === JSON.stringify(payloads[0]),
      ),
    ).toBe(true);
    transport((payload) => respond(receipt(payload)));
    await synchronizeInventory(workspace, true);
    expect((await readInventorySync(workspace))?.phase).toBe("synchronized");
    expect(nextSyncRetry(20, now)).toBe(now + 60000);
  });

  it("serializes tabs with the same scoped Web Lock", async () => {
    await enabled();
    let locked = false;
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          task: (lock: object | null) => Promise<void>,
        ) => {
          if (locked) return task(null);
          locked = true;
          try {
            await task({});
          } finally {
            locked = false;
          }
        },
      },
    });
    const fetcher = transport((payload) => respond(receipt(payload)));
    await Promise.all([
      synchronizeInventory(workspace),
      synchronizeInventory(workspace),
    ]);
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });

  it("locks a queue on changed online owner and recovers only the original owner after reauth", async () => {
    const original = await enabled();
    const fetcher = vi.fn(async () =>
      respond({
        ...workspace.identity,
        userId: "user-b",
        canWriteInventory: true,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await synchronizeInventory(workspace);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const flight = (await readInventorySync(workspace))!.inFlight!;
    await forgetPreparedWorkspace();
    await expect(prepareSyncOperation(workspace)).rejects.toThrow();
    const other = {
      ...workspace,
      identity: { ...workspace.identity, userId: "user-b" },
    };
    await prepare(other);
    expect(await readInventorySync(other)).toBeNull();
    const relogged = {
      ...workspace,
      identity: { ...workspace.identity, sessionBinding: "b".repeat(64) },
    };
    await prepare(relogged);
    expect((await readLocalDraft(relogged))?.id).toBe(original.id);
    expect(await prepareSyncOperation(relogged, true)).toEqual(flight.payload);
    await expect(prepareSyncOperation(workspace, true)).rejects.toThrow();
  });

  it("shows a revision conflict, requires every explicit choice, and never adds quantities", async () => {
    await enabled();
    await edit("4", 1);
    const current = {
      id: "e".repeat(24),
      organizationId: workspace.identity.organizationId,
      storeId: workspace.identity.storeId,
      businessDate: workspace.businessDate,
      version: 1,
      revision: 8,
      status: "draft",
      lines: [
        {
          productId: workspace.products[0].id,
          familyCode: "3402",
          stockUnit: "piece",
          packSize: 9,
          reserveCaseCount: 7,
          shelfQuantity: 3,
        },
      ],
      supersedesCountId: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      createdBy: "other",
      updatedBy: "other",
      committedAt: null,
      committedBy: null,
    };
    transport(() =>
      respond({ kind: "conflict", current, message: "Conflit" }, 409),
    );
    await synchronizeInventory(workspace);
    const state = (await readInventorySync(workspace))!;
    const draft = (await readLocalDraft(workspace))!;
    await expect(edit("99")).rejects.toThrow("Résolvez");
    await expect(
      resolveSyncConflict(workspace, state.generation, draft.revision, {}),
    ).rejects.toThrow("chaque article");
    await resolveSyncConflict(workspace, state.generation, draft.revision, {
      [workspace.products[0].id]: "server",
      [workspace.products[1].id]: "local",
    });
    const updated = (await readLocalDraft(workspace))!;
    expect(updated.lines[0]).toMatchObject({
      reserveCaseCount: "7",
      shelfQuantity: "3",
      stockUnit: "piece",
      observedAt: null,
    });
    const next = (await prepareSyncOperation(workspace))!;
    expect(next.basedOnRevision).toBe(8);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].reserveCaseCount).toBe(4);
    await expect(
      resolveSyncConflict(workspace, state.generation, draft.revision, {}),
    ).rejects.toThrow("changé");
  });

  it("lets a validated refusal be revised, but never retires an unknown outcome", async () => {
    await enabled();
    transport(() =>
      respond(
        { code: "INVALID_INVENTORY_COUNT", message: "Produit indisponible" },
        400,
      ),
    );
    await synchronizeInventory(workspace);
    const state = (await readInventorySync(workspace))!;
    expect(state.rejected).toBe(true);
    await reviseRejectedSync(workspace, state.generation);
    expect((await readInventorySync(workspace))?.inFlight).toBeNull();
    expect(await db.operations.count()).toBe(2);
    await expect(
      reviseRejectedSync(workspace, state.generation),
    ).rejects.toThrow();
  });

  it("validates timestamps, unique products and matching revision base", async () => {
    await enabled();
    const payload = (await prepareSyncOperation(workspace))!;
    expect(
      inventorySyncInputSchema.safeParse({ ...payload, basedOnRevision: 1 })
        .success,
    ).toBe(false);
    expect(
      inventorySyncInputSchema.safeParse({
        ...payload,
        lines: [...payload.lines, ...payload.lines],
      }).success,
    ).toBe(false);
    expect(
      inventorySyncInputSchema.safeParse({
        ...payload,
        lines: [{ ...payload.lines[0], observedAt: null }],
      }).success,
    ).toBe(false);
    expect(
      inventorySyncInputSchema.safeParse({
        ...payload,
        lines: [{ ...payload.lines[0], observedAt: "2020-01-01T00:00:00Z" }],
      }).success,
    ).toBe(false);
    expect(await db.sync.get(draftScope(workspace))).toBeDefined();
  });
});
