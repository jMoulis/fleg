import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { preparePhoto, sendPhoto } from "@/lib/attachments/private-upload";

const base = `/api/stores/${"a".repeat(24)}/attachments/upload-intents`;
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = new File([bytes], "rayon.png", { type: "image/png" });
const id = randomUUID();
const receipt = {
  id,
  state: "reserved",
  createdAt: new Date().toISOString(),
  reconcileAfter: new Date().toISOString(),
  uploadAvailable: false,
};
const upload = {
  method: "PUT",
  url: "https://vercel.com/api/blob/?signed=temporary",
  contentType: "image/png",
  headers: { "x-content-type": "image/png" },
  validUntil: new Date(Date.now() + 600000).toISOString(),
};
const json = (data: unknown) => new Response(JSON.stringify(data));
const input = () => ({
  base,
  file,
  target: { type: "store" as const },
  caption: "Rayon",
  idempotencyKey: randomUUID(),
  remember: vi.fn(),
  phase: vi.fn(),
  signal: new AbortController().signal,
});
afterEach(() => vi.unstubAllGlobals());

describe("connected private photo transport", () => {
  it("fingerprints original bytes and freezes fixture/version identity", async () => {
    const target = {
      type: "fixture" as const,
      layoutVersionId: "b".repeat(24),
      fixtureId: "island-face-a",
    };
    const metadata = await preparePhoto(
      file,
      target,
      " Vue matin ",
      randomUUID(),
    );
    expect(metadata).toMatchObject({
      kind: "photo",
      target,
      caption: "Vue matin",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    });
  });
  it("rejects oversized/empty photos before reading and refuses forged signatures", async () => {
    for (const invalid of [
      new File([], "empty.png"),
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png"),
    ]) {
      const read = vi.spyOn(invalid, "arrayBuffer");
      await expect(
        preparePhoto(invalid, { type: "store" }, "", randomUUID()),
      ).rejects.toThrow("4 Mio");
      expect(read).not.toHaveBeenCalled();
    }
    await expect(
      preparePhoto(
        new File(["forged"], "fake.png", { type: "image/png" }),
        { type: "store" },
        "",
        randomUUID(),
      ),
    ).rejects.toThrow("contenu");
  });
  it("persists recovery before PUT and verifies lost acknowledgements without a BSON fallback", async () => {
    const data = input();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ intent: receipt }))
      .mockImplementationOnce(async () => {
        expect(data.remember).toHaveBeenCalledWith(id);
        return json({ upload });
      })
      .mockRejectedValueOnce(new TypeError("private grant must not leak"))
      .mockResolvedValueOnce(json({ intent: { ...receipt, state: "linked" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendPhoto(data)).toMatchObject({ state: "linked" });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      base,
      `${base}/${id}/authorization`,
      upload.url,
      `${base}/${id}/verify`,
    ]);
    expect(fetcher.mock.calls[2]![1]).toMatchObject({
      method: "PUT",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "x-content-type": "image/png" },
    });
  });
  it("does not PUT when recovery storage fails or navigation aborts after authorization", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ intent: receipt }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      sendPhoto({
        ...input(),
        remember: () => {
          throw new Error("Storage blocked");
        },
      }),
    ).rejects.toThrow("Storage blocked");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    fetcher
      .mockReset()
      .mockResolvedValueOnce(json({ intent: receipt }))
      .mockImplementationOnce(async () => {
        controller.abort();
        return json({ upload });
      });
    await expect(
      sendPhoto({ ...input(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
