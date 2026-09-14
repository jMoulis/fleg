import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  factory: vi.fn(),
  get: vi.fn(),
  enqueue: vi.fn(),
  cancel: vi.fn(),
  batch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.context,
}));
vi.mock("@/server/services/document-processing-service", async (original) => ({
  ...(await original<
    typeof import("@/server/services/document-processing-service")
  >()),
  getDocumentProcessingRepository: mocks.factory,
  runDocumentProcessingBatch: mocks.batch,
}));
import {
  GET,
  POST,
  DELETE,
} from "@/app/api/stores/[storeId]/attachments/documents/[sourceId]/processing/route";
import { GET as cron } from "@/app/api/cron/document-processing/route";
import {
  documentProcessingAvailable,
  documentProcessingConfig,
} from "@/server/services/document-processing-service";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
const storeId = "a".repeat(24),
  sourceId = "b".repeat(24),
  secret = "synthetic-document-cron-secret-123456789";
const route = { params: Promise.resolve({ storeId, sourceId }) };
const request = (method = "GET", body = "{}", origin = "https://fleg.test") =>
  new Request(
    `https://fleg.test/api/stores/${storeId}/attachments/documents/${sourceId}/processing`,
    {
      method,
      ...(method === "GET" ? {} : { body }),
      headers: { origin, "content-type": "application/json" },
    },
  );
describe("document processing API and scheduled boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DOCUMENT_PROCESSING_ENABLED", "true");
    vi.stubEnv("DOCUMENT_PROCESSING_STORE_IDS", storeId);
    vi.stubEnv("CRON_SECRET", secret);
    mocks.context.mockResolvedValue({ storeId, userId: "manager" });
    mocks.factory.mockResolvedValue({
      get: mocks.get,
      enqueue: mocks.enqueue,
      cancel: mocks.cancel,
    });
    mocks.get.mockResolvedValue(null);
    mocks.enqueue.mockResolvedValue({ state: "queued" });
    mocks.cancel.mockResolvedValue({ state: "cancelled" });
    mocks.batch.mockResolvedValue({ processed: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("exposes only scoped UI admission and fails closed for invalid configuration", () => {
    expect(documentProcessingAvailable(storeId)).toBe(true);
    expect(documentProcessingAvailable("c".repeat(24))).toBe(false);
    vi.stubEnv("DOCUMENT_PROCESSING_STORE_IDS", "invalid-private-value");
    expect(documentProcessingAvailable(storeId)).toBe(false);
    vi.stubEnv("DOCUMENT_PROCESSING_ENABLED", "false");
    expect(documentProcessingAvailable(storeId)).toBe(false);
  });
  it("authorizes before accessing jobs and keeps private no-store responses", async () => {
    mocks.context.mockRejectedValueOnce(new StoreAccessDeniedError());
    expect((await GET(request(), route)).status).toBe(404);
    expect(mocks.factory).not.toHaveBeenCalled();
    const response = await GET(request(), route);
    expect(await response.json()).toMatchObject({ job: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.context).toHaveBeenCalledWith(
      storeId,
      ["stores.read"],
      expect.any(Headers),
    );
  });
  it("gates admission, rejects forged parameters and cross-origin mutations, but leaves reads/cancel available", async () => {
    vi.stubEnv("DOCUMENT_PROCESSING_ENABLED", "false");
    expect((await POST(request("POST"), route)).status).toBe(503);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect((await DELETE(request("DELETE"), route)).status).toBe(200);
    vi.stubEnv("DOCUMENT_PROCESSING_ENABLED", "true");
    expect(
      (
        await POST(
          request(
            "POST",
            JSON.stringify({ storeId: "foreign", source: "https://attacker" }),
          ),
          route,
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(request("POST", "{}", "https://attacker.test"), route))
        .status,
    ).toBe(404);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect((await POST(request("POST"), route)).status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ storeId }),
      sourceId,
    );
  });
  it("keeps cron inert by default and requires secret before any batch access", async () => {
    vi.stubEnv("DOCUMENT_PROCESSING_ENABLED", "false");
    expect(
      await (
        await cron(
          new Request("https://fleg.test/api/cron/document-processing"),
        )
      ).json(),
    ).toEqual({ status: "disabled" });
    vi.stubEnv("DOCUMENT_PROCESSING_ENABLED", "true");
    expect(
      (
        await cron(
          new Request("https://fleg.test/api/cron/document-processing"),
        )
      ).status,
    ).toBe(401);
    expect(mocks.batch).not.toHaveBeenCalled();
    const req = new Request(
      "https://fleg.test/api/cron/document-processing?storeId=foreign",
      { headers: { authorization: `Bearer ${secret}` } },
    );
    expect(await (await cron(req)).json()).toEqual({
      status: "ok",
      processed: 1,
    });
    expect(mocks.batch).toHaveBeenCalledWith([storeId]);
  });
  it("bounds service scope and sanitizes unexpected cron failures", async () => {
    expect(documentProcessingConfig({})).toBeNull();
    expect(() =>
      documentProcessingConfig({
        DOCUMENT_PROCESSING_ENABLED: "true",
        DOCUMENT_PROCESSING_STORE_IDS: Array(5).fill(storeId).join(","),
      }),
    ).toThrow();
    mocks.batch.mockRejectedValueOnce(Error("private-provider-url"));
    const response = await cron(
      new Request("https://fleg.test/api/cron/document-processing", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
