import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { preparedFixture } from "@/test/fixtures/offline";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  access: vi.fn(),
  apply: vi.fn(),
  current: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.authorize,
}));
vi.mock("@/server/services/offline-service", () => ({
  getOfflineAccess: mocks.access,
}));
vi.mock("@/server/db/mongo-client", () => ({
  getAppDb: async () => ({}),
  getMongoClient: async () => ({}),
}));
vi.mock("@/server/repositories/inventory-sync-repository", () => ({
  InventorySyncRepository: class {
    apply = mocks.apply;
    current = mocks.current;
  },
  InventorySyncConflict: class extends Error {},
}));
vi.mock("@/server/http/inventory-error-response", () => ({
  inventoryErrorResponse: ({ error }: { error: unknown }) =>
    new Response(null, {
      status: error instanceof StoreAccessDeniedError ? 404 : 400,
    }),
}));
import { GET, POST } from "@/app/api/stores/[storeId]/offline/sync/route";
const identity = preparedFixture().identity;
const context = {
  ...identity,
  role: "department_manager",
  permissions: ["inventory.write", "inventory.read"],
};
const route = { params: Promise.resolve({ storeId: identity.storeId }) };
function request(binding = identity.sessionBinding) {
  return new Request(
    `http://localhost/api/stores/${identity.storeId}/offline/sync?businessDate=2026-09-11`,
    { headers: { "x-fleg-session-binding": binding } },
  );
}

describe("TECH-03 endpoint authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(context);
    mocks.access.mockResolvedValue({ identity });
    mocks.current.mockResolvedValue(null);
  });
  it("requires inventory.write and the exact online session before reading conflicts", async () => {
    const req = request();
    const response = await GET(req, route);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.authorize).toHaveBeenCalledWith(
      identity.storeId,
      ["inventory.write"],
      req.headers,
    );
    expect(mocks.current).toHaveBeenCalledWith(context, "2026-09-11");
  });
  it("rejects revoked permissions and changed sessions for reads and writes", async () => {
    expect((await GET(request("b".repeat(64)), route)).status).toBe(404);
    expect((await POST(request("b".repeat(64)), route)).status).toBe(404);
    mocks.authorize.mockRejectedValue(new StoreAccessDeniedError());
    expect((await GET(request(), route)).status).toBe(404);
    expect((await POST(request(), route)).status).toBe(404);
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("rejects invalid input before any persistence", async () => {
    const req = new Request(request(), {
      method: "POST",
      body: JSON.stringify({ storeId: "forged" }),
      headers: {
        "Content-Type": "application/json",
        "x-fleg-session-binding": identity.sessionBinding,
      },
    });
    expect((await POST(req, route)).status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("bounds even a chunked oversized body and rejects malformed JSON", async () => {
    for (const body of ["{", JSON.stringify("x".repeat(1_048_577))]) {
      const req = new Request(request(), { method: "POST", body });
      expect((await POST(req, route)).status).toBe(400);
    }
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
