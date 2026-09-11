import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  metadata: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.authorize,
}));
vi.mock("@/server/db/mongo-client", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/server/repositories/store-repository", () => ({
  StoreRepository: class {
    getOfflineReferenceMetadata = mocks.metadata;
  },
}));
import InventoryPage from "@/app/(app)/[organizationSlug]/stores/[storeId]/inventory/page";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
const context = { storeId: "a".repeat(24), permissions: ["inventory.read"] };
const params = Promise.resolve({
  storeId: "b".repeat(24),
  organizationSlug: "demo",
});
describe("authorized unified stock entry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(context);
    mocks.metadata.mockResolvedValue({ timeZone: "Europe/Paris" });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-11T22:30:00Z"));
  });
  it("uses the authorized store and its local day, not a UTC date or route authority", async () => {
    await InventoryPage({ params, searchParams: Promise.resolve({}) });
    expect(mocks.authorize).toHaveBeenCalledWith(
      "b".repeat(24),
      ["inventory.read"],
      expect.any(Headers),
    );
    expect(mocks.metadata).toHaveBeenCalledWith(context);
    const target = new URL(mocks.redirect.mock.calls[0][0], "http://localhost");
    expect(target.searchParams.get("storeId")).toBe(context.storeId);
    expect(target.searchParams.get("businessDate")).toBe("2026-09-12");
    expect(target.searchParams.get("open")).toBe("1");
  });
  it("keeps an explicitly selected historical day", async () => {
    await InventoryPage({
      params,
      searchParams: Promise.resolve({ businessDate: "2026-09-10" }),
    });
    expect(mocks.redirect.mock.calls[0][0]).toContain(
      "businessDate=2026-09-10",
    );
  });
  it("refuses a forbidden store before reading metadata or redirecting", async () => {
    mocks.authorize.mockRejectedValue(new StoreAccessDeniedError());
    await expect(
      InventoryPage({ params, searchParams: Promise.resolve({}) }),
    ).rejects.toBeInstanceOf(StoreAccessDeniedError);
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
