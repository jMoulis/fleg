import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  metadata: vi.fn(),
  products: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/server/db/mongo-client", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/server/repositories/store-repository", () => ({
  StoreRepository: class {
    getOfflineReferenceMetadata = mocks.metadata;
  },
}));
vi.mock("@/server/repositories/product-repository", () => ({
  ProductRepository: class {
    listOptions = mocks.products;
  },
}));
vi.mock("@/server/repositories/inventory-repository", () => ({
  InventoryRepository: class {
    getWorkspace = mocks.workspace;
  },
  InventoryConflictError: class extends Error {},
}));
import {
  offlinePolicySchema,
  prepareOfflineWorkspace,
} from "@/server/services/offline-service";

const context: AuthorizedStoreContext = {
  userId: "u1",
  organizationId: "org1",
  storeId: "66d000000000000000000001",
  role: "viewer",
  permissions: ["inventory.read"],
};
const input = { context, businessDate: "2026-09-11", headers: new Headers() };

describe("offline preparation completeness and policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    mocks.session.mockResolvedValue({
      user: { id: "u1" },
      session: {
        id: "session-id",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    mocks.metadata.mockResolvedValue({ name: "Store A", dataRevision: 9 });
    mocks.products.mockResolvedValue([]);
    mocks.workspace.mockResolvedValue({
      businessDate: input.businessDate,
      count: null,
      products: [],
    });
  });
  it("checks bounded policies and cannot outlive the login session", async () => {
    expect(offlinePolicySchema.parse({})).toEqual({
      OFFLINE_MAX_AGE_HOURS: 12,
      OFFLINE_RETENTION_HOURS: 24,
      OFFLINE_MAX_PRODUCTS: 2_000,
      OFFLINE_MAX_LOCAL_DRAFTS: 14,
    });
    expect(
      offlinePolicySchema.safeParse({ OFFLINE_MAX_AGE_HOURS: 25 }).success,
    ).toBe(false);
    expect(
      offlinePolicySchema.safeParse({ OFFLINE_RETENTION_HOURS: 1 }).success,
    ).toBe(false);
    const result = await prepareOfflineWorkspace(input);
    expect(
      Date.parse(result.expiresAt) - Date.parse(result.preparedAt),
    ).toBeLessThanOrEqual(3_600_000);
    expect(mocks.products).toHaveBeenCalledWith(context, 2_001);
    expect(mocks.metadata).toHaveBeenCalledWith(context);
    expect(result.identity.sessionBinding).not.toContain("session-id");
    expect(result.canWriteInventory).toBe(false);
    const writable = await prepareOfflineWorkspace({ ...input, context: { ...context, permissions: ["inventory.read", "inventory.write"] } });
    expect(writable.canWriteInventory).toBe(true);
  });
  it("rejects a sentinel over the catalogue budget rather than dropping articles", async () => {
    mocks.products.mockResolvedValue(
      Array.from({ length: 2_001 }, () => ({
        id: context.storeId,
        label: "A",
      })),
    );
    await expect(prepareOfflineWorkspace(input)).rejects.toThrow("volumineux");
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("rejects a data revision changed during preparation", async () => {
    mocks.metadata
      .mockResolvedValueOnce({ name: "A", dataRevision: 9 })
      .mockResolvedValueOnce({ name: "A", dataRevision: 10 });
    await expect(prepareOfflineWorkspace(input)).rejects.toThrow("changé");
  });
  it("does not read the catalogue after a user change or missing permission", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "other" },
      session: { id: "other-session", expiresAt: new Date() },
    });
    await expect(prepareOfflineWorkspace(input)).rejects.toThrow(
      "accès refusé",
    );
    expect(mocks.products).not.toHaveBeenCalled();
  });
});
