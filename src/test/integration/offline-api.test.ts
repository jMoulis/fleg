import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { preparedFixture } from "@/test/fixtures/offline";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  prepare: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.authorize,
}));
vi.mock("@/server/services/offline-service", () => ({
  prepareOfflineWorkspace: mocks.prepare,
  getOfflineAccess: mocks.access,
}));
vi.mock("@/server/http/inventory-error-response", () => ({
  inventoryErrorResponse: () => new Response(null, { status: 404 }),
}));
import { GET as prepare } from "@/app/api/stores/[storeId]/offline/route";
import { GET as access } from "@/app/api/stores/[storeId]/offline/access/route";

describe("offline APIs enforce server authorization", () => {
  const context: AuthorizedStoreContext = {
    ...preparedFixture().identity,
    role: "department_manager",
    permissions: ["inventory.read"],
  };
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes only authorized context and validated date to the service", async () => {
    mocks.authorize.mockResolvedValue(context);
    mocks.prepare.mockResolvedValue(preparedFixture());
    const request = new Request(
      `http://localhost/api/stores/${context.storeId}/offline?businessDate=2026-09-11&organizationId=forged`,
    );
    const result = await prepare(request, {
      params: Promise.resolve({ storeId: context.storeId }),
    });
    expect(result.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(
      context.storeId,
      ["inventory.read"],
      request.headers,
    );
    expect(mocks.prepare).toHaveBeenCalledWith({
      context,
      businessDate: "2026-09-11",
      headers: request.headers,
    });
  });

  it("does not read a workspace or expose an identity for a forbidden store", async () => {
    mocks.authorize.mockRejectedValue(new StoreAccessDeniedError());
    const request = new Request(
      "http://localhost/api/stores/66d000000000000000000002/offline?businessDate=2026-09-11",
    );
    const route = {
      params: Promise.resolve({ storeId: "66d000000000000000000002" }),
    };
    expect((await prepare(request, route)).status).toBe(404);
    expect((await access(request, route)).status).toBe(404);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
