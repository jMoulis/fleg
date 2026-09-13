import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  prepareDocument,
  documentVerificationMessage,
  sendDocument,
  recoverDocumentUpload,
} from "@/lib/attachments/private-upload";

const id = randomUUID();
const base = `/api/stores/${"a".repeat(24)}/attachments/upload-intents`;
const file = new File(["%PDF-test"], "brief.pdf", { type: "application/pdf" });
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
  contentType: "application/pdf",
  headers: { "x-content-type": "application/pdf" },
  validUntil: new Date(Date.now() + 600000).toISOString(),
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
const input = () => ({
  base,
  file,
  caption: "Promo",
  idempotencyKey: randomUUID(),
  remember: vi.fn(),
  phase: vi.fn(),
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("connected document upload client", () => {
  it("distinguishes a received PDF with an unavailable validator from an unknown receipt", () => {
    const intent = { ...receipt, state: "reserved" as const };
    expect(documentVerificationMessage(intent)).toContain(
      "Confirmation de réception en cours",
    );
    expect(documentVerificationMessage(intent)).not.toContain("PDF reçu");
    const message = documentVerificationMessage({
      ...intent,
      verificationIssue: "pdf_validator_unavailable",
    });
    expect(message).toContain("PDF reçu");
    expect(message).toContain("validation temporairement indisponible");
    expect(message).toContain("Vérification à reprendre");
    expect(message).toContain("Aucun nouvel envoi nécessaire");
    expect(
      documentVerificationMessage(
        { ...intent, receivedAt: intent.createdAt },
        true,
      ),
    ).toContain("Reprise automatique");
  });
  it("validates PDF type/size before reading bytes and calculates a bounded SHA-256", async () => {
    const metadata = await prepareDocument(file, "  Promo  ", randomUUID());
    expect(metadata).toMatchObject({
      kind: "document",
      target: { type: "store" },
      caption: "Promo",
      sizeBytes: 9,
    });
    expect(metadata.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const invalid of [
      new File([], "empty.pdf"),
      new File(["x"], "other.png"),
      new File(["x"], "wrong.pdf", { type: "image/png" }),
      new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.pdf"),
    ]) {
      const read = vi.spyOn(invalid, "arrayBuffer");
      await expect(prepareDocument(invalid, "", randomUUID())).rejects.toThrow(
        "25 Mo",
      );
      expect(read).not.toHaveBeenCalled();
    }
  });
  it("persists recovery before authorization and PUT; sends x-content-type without cookies or redirects", async () => {
    const data = input();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ intent: receipt }))
      .mockImplementationOnce(async () => {
        expect(data.remember).toHaveBeenCalledWith(id);
        return json({ upload });
      })
      .mockResolvedValueOnce(new Response())
      .mockResolvedValueOnce(json({ intent: { ...receipt, state: "linked" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendDocument(data)).toMatchObject({ state: "linked" });
    expect(fetcher.mock.calls[2]![1]).toMatchObject({
      method: "PUT",
      headers: { "x-content-type": "application/pdf" },
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(fetcher.mock.calls[2]![1].body.type).toBe("");
    expect(fetcher.mock.calls[3]![0]).toBe(`${base}/${id}/verify`);
  });
  it("verifies a lost PUT acknowledgement without a second PUT", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ intent: receipt }))
      .mockResolvedValueOnce(json({ upload }))
      .mockRejectedValueOnce(new TypeError("signed URL must not leak"))
      .mockResolvedValueOnce(json({ intent: { ...receipt, state: "linked" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await sendDocument(input())).toMatchObject({ state: "linked" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("never uploads without durable recovery storage or with a foreign provider URL/MIME", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (_path, options) =>
        options.body.includes("idempotencyKey")
          ? json({ intent: receipt })
          : json({ upload: { ...upload, url: "https://other.test/api/blob" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      sendDocument({
        ...input(),
        remember: () => {
          throw new Error("Storage blocked");
        },
      }),
    ).rejects.toThrow("Storage blocked");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(sendDocument(input())).rejects.toThrow("Autorisation");
    expect(fetcher.mock.calls.every((call) => call[1].method === "POST")).toBe(
      true,
    );
  });
  it("returns existing linked/rejected receipts without issuing another authorization", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        json({ intent: { ...receipt, state: "linked" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await sendDocument(input())).toMatchObject({ state: "linked" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("recovers only the same verification endpoint, respecting delays and stopping when linked", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          intent: {
            ...receipt,
            reconcileAfter: new Date(Date.now() + 2000).toISOString(),
          },
        }),
      )
      .mockResolvedValueOnce(json({ intent: { ...receipt, state: "linked" } }));
    vi.stubGlobal("fetch", fetcher);
    const progress = vi.fn();
    const promise = recoverDocumentUpload({
      base,
      id,
      onProgress: progress,
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toMatchObject({ state: "linked" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([path]) => path === `${base}/${id}/verify`),
    ).toBe(true);
    expect(progress).toHaveBeenCalledTimes(1);
  });
  it("bounds automatic checks and keeps the intent available for manual recovery", async () => {
    vi.useFakeTimers();
    const pending = {
      ...receipt,
      state: "uploaded" as const,
      reconcileAfter: new Date().toISOString(),
    };
    const fetcher = vi.fn(async () => json({ intent: pending }));
    vi.stubGlobal("fetch", fetcher);
    const promise = recoverDocumentUpload({
      base,
      id,
      initial: pending,
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(30000);
    expect(await promise).toMatchObject({ id, state: "uploaded" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    fetcher.mockClear();
    expect(
      await recoverDocumentUpload({
        base,
        id,
        initial: {
          ...pending,
          reconcileAfter: new Date(Date.now() + 300000).toISOString(),
        },
        onProgress: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ id });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels pending verification on navigation without another request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const promise = recoverDocumentUpload({
      base,
      id,
      initial: {
        ...receipt,
        state: "reserved",
        reconcileAfter: new Date(Date.now() + 5000).toISOString(),
      },
      onProgress: vi.fn(),
      signal: controller.signal,
    });
    const rejected = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
