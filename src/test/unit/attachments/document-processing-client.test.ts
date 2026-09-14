import { afterEach, describe, expect, it, vi } from "vitest";
import {
  processingDetail,
  processingLabels,
  requestDocumentProcessing,
} from "@/lib/attachments/document-processing";
import {
  processingJob,
  processingSource,
} from "@/test/helpers/document-processing-fixture";

const input = {
  storeId: "a".repeat(24),
  sourceId: processingSource.id,
  method: "GET" as const,
  signal: new AbortController().signal,
};
const response = (job: unknown) => new Response(JSON.stringify({ job }));
afterEach(() => vi.unstubAllGlobals());
describe("document processing controls contract", () => {
  it("uses only the no-store same-origin source endpoint and validates results", async () => {
    const job = processingJob();
    const fetcher = vi.fn().mockResolvedValue(response(job));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestDocumentProcessing(input)).toEqual(job);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/stores/${input.storeId}/attachments/documents/${input.sourceId}/processing`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      }),
    );
  });
  it("sends empty commands once, including cancellation without source deletion", async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(null));
    vi.stubGlobal("fetch", fetcher);
    for (const method of ["POST", "DELETE"] as const)
      await requestDocumentProcessing({ ...input, method });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.map(([, init]) => [init.method, init.body]),
    ).toEqual([
      ["POST", "{}"],
      ["DELETE", "{}"],
    ]);
    expect(
      fetcher.mock.calls.every(([url]) => url.endsWith("/processing")),
    ).toBe(true);
  });
  it("rejects foreign sources, malformed results and all failed HTTP responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ ...processingJob(), sourceId: "c".repeat(24) }),
      )
      .mockResolvedValueOnce(response({ state: "ready" }))
      .mockResolvedValueOnce(
        new Response("private backend message", { status: 404 }),
      );
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 3; i++)
      await expect(requestDocumentProcessing(input)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("drops expired text and does not retry an uncertain mutation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ ...processingJob(), expiresAt: "2020-01-01T00:00:00.000Z" }),
      )
      .mockRejectedValueOnce(new TypeError("Network interrupted"));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestDocumentProcessing(input)).toBeNull();
    await expect(
      requestDocumentProcessing({ ...input, method: "POST" }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("distinguishes technical extraction, temporary retry, terminal failure and cancellation", () => {
    const job = processingJob();
    expect(processingLabels.ready).toBe("Texte extrait");
    expect(processingDetail(job)).toContain("sans analyse IA");
    expect(processingDetail({ ...job, state: "queued", result: null })).toBe(
      "Demande enregistrée. Le traitement peut prendre quelques minutes. Vous pouvez quitter cette page.",
    );
    expect(processingDetail({ ...job, state: "running", result: null })).toBe(
      "Le traitement peut prendre quelques minutes. Vous pouvez quitter cette page.",
    );
    expect(
      processingDetail({ ...job, state: "queued", error: "temporary" }),
    ).toContain("reprise automatique");
    expect(
      processingDetail({ ...job, state: "failed", error: "budget_exhausted" }),
    ).toContain("maximal de tentatives");
    expect(
      processingDetail({ ...job, state: "failed", error: "invalid_pdf" }),
    ).toContain("limites dépassées");
    expect(
      processingDetail({ ...job, state: "cancelled", result: null }),
    ).toContain("PDF est conservé");
  });
});
