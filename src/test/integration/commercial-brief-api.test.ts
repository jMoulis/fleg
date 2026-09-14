import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  get: vi.fn(),
  enqueue: vi.fn(),
  review: vi.fn(),
  native: vi.fn(),
  matches: vi.fn(),
  batch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.context,
}));
vi.mock("@/server/services/document-processing-service", () => ({
  getDocumentProcessingRepository: async () => ({ get: mocks.native }),
}));
vi.mock("@/server/services/commercial-brief-service", async (original) => ({
  ...(await original<
    typeof import("@/server/services/commercial-brief-service")
  >()),
  getCommercialBriefRepository: async () => ({
    get: mocks.get,
    enqueue: mocks.enqueue,
    review: mocks.review,
    matches: mocks.matches,
  }),
  runCommercialBriefBatch: mocks.batch,
}));
import {
  GET,
  POST,
} from "@/app/api/stores/[storeId]/attachments/documents/[sourceId]/brief/route";
import { GET as cron } from "@/app/api/cron/commercial-briefs/route";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
const storeId = "a".repeat(24),
  sourceId = "b".repeat(24);
const route = { params: Promise.resolve({ storeId, sourceId }) };
const request = (body?: unknown, origin = "https://fleg.test") =>
  new Request(
    `https://fleg.test/api/stores/${storeId}/attachments/documents/${sourceId}/brief`,
    {
      method: body ? "POST" : "GET",
      headers: { origin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    storeId,
    organizationId: "org",
    userId: "user",
    permissions: [
      "stores.read",
      "imports.create",
      "imports.commit",
      "attachments.write",
    ],
  });
  mocks.get.mockResolvedValue(null);
  mocks.native.mockResolvedValue(null);
  mocks.matches.mockResolvedValue([]);
  mocks.enqueue.mockResolvedValue(null);
  mocks.review.mockResolvedValue(null);
  vi.stubEnv("COMMERCIAL_BRIEF_ENABLED", "true");
  vi.stubEnv("COMMERCIAL_BRIEF_STORE_IDS", storeId);
  vi.stubEnv("COMMERCIAL_BRIEF_MODEL", "synthetic-test-only");
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  vi.stubEnv("COMMERCIAL_BRIEF_INPUT_USD_CENTS_PER_MILLION", "25");
  vi.stubEnv("COMMERCIAL_BRIEF_OUTPUT_USD_CENTS_PER_MILLION", "200");
  vi.stubEnv("COMMERCIAL_BRIEF_DAILY_BUDGET_USD_CENTS", "100");
});
afterEach(() => vi.unstubAllEnvs());
describe("commercial brief API boundaries", () => {
  it("requires authorization before reads and returns no-store", async () => {
    mocks.context.mockRejectedValueOnce(new StoreAccessDeniedError());
    expect((await GET(request(), route)).status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
    const response = await GET(request(), route);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      brief: null,
      available: true,
    });
    expect(mocks.get).toHaveBeenCalledWith(
      expect.objectContaining({ storeId }),
      sourceId,
    );
  });
  it("requires explicit page consent, denies forged scope and cross-site requests", async () => {
    for (const body of [
      { action: "analyze", pages: [1] },
      { action: "analyze", pages: [1], consent: false },
      { action: "analyze", pages: [1], consent: true, storeId: "foreign" },
      { action: "analyze", pages: [1], consent: true, model: "expensive" },
    ]) {
      expect((await POST(request(body), route)).status).toBe(400);
    }
    expect(
      (
        await POST(
          request(
            { action: "analyze", pages: [1], consent: true },
            "https://attacker.test",
          ),
          route,
        )
      ).status,
    ).toBe(404);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({ action: "analyze", pages: [1], consent: true }),
          route,
        )
      ).status,
    ).toBe(200);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ storeId }),
      sourceId,
      [1],
      expect.objectContaining({ model: "synthetic-test-only" }),
    );
  });
  it("gates new analysis but leaves read and review available", async () => {
    vi.stubEnv("COMMERCIAL_BRIEF_ENABLED", "false");
    expect(
      (
        await POST(
          request({ action: "analyze", pages: [1], consent: true }),
          route,
        )
      ).status,
    ).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect((await GET(request(), route)).status).toBe(200);
    expect(
      (
        await POST(
          request({
            action: "review",
            review: {
              expectedRevision: 0,
              section: 0,
              decision: "excluded",
              values: [],
            },
          }),
          route,
        )
      ).status,
    ).toBe(200);
    expect(mocks.review).toHaveBeenCalledTimes(1);
  });
  it("does not leak provider errors", async () => {
    mocks.get.mockRejectedValueOnce(new Error("secret text private pdf"));
    const response = await GET(request(), route);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret text");
  });
  it("authenticates scheduled work and ignores query scope", async () => {
    vi.stubEnv("CRON_SECRET", "synthetic-brief-cron-secret-123456789");
    expect(
      (await cron(new Request("https://fleg.test/api/cron/commercial-briefs")))
        .status,
    ).toBe(401);
    expect(mocks.batch).not.toHaveBeenCalled();
    mocks.batch.mockResolvedValue({ processed: 1 });
    const response = await cron(
      new Request(
        "https://fleg.test/api/cron/commercial-briefs?storeId=attacker",
        {
          headers: {
            authorization: "Bearer synthetic-brief-cron-secret-123456789",
          },
        },
      ),
    );
    expect(await response.json()).toEqual({ status: "ok", processed: 1 });
    expect(mocks.batch).toHaveBeenCalledWith();
  });
});
