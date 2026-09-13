import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineDb as db } from "@/lib/offline/storage";
import {
  forgetPreparedWorkspace,
  preparationEpoch,
} from "@/lib/offline/database";
import {
  enqueuePhoto,
  listLocalPhotos,
  savePhotoPreparation,
  claimPhoto,
  updateClaim,
  discardUnsentPhoto,
  exportLocalPhoto,
} from "@/lib/attachments/photo-queue-storage";
import { syncLocalPhoto } from "@/lib/attachments/photo-queue-sync";
import {
  photoQueuePolicy,
  type PreparedPhotos,
} from "@/domain/attachments/photo-queue";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = new File([png], "rayon.png", { type: "image/png" });
function preparation(
  userId = "manager",
  storeId = "a".repeat(24),
): PreparedPhotos {
  return {
    schemaVersion: 1,
    storeName: "Magasin de test",
    identity: {
      userId,
      organizationId: "org",
      storeId,
      sessionBinding: "b".repeat(64),
    },
    preparedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    targets: [
      {
        target: {
          type: "fixture",
          layoutVersionId: "c".repeat(24),
          fixtureId: "face-a",
        },
        label: "Face A · version 1",
      },
    ],
  };
}
const enqueue = (p: PreparedPhotos, photo = file) =>
  enqueuePhoto({
    preparation: p,
    file: photo,
    target: p.targets[0]!.target,
    caption: "Rayon",
  });
