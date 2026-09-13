import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  lifecycle: vi.fn(),
  config: vi.fn(),
  batch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/mongo-client", () => ({ getAppDb: mocks.db }));
vi.mock("@/server/services/upload-lifecycle-service", () => ({
  getUploadLifecycle: mocks.lifecycle,
}));
vi.mock("@/server/services/upload-maintenance-service", () => ({
  runUploadMaintenanceBatch: mocks.batch,
}));
vi.mock("@/server/storage/config", () => ({
  parsePrivateStorageConfig: mocks.config,
}));
import { GET } from "@/app/api/cron/storage-maintenance/route";
import { storageMaintenanceConfig } from "@/server/storage/maintenance-config";

const secret = "synthetic-maintenance-secret-123456789";
const storeId = "a".repeat(24);
const request = (authorization?: string) =>
  new Request(
    "https://fleg.test/api/cron/storage-maintenance?storeId=" + "b".repeat(24),
    { headers: authorization ? { authorization } : {} },
  );
describe("scheduled storage maintenance boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BLOB_MAINTENANCE_ENABLED", "true");
    vi.stubEnv("BLOB_MAINTENANCE_STORE_IDS", storeId);
    vi.stubEnv("CRON_SECRET", secret);
    mocks.db.mockResolvedValue({});
    mocks.lifecycle.mockResolvedValue({});
    mocks.config.mockReturnValue({});
    mocks.batch.mockResolvedValue({ examined: 1, processed: 1, retries: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("is inert by default and authenticates before DB or Blob access", async () => {
    vi.stubEnv("BLOB_MAINTENANCE_ENABLED", "false");
    expect(await (await GET(request())).json()).toEqual({ status: "disabled" });
    vi.stubEnv("BLOB_MAINTENANCE_ENABLED", "true");
    for (const header of [
      undefined,
      "Bearer wrong",
      `bearer ${secret}`,
      `Bearer ${secret.slice(0, -1)}X`,
    ]) {
      const response = await GET(request(header));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
  });
  it("rejects malformed scope/secret without exposing configuration values", async () => {
    vi.stubEnv("BLOB_MAINTENANCE_STORE_IDS", "invalid-secret-value");
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(() =>
      storageMaintenanceConfig({
        CRON_SECRET: "short",
        BLOB_MAINTENANCE_STORE_IDS: storeId,
      }),
    ).toThrow();
    expect(
      storageMaintenanceConfig({
        CRON_SECRET: secret,
        BLOB_MAINTENANCE_STORE_IDS: `${storeId}, ${storeId}`,
      }).storeIds,
    ).toEqual([storeId]);
  });
  it("uses only the configured store set, even when new reservations are disabled", async () => {
    vi.stubEnv("BLOB_INTENTS_ENABLED", "false");
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(200);
    expect(mocks.batch).toHaveBeenCalledWith(
      expect.objectContaining({ authorizedStoreIds: [storeId] }),
    );
    mocks.batch.mockResolvedValueOnce({
      examined: 1,
      processed: 1,
      retries: 1,
    });
    expect(await (await GET(request(`Bearer ${secret}`))).json()).toEqual({
      status: "retry_pending",
      examined: 1,
      processed: 1,
      retries: 1,
    });
  });
});
