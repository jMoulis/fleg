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
  localDraftDates,
  readLocalDraft,
  saveLocalLine,
  saveLocalView,
  startLocalDraft,
} from "@/lib/offline/inventory-drafts";
import { preparedFixture } from "@/test/fixtures/offline";
import {
  draftScope,
  localOperationSchema,
} from "@/domain/offline/inventory-draft";

const now = Date.parse("2026-09-11T07:00:00Z");
const copy = () => ({ ...preparedFixture(2), canWriteInventory: true });
async function prepare(workspace = copy()) {
  await savePreparedWorkspace(workspace, await preparationEpoch());
  return workspace;
}

describe("durable local counts (no server transport)", () => {
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    await forgetPreparedWorkspace();
    await db.drafts.clear();
    await db.operations.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("upgrades the TECH-01 database without deleting its prepared catalogue", async () => {
    await db.delete(); // This test runs exclusively against fake-indexeddb.
    const legacy = new Dexie(db.name);
    legacy.version(1).stores({ copies: "key", meta: "key" });
    await legacy.table("copies").put({ key: "current", value: copy() });
    legacy.close();
    await db.open();
    const draft = await startLocalDraft(copy());
    expect((await db.copies.get("current"))?.value).toEqual(copy());
    expect((await readLocalDraft(copy()))?.id).toBe(draft.id);
    // Dexie 4 retries a lower native version without specifying a version.
    // A TECH-01 reader can still invalidate its reference, but not the draft.
    await legacy.open();
    await legacy.table("copies").clear();
    legacy.close();
    expect(await db.drafts.count()).toBe(1);
    await prepare();
    expect((await readLocalDraft(copy()))?.id).toBe(draft.id);
  });

  it("rejects an unknown draft schema without replacing or deleting it", async () => {
    const workspace = await prepare();
    const draft = await startLocalDraft(workspace);
    const incompatible = { ...draft, schemaVersion: 99 };
    await db.drafts.put({ key: draftScope(workspace), value: incompatible });
    await expect(readLocalDraft(workspace)).rejects.toThrow();
    await expect(startLocalDraft(workspace)).rejects.toThrow();
    expect((await db.drafts.get(draftScope(workspace)))?.value).toEqual(
      incompatible,
    );
  });

  it("atomically saves raw edits and bounded pending operations; survives database reopen", async () => {
    const workspace = await prepare();
    let draft = await startLocalDraft(workspace);
    const id = draft.id;
    for (const shelfQuantity of ["", "0", "1,", "2,5"]) {
      draft = await saveLocalLine({
        workspace,
        draftId: id,
        expectedRevision: draft.revision,
        line: {
          ...draft.lines[0],
          shelfQuantity,
          packSize: "18,5",
          observedAt: new Date(now).toISOString(),
        },
      });
    }
    draft = await saveLocalView({
      workspace,
      draftId: id,
      expectedRevision: draft.revision,
      view: {
        ...draft.view,
        search: "Article",
        area: "shelf",
        progress: "remaining",
        family: "3400",
        page: 2,
      },
    });
    db.close();
    await db.open();
    expect(await readLocalDraft(workspace)).toEqual(draft);
    const operations = (
      await db.operations.where("draftId").equals(id).toArray()
    ).map((row) => localOperationSchema.parse(row.value));
    expect(operations).toHaveLength(2); // start + latest unsent edit, not one full catalogue per keypress
    expect(operations.find((op) => op.kind === "line")?.line).toMatchObject({
      shelfQuantity: "2,5",
      packSize: "18,5",
    });
  });

  it("locks after logout and restores only to the same owner with a fresh authorized copy", async () => {
    const workspace = await prepare();
    const draft = await startLocalDraft(workspace);
    await forgetPreparedWorkspace();
    await expect(readLocalDraft(workspace)).rejects.toThrow();
    expect(await db.drafts.count()).toBe(1);
    const foreign = await prepare({
      ...workspace,
      identity: { ...workspace.identity, userId: "another-user" },
    });
    expect(await readLocalDraft(foreign)).toBeNull();
    expect(await localDraftDates(foreign)).toEqual([]);
    await expect(
      discardLocalDraft(foreign, draft.id, draft.revision),
    ).rejects.toThrow();
    const relogged = await prepare({
      ...workspace,
      identity: { ...workspace.identity, sessionBinding: "b".repeat(64) },
    });
    expect((await readLocalDraft(relogged))?.id).toBe(draft.id);
    await expect(startLocalDraft(workspace)).rejects.toThrow();
  });

  it("does not refresh newer local work with stale catalogue/count data and rejects concurrent overwrites", async () => {
    const workspace = await prepare();
    const draft = await startLocalDraft(workspace);
    const line = {
      ...draft.lines[0],
      packSize: "18,5",
      reserveCaseCount: "2",
      observedAt: new Date(now).toISOString(),
    };
    const saved = await saveLocalLine({
      workspace,
      draftId: draft.id,
      expectedRevision: 0,
      line,
    });
    await expect(
      saveLocalLine({
        workspace,
        draftId: draft.id,
        expectedRevision: 0,
        line: { ...line, reserveCaseCount: "99" },
      }),
    ).rejects.toThrow("Conflit local");
    workspace.products[0].profile = {
      familyCode: "3402",
      stockUnit: "piece",
      lastPackSize: 99,
      revision: 10,
    };
    workspace.dataRevision = 100;
    await prepare(workspace);
    expect(await startLocalDraft(workspace)).toEqual(saved);
    await expect(
      saveLocalLine(
        { workspace, draftId: draft.id, expectedRevision: 1, line },
        now - 1,
      ),
    ).rejects.toThrow("Horloge");
  });

  it("rolls back BOTH the draft and operation when the second write fails", async () => {
    const workspace = await prepare();
    const draft = await startLocalDraft(workspace);
    const rejectWrite = () => {
      throw new DOMException("No space", "QuotaExceededError");
    };
    db.drafts.hook("updating", rejectWrite);
    try {
      await expect(
        saveLocalLine({
          workspace,
          draftId: draft.id,
          expectedRevision: 0,
          line: {
            ...draft.lines[0],
            reserveCaseCount: "3",
            observedAt: new Date(now).toISOString(),
          },
        }),
      ).rejects.toThrow("No space");
    } finally {
      db.drafts.hook("updating").unsubscribe(rejectWrite);
    }
    expect(await readLocalDraft(workspace)).toEqual(draft);
    expect(await db.operations.where("draftId").equals(draft.id).count()).toBe(
      1,
    );
  });

  it("isolates dates/stores, refuses viewers and expiry, and only explicitly deletes the scoped draft", async () => {
    const workspace = await prepare();
    const draft = await startLocalDraft(workspace);
    const tomorrow = await prepare({
      ...workspace,
      businessDate: "2026-09-12",
    });
    const next = await startLocalDraft(tomorrow);
    expect(next.id).not.toBe(draft.id);
    await prepare({ ...workspace, canWriteInventory: false });
    await expect(startLocalDraft(workspace)).rejects.toThrow("verrouillé");
    await prepare(workspace);
    await expect(
      readLocalDraft(workspace, Date.parse(workspace.expiresAt)),
    ).rejects.toThrow("verrouillé");
    await discardLocalDraft(workspace, draft.id, draft.revision);
    expect(await db.drafts.get(draftScope(workspace))).toBeUndefined();
    expect(await db.operations.where("draftId").equals(draft.id).count()).toBe(
      0,
    );
    expect(await db.drafts.get(draftScope(tomorrow))).toBeDefined();
    const foreignStore = await prepare({
      ...workspace,
      identity: { ...workspace.identity, storeId: "f".repeat(24) },
    });
    expect(await readLocalDraft(foreignStore)).toBeNull();
  });

  it("bounds the number of drafts without evicting existing work", async () => {
    const workspace = await prepare({ ...copy(), maxLocalDrafts: 1 });
    const draft = await startLocalDraft(workspace);
    const tomorrow = await prepare({
      ...workspace,
      businessDate: "2026-09-12",
    });
    await expect(startLocalDraft(tomorrow)).rejects.toThrow("Limite");
    await prepare(workspace);
    expect((await readLocalDraft(workspace))?.id).toBe(draft.id);
  });
});
