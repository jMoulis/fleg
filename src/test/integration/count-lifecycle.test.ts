import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { offlineDb as db } from "@/lib/offline/storage";
import {
  preparationEpoch,
  savePreparedWorkspace,
  forgetPreparedWorkspace,
} from "@/lib/offline/database";
import {
  readLocalDraft,
  saveLocalLine,
  startLocalDraft,
  discardLocalDraft,
} from "@/lib/offline/inventory-drafts";
import {
  readInventorySync,
  prepareSyncOperation,
  resolveSyncConflict,
} from "@/lib/offline/inventory-sync";
import {
  openUnifiedCount,
  prepareCountCommit,
  sendCountCommit,
  prepareCountCorrection,
  sendCountCorrection,
  readCountForReview,
  reopenRejectedCommit,
  observeCommittedConflict,
} from "@/lib/offline/count-lifecycle";
import { preparedFixture } from "@/test/fixtures/offline";
import { draftScope } from "@/domain/offline/inventory-draft";
import { inventoryCountSchema } from "@/domain/inventory/schemas";

const now = Date.parse("2026-09-11T07:00:00Z");
const copy = { ...preparedFixture(2), canWriteInventory: true };
const reference = {
  id: "f".repeat(24),
  version: 1,
  revision: 3,
  status: "draft" as const,
};
function count(status: "draft" | "committed" = "draft") {
  return inventoryCountSchema.parse({
    ...reference,
    organizationId: copy.identity.organizationId,
    storeId: copy.identity.storeId,
    businessDate: copy.businessDate,
    status,
    revision: status === "committed" ? 4 : 3,
    supersedesCountId: null,
    createdBy: copy.identity.userId,
    updatedBy: copy.identity.userId,
    createdAt: copy.preparedAt,
    updatedAt: new Date(now).toISOString(),
    committedBy: status === "committed" ? copy.identity.userId : null,
    committedAt: status === "committed" ? new Date(now).toISOString() : null,
    lines: [
      {
        productId: copy.products[0].id,
        familyCode: "3400",
        stockUnit: "kg",
        packSize: 18.5,
        reserveCaseCount: 2,
        shelfQuantity: 3.25,
        observedAt: copy.preparedAt,
      },
    ],
  });
}
const respond = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const commitResult = () => ({
  requestId: crypto.randomUUID(),
  result: {
    count: count("committed"),
    snapshots: [],
    changedSnapshotCount: 1,
    unchangedSnapshotCount: 0,
    configuredProfileCount: 1,
  },
});
async function preparedExisting() {
  const server = count();
  const workspace = {
    ...copy,
    countReference: reference,
    products: copy.products.map((p, i) => ({
      ...p,
      countLine: server.lines[i] ?? null,
    })),
  };
  await savePreparedWorkspace(workspace, await preparationEpoch());
  await openUnifiedCount(workspace, true, true);
  return workspace;
}
async function edit(workspace = copy, value = "7") {
  const draft = (await readLocalDraft(workspace))!;
  return saveLocalLine({
    workspace,
    draftId: draft.id,
    expectedRevision: draft.revision,
    line: {
      ...draft.lines[0],
      familyCode: "3400",
      stockUnit: "kg",
      packSize: "18.5",
      reserveCaseCount: value,
      shelfQuantity: "0",
      observedAt: new Date(now).toISOString(),
    },
  });
}
describe("UX-STOCK-02 durable lifecycle", () => {
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          fn: (lock: object) => Promise<void>,
        ) => fn({}),
      },
    });
    await forgetPreparedWorkspace();
    await db.drafts.clear();
    await db.operations.clear();
    await db.sync.clear();
    await savePreparedWorkspace(copy, await preparationEpoch());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("upgrades a legacy local draft in place without inferring consent or losing unfinished input", async () => {
    const old = await startLocalDraft(copy);
    const changed = await edit(copy, "1,");
    const operations = await db.operations.toArray();
    const reopened = await openUnifiedCount(copy);
    expect(reopened).toMatchObject({
      id: old.id,
      schemaVersion: 3,
      lifecycle: { phase: "editing" },
      lines: changed.lines,
    });
    expect(await readInventorySync(copy)).toBeNull();
    expect(await db.operations.toArray()).toEqual(operations);
    await openUnifiedCount(copy, false, true);
    expect(await readInventorySync(copy)).not.toBeNull();
  });
  it("starts a blank new day with explicit send consent, never copying last observed stock", async () => {
    const workspace = {
      ...copy,
      products: copy.products.map((p) => ({
        ...p,
        lastStock: {
          quantity: 99,
          unit: "kg" as const,
          observedAt: copy.preparedAt,
        },
      })),
    };
    await savePreparedWorkspace(workspace, await preparationEpoch());
    const draft = await openUnifiedCount(workspace, true, true);
    expect(draft?.lines[0].shelfQuantity).toBe("");
    expect(draft?.lines[0].reserveCaseCount).toBe("");
    expect(await prepareSyncOperation(workspace)).toBeNull();
  });
  it("locks an already upgraded local count when preparation reveals its committed server version without erasing edits", async () => {
    const workspace = await preparedExisting();
    await edit(workspace, "7,");
    const refreshed = {
      ...workspace,
      countReference: {
        ...reference,
        status: "committed" as const,
        revision: 4,
      },
    };
    await savePreparedWorkspace(refreshed, await preparationEpoch());
    const resumed = await openUnifiedCount(refreshed);
    expect(resumed?.lifecycle?.phase).toBe("server_committed");
    expect(resumed?.lines[0].reserveCaseCount).toBe("7,");
    expect((await readInventorySync(refreshed))?.pendingLines).toHaveLength(1);
    await expect(edit(refreshed)).rejects.toThrow("verrouillé");
  });
  it("refuses commitment while an edit or an uncertain upload remains pending", async () => {
    const workspace = await preparedExisting();
    const changed = await edit(workspace);
    await expect(
      prepareCountCommit(workspace, changed.revision, count()),
    ).rejects.toThrow();
    await prepareSyncOperation(workspace);
    await expect(
      prepareCountCommit(workspace, changed.revision, count()),
    ).rejects.toThrow();
    expect((await readLocalDraft(workspace))?.lifecycle?.phase).toBe("editing");
  });
  it("persists an immutable commit intent and replays its exact key after lost response and reopen", async () => {
    const workspace = await preparedExisting();
    const draft = (await readLocalDraft(workspace))!;
    await prepareCountCommit(workspace, draft.revision, count());
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce(respond(commitResult()));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendCountCommit(workspace)).rejects.toThrow();
    const pending = (await readLocalDraft(workspace))!;
    await expect(edit(workspace)).rejects.toThrow("verrouillé");
    await expect(
      discardLocalDraft(workspace, pending.id, pending.revision),
    ).rejects.toThrow();
    db.close();
    await db.open();
    await sendCountCommit(workspace);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[1][1].headers["x-fleg-session-binding"]).toBe(
      workspace.identity.sessionBinding,
    );
    expect((await readLocalDraft(workspace))?.lifecycle?.phase).toBe(
      "committed",
    );
    await expect(edit(workspace)).rejects.toThrow("verrouillé");
    expect(await prepareSyncOperation(workspace)).toBeNull();
  });
  it("only unfreezes a definitively refused validation after explicit recovery", async () => {
    const workspace = await preparedExisting();
    await prepareCountCommit(
      workspace,
      (await readLocalDraft(workspace))!.revision,
      count(),
    );
    await expect(reopenRejectedCommit(workspace)).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond({ message: "Révision modifiée" }, 409)),
    );
    await expect(sendCountCommit(workspace)).rejects.toThrow(
      "Révision modifiée",
    );
    await reopenRejectedCommit(workspace);
    expect((await readLocalDraft(workspace))?.lifecycle?.phase).toBe("editing");
  });
  it("does not acknowledge a foreign receipt or one arriving after sign-out", async () => {
    const workspace = await preparedExisting();
    await prepareCountCommit(
      workspace,
      (await readLocalDraft(workspace))!.revision,
      count(),
    );
    const foreign = commitResult();
    foreign.result.count.storeId = "a".repeat(24);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(foreign)));
    await expect(sendCountCommit(workspace)).rejects.toThrow("hors périmètre");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await forgetPreparedWorkspace();
        return respond(commitResult());
      }),
    );
    await expect(sendCountCommit(workspace)).rejects.toThrow("verrouillé");
    expect((await db.drafts.get(draftScope(workspace)))?.value).toMatchObject({
      lifecycle: { phase: "committing" },
    });
  });
  it("reviews server values, preserves the date and locks an already committed clean count", async () => {
    const workspace = await preparedExisting();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond({ count: count("committed") })),
    );
    await readCountForReview(workspace);
    expect((await readLocalDraft(workspace))?.lifecycle?.phase).toBe(
      "committed",
    );
    expect((await readLocalDraft(workspace))?.businessDate).toBe(
      copy.businessDate,
    );
  });
  it("does not let disposal of a committed copy revive a stale editable reference", async () => {
    const workspace = await preparedExisting();
    await prepareCountCommit(
      workspace,
      (await readLocalDraft(workspace))!.revision,
      count(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(respond(commitResult())),
    );
    await sendCountCommit(workspace);
    const committed = (await readLocalDraft(workspace))!;
    await expect(
      discardLocalDraft(workspace, committed.id, committed.revision),
    ).rejects.toThrow("Renouvelez le catalogue");
    const refreshed = {
      ...workspace,
      countReference: {
        ...reference,
        status: "committed" as const,
        revision: 4,
      },
    };
    await savePreparedWorkspace(refreshed, await preparationEpoch());
    await discardLocalDraft(refreshed, committed.id, committed.revision);
    expect(
      (await openUnifiedCount(refreshed, true, true))?.lifecycle?.phase,
    ).toBe("committed");
  });
  it("opens a correction with a durable retry key without rewriting the committed version", async () => {
    const workspace = {
      ...copy,
      countReference: {
        ...reference,
        status: "committed" as const,
        revision: 4,
      },
    };
    await savePreparedWorkspace(workspace, await preparationEpoch());
    await openUnifiedCount(workspace, true, true);
    await prepareCountCorrection(workspace);
    const corrected = {
      ...count(),
      id: "e".repeat(24),
      version: 2,
      revision: 0,
      supersedesCountId: reference.id,
    };
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce(
        respond({ count: corrected, requestId: crypto.randomUUID() }),
      )
      .mockResolvedValueOnce(respond({ count: corrected }));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendCountCorrection(workspace)).rejects.toThrow();
    db.close();
    await db.open();
    await sendCountCorrection(workspace);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(await readLocalDraft(workspace)).toMatchObject({
      serverCountId: corrected.id,
      lifecycle: { phase: "editing" },
    });
    expect((await readInventorySync(workspace))?.serverRevision).toBe(0);
    // The old prepared v1 reference must not relock a newly opened v2 correction.
    expect((await openUnifiedCount(workspace))?.lifecycle?.phase).toBe(
      "editing",
    );
  });
  it("preserves legacy edits against a committed server count and requires per-line comparison in its correction", async () => {
    await startLocalDraft(copy);
    const changed = await edit();
    const operations = await db.operations.toArray();
    await observeCommittedConflict(copy, count("committed"));
    await prepareCountCorrection(copy);
    const corrected = {
      ...count(),
      id: "e".repeat(24),
      version: 2,
      revision: 0,
      supersedesCountId: reference.id,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          respond({ count: corrected, requestId: crypto.randomUUID() }),
        ),
    );
    await sendCountCorrection(copy);
    expect((await readLocalDraft(copy))?.lines).toEqual(changed.lines);
    expect(await db.operations.toArray()).toEqual(operations);
    const sync = (await readInventorySync(copy))!;
    expect(sync.phase).toBe("conflict");
    await resolveSyncConflict(
      copy,
      sync.generation,
      (await readLocalDraft(copy))!.revision,
      { [copy.products[0].id]: "local" },
    );
    expect((await prepareSyncOperation(copy))?.baseCountId).toBe(corrected.id);
  });
  it("never unlocks a replayed correction that another device has already committed", async () => {
    await openUnifiedCount(copy, true, true);
    await observeCommittedConflict(copy, count("committed"));
    await prepareCountCorrection(copy);
    const created = {
      ...count(),
      id: "e".repeat(24),
      version: 2,
      revision: 0,
      supersedesCountId: reference.id,
    };
    const committed = {
      ...count("committed"),
      id: created.id,
      version: 2,
      supersedesCountId: reference.id,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respond({ count: created, requestId: crypto.randomUUID() }),
        )
        .mockResolvedValueOnce(respond({ count: committed })),
    );
    await sendCountCorrection(copy);
    expect((await readLocalDraft(copy))?.lifecycle).toMatchObject({
      phase: "server_committed",
      count: { version: 2 },
    });
    await expect(edit()).rejects.toThrow("verrouillé");
  });
  it("adds new catalogue articles during preparation without replacing existing unfinished values", async () => {
    await openUnifiedCount(copy, true, true);
    await edit(copy, "1,");
    const added = {
      ...copy.products[0],
      id: "c".repeat(24),
      label: "Nouvel article",
      countLine: null,
    };
    const refreshed = {
      ...copy,
      productCount: copy.productCount + 1,
      products: [...copy.products, added],
    };
    await savePreparedWorkspace(refreshed, await preparationEpoch());
    const draft = await openUnifiedCount(refreshed);
    expect(draft?.lines[0].reserveCaseCount).toBe("1,");
    expect(draft?.lines.at(-1)).toMatchObject({
      productId: added.id,
      reserveCaseCount: "",
      observedAt: null,
    });
  });
});