const save = async (p: PreparedPhotos) =>
  savePhotoPreparation(p, await preparationEpoch());
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(async () => {
  await forgetPreparedWorkspace();
  await db.photos.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("consented local photo queue", () => {
  it("upgrades IndexedDB v3 without deleting stock drafts, operations or sync receipts", async () => {
    db.close();
    await Dexie.delete(db.name); // fake-indexeddb only, never a browser/device database.
    const previous = new Dexie(db.name);
    previous.version(3).stores({
      copies: "key",
      meta: "key",
      drafts: "key",
      operations: "key,draftId",
      sync: "key",
    });
    await previous.open();
    for (const name of ["drafts", "operations", "sync"])
      await previous
        .table(name)
        .put({ key: "preserved", value: { schemaVersion: 3, sentinel: true } });
    previous.close();
    await db.open();
    expect(await db.photos.count()).toBe(0);
    for (const name of ["drafts", "operations", "sync"])
      expect((await db.table(name).get("preserved")).value).toEqual({
        schemaVersion: 3,
        sentinel: true,
      });
  });
  it("expires inventory references independently without revoking photo preparation", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    await forgetPreparedWorkspace("inventory");
    expect((await listLocalPhotos(p))[0]?.id).toBe(row.id);
  });
  it("requires preparation/consent, freezes target/version and commits original bytes together", async () => {
    const p = preparation();
    await expect(enqueue(p)).rejects.toThrow("Préparation");
    await save(p);
    const row = await enqueue(p);
    expect((await listLocalPhotos(p))[0]).toMatchObject({
      id: row.id,
      metadata: { target: p.targets[0]!.target },
      phase: "queued",
    });
    expect(
      Buffer.from(
        await (await exportLocalPhoto(p, row.id)).bytes.arrayBuffer(),
      ),
    ).toEqual(Buffer.from(png));
    expect(JSON.stringify((await db.photos.get(row.id))?.value)).not.toMatch(
      /token|https:|base64/,
    );
    await expect(
      enqueuePhoto({
        preparation: p,
        file,
        target: { type: "store" },
        caption: "",
      }),
    ).rejects.toThrow("Préparez cette cible");
  });
  it("serializes origin-wide quotas across simultaneous enqueue operations and owners without eviction", async () => {
    const a = preparation();
    await save(a);
    await Promise.all(Array.from({ length: 9 }, () => enqueue(a)));
    const b = preparation("other");
    await save(b);
    const results = await Promise.allSettled([enqueue(b), enqueue(b)]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(await db.photos.count()).toBe(10);
    expect(await listLocalPhotos(b)).toHaveLength(1);
    await save(a);
    expect(await listLocalPhotos(a)).toHaveLength(9);
  });
  it("preserves durable photos and inventory drafts on session change, expiry and incompatible reference", async () => {
    const a = preparation();
    await save(a);
    const row = await enqueue(a);
    await db.drafts.put({ key: "untouched-test", value: { sentinel: true } });
    const epoch = await preparationEpoch();
    await forgetPreparedWorkspace();
    await expect(savePhotoPreparation(a, epoch)).rejects.toThrow("Session");
    await expect(listLocalPhotos(a)).rejects.toThrow("Préparation");
    expect(await db.photos.count()).toBe(1);
    const b = preparation("other", "d".repeat(24));
    await save(b);
    expect(await listLocalPhotos(b)).toEqual([]);
    await expect(claimPhoto(b, row.id)).rejects.toThrow("introuvable");
    await expect(exportLocalPhoto(b, row.id)).rejects.toThrow("introuvable");
    await expect(discardUnsentPhoto(b, row.id)).rejects.toThrow("introuvable");
    await forgetPreparedWorkspace();
    await save({
      ...a,
      identity: { ...a.identity, sessionBinding: "e".repeat(64) },
    });
    const renewed = {
      ...a,
      identity: { ...a.identity, sessionBinding: "e".repeat(64) },
    };
    expect(await listLocalPhotos(renewed)).toHaveLength(1);
    await db.copies.put({
      key: "photos",
      value: { ...renewed, expiresAt: new Date(Date.now() - 1).toISOString() },
    });
    await expect(listLocalPhotos(renewed)).rejects.toThrow("expirée");
    expect((await db.drafts.get("untouched-test"))?.value).toEqual({
      sentinel: true,
    });
    expect(await db.photos.count()).toBe(1);
  });
  it("does not announce/persist a partial photo after a storage write failure", async () => {
    const p = preparation();
    await save(p);
    vi.spyOn(db.photos, "add").mockRejectedValueOnce(
      new DOMException("full", "QuotaExceededError"),
    );
    await expect(enqueue(p)).rejects.toThrow("full");
    expect(await db.photos.count()).toBe(0);
  });
  it("leases across tabs and makes abandoned in-flight work verification-only", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    const claims = await Promise.all([
      claimPhoto(p, row.id),
      claimPhoto(p, row.id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const old = claims.find(Boolean)!;
    expect(old.firstSend).toBe(true);
    await updateClaim(p, old.value, (v) => ({
      ...v,
      lease: { ...v.lease!, until: Date.now() - 1 },
    }));
    const next = await claimPhoto(p, row.id);
    expect(next?.firstSend).toBe(false);
    await expect(updateClaim(p, old.value, () => null)).rejects.toThrow(
      "autre onglet",
    );
    await expect(discardUnsentPhoto(p, row.id)).rejects.toThrow(
      "envoi a commencé",
    );
  });
  it("checks the 4 MiB original size before storage and rejects unknown local record versions", async () => {
    const p = preparation();
    await save(p);
    await expect(
      enqueue(p, new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png")),
    ).rejects.toThrow("4 Mio");
    const row = await enqueue(p);
    const stored = (await db.photos.get(row.id))!;
    await db.photos.put({ ...stored, value: { ...row, schemaVersion: 99 } });
    await expect(listLocalPhotos(p)).rejects.toThrow();
    expect(await db.photos.count()).toBe(1);
  });
});

describe("bounded photo recovery", () => {
  it("does not discard a local photo for another intent's linked receipt", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    const claim = (await claimPhoto(p, row.id))!;
    await updateClaim(p, claim.value, (v) => ({
      ...v,
      lease: null,
      intentId: crypto.randomUUID(),
    }));
    transport(p).setState("linked");
    await expect(
      syncLocalPhoto({
        preparation: p,
        id: row.id,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("hors périmètre");
    expect(await db.photos.count()).toBe(1);
  });
  const intentId = "8b288c1c-9a78-4a8e-8f5e-ea08b7f6e7d5";
  function transport(p: PreparedPhotos) {
    let state = "uploaded";
    const receipt = () => ({
      id: intentId,
      state,
      createdAt: new Date().toISOString(),
      reconcileAfter: new Date().toISOString(),
      uploadAvailable: true,
    });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/offline"))
        return json({ ...p.identity, uploadsAvailable: true });
      if (url.startsWith("https://vercel.com"))
        throw new TypeError("lost provider ACK");
      expect(new Headers(init?.headers).get("x-fleg-photo-owner")).toBe(
        JSON.stringify(p.identity),
      );
      if (url.endsWith("/authorization"))
        return json({
          upload: {
            method: "PUT",
            url: "https://vercel.com/api/blob/?signed=temporary",
            contentType: "image/png",
            headers: { "x-content-type": "image/png" },
            validUntil: new Date(Date.now() + 60000).toISOString(),
          },
        });
      if (url.endsWith("/cancel")) state = "cancelled";
      return json({
        intent: {
          ...receipt(),
          ...(url.endsWith("/upload-intents") ? { state: "reserved" } : {}),
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    return {
      fetcher,
      setState: (value: string) => {
        state = value;
      },
    };
  }
  it("retains bytes on lost ACK, verifies before retry, then deletes only after durable linkage", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    const mock = transport(p);
    const input = {
      preparation: p,
      id: row.id,
      signal: new AbortController().signal,
    };
    await syncLocalPhoto(input);
    expect((await listLocalPhotos(p))[0]).toMatchObject({
      phase: "checking",
      intentId,
    });
    mock.setState("linked");
    await syncLocalPhoto({ ...input, manual: true });
    expect(await listLocalPhotos(p)).toHaveLength(0);
    expect(
      mock.fetcher.mock.calls.filter(([url]) =>
        url.startsWith("https://vercel.com"),
      ),
    ).toHaveLength(1);
  });
  it("replays a lost reservation using the frozen key but never reissues a PUT", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    const claim = (await claimPhoto(p, row.id))!;
    await updateClaim(p, claim.value, (v) => ({ ...v, lease: null }));
    const mock = transport(p);
    await syncLocalPhoto({
      preparation: p,
      id: row.id,
      signal: new AbortController().signal,
    });
    expect(
      mock.fetcher.mock.calls.some(
        ([url]) => url.includes("/authorization") || url.startsWith("https://"),
      ),
    ).toBe(false);
    const replay = mock.fetcher.mock.calls.find(([url]) =>
      url.endsWith("/upload-intents"),
    )!;
    expect(JSON.parse(replay[1]!.body as string)).toEqual(row.metadata);
  });
  it("blocks account changes/revocation without a reservation, and retains all bytes", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    for (const response of [
      json({ ...p.identity, userId: "other", uploadsAvailable: true }),
      json({}, 404),
    ]) {
      const fetcher = vi.fn().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetcher);
      await expect(
        syncLocalPhoto({
          preparation: p,
          id: row.id,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("Session");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await db.photos.count()).toBe(1);
    }
  });
  it("never silently deletes rejected/cancelled photos and requires explicit discard", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    const mock = transport(p);
    mock.setState("rejected");
    const input = {
      preparation: p,
      id: row.id,
      signal: new AbortController().signal,
    };
    await syncLocalPhoto(input);
    expect((await listLocalPhotos(p))[0]?.phase).toBe("attention");
    await syncLocalPhoto({ ...input, discard: true });
    expect(await db.photos.count()).toBe(0);
  });
  it("stops automatic retries at the configured limit without dropping local bytes", async () => {
    const p = preparation();
    await save(p);
    const row = await enqueue(p);
    const claim = (await claimPhoto(p, row.id))!;
    await updateClaim(p, claim.value, (v) => ({
      ...v,
      attempts: photoQueuePolicy.maxAttempts,
      lease: null,
    }));
    expect(await claimPhoto(p, row.id)).toBeNull();
    expect(await claimPhoto(p, row.id, true)).not.toBeNull();
    expect(await db.photos.count()).toBe(1);
  });
});
