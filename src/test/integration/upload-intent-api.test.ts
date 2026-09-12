import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  db: vi.fn(),
  client: vi.fn(),
  reserve: vi.fn(),
  get: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.context,
}));
vi.mock("@/server/db/mongo-client", () => ({
  getAppDb: mocks.db,
  getMongoClient: mocks.client,
}));
vi.mock("@/server/repositories/upload-intent-repository", () => ({
  UploadIntentRepository: class {
    reserve = mocks.reserve;
    get = mocks.get;
  },
}));
vi.mock("@/server/auth/session", () => ({
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/server/http/api-error-monitor", () => ({
  reportUnexpectedApiError: vi.fn(),
}));
import { POST } from "@/app/api/stores/[storeId]/attachments/upload-intents/route";
import { GET } from "@/app/api/stores/[storeId]/attachments/upload-intents/[intentId]/route";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { PrivateStorageError } from "@/domain/attachments/private-storage";

const storeId = "a".repeat(24);
const origin = "https://fleg-preview.example.com";
const input = {
  kind: "photo",
  idempotencyKey: randomUUID(),
  originalFileName: "photo.png",
  target: { type: "store" },
  caption: null,
  mimeType: "image/png",
  sizeBytes: 8,
  checksumSha256: "a".repeat(64),
};
const route = { params: Promise.resolve({ storeId }) };
function request(body: unknown = input, originHeader: string | null = origin) {
  return new Request(
    `${origin}/api/stores/${storeId}/attachments/upload-intents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(originHeader ? { Origin: originHeader } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}
describe("upload intent API boundary", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries({
      BLOB_INTENTS_ENABLED: "true",
      BLOB_STORE_ID: "store_5MOJSflf0L273Hz3",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_5MOJSflf0L273Hz3_fake",
      BLOB_NAMESPACE: "preview-tests",
      BLOB_STORE_QUOTA_BYTES: "1000",
      BLOB_ENV_QUOTA_BYTES: "2000",
      BLOB_STORE_QUOTA_OBJECTS: "20",
      BLOB_ENV_QUOTA_OBJECTS: "40",
      VERCEL_ENV: "preview",
    }))
      vi.stubEnv(key, value);
    mocks.context.mockResolvedValue({
      userId: "manager",
      organizationId: "org",
      storeId,
      permissions: ["attachments.write"],
    });
    mocks.reserve.mockResolvedValue({
      id: randomUUID(),
      state: "reserved",
      uploadAvailable: false,
    });
    mocks.get.mockResolvedValue({
      id: randomUUID(),
      state: "reserved",
      uploadAvailable: false,
    });
  });

  it("authenticates and requires write permission before checking configuration or reserving", async () => {
    mocks.context.mockRejectedValue(new StoreAccessDeniedError());
    vi.stubEnv("BLOB_INTENTS_ENABLED", "false");
    const response = await POST(request(), route);
    expect(response.status).toBe(404);
    expect(mocks.context).toHaveBeenCalledWith(
      storeId,
      ["attachments.write"],
      expect.any(Headers),
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("defaults to unavailable with no DB write or credential exposed", async () => {
    vi.stubEnv("BLOB_INTENTS_ENABLED", "false");
    const response = await POST(request(), route);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "STORAGE_DISABLED" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("advertises available uploads only for the explicitly enabled dev transport", async () => {
    vi.stubEnv("BLOB_DEV_UPLOADS_ENABLED", "true");
    expect(await (await POST(request(), route)).json()).toMatchObject({
      intent: { uploadAvailable: true },
    });
    vi.stubEnv("BLOB_DEV_UPLOADS_ENABLED", "false");
    expect(await (await POST(request(), route)).json()).toMatchObject({
      intent: { uploadAvailable: false },
    });
  });
  it("rejects cross-origin/missing origin and forged client references before persistence", async () => {
    for (const req of [
      request(input, "https://attacker.test"),
      request(input, null),
      request({ ...input, pathname: "foreign" }),
      request({ ...input, token: "fake" }),
      request({ ...input, ownerId: "another-user" }),
    ]) {
      expect([400, 404]).toContain((await POST(req, route)).status);
    }
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("bounds JSON body size without trusting Content-Length", async () => {
    const response = await POST(
      request({ ...input, caption: "x".repeat(5000) }),
      route,
    );
    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    await expect(
      readUploadIntentRequest(
        new Request(`${origin}/api/upload`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "text/plain" },
          body: "{}",
        }),
      ),
    ).rejects.toThrow("JSON");
  });
  it("returns only an intent and never a token, file URL or linked attachment", async () => {
    const response = await POST(request(), route);
    expect(response.status).toBe(201);
    expect(mocks.reserve).toHaveBeenCalledWith(
      await mocks.context.mock.results[0].value,
      input,
      expect.any(String),
    );
    expect(await response.json()).toMatchObject({
      intent: { state: "reserved", uploadAvailable: false },
    });
  });
  it("authorizes lost-ACK status lookup and exposes only safe conflict/unavailable errors", async () => {
    const intentId = randomUUID();
    const readRoute = { params: Promise.resolve({ storeId, intentId }) };
    const req = new Request(
      `${origin}/api/stores/${storeId}/attachments/upload-intents/${intentId}`,
    );
    expect((await GET(req, readRoute)).status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "manager", storeId }),
      intentId,
    );
    mocks.get.mockRejectedValue(
      new PrivateStorageError(
        "UPLOAD_NOT_FOUND",
        "Intention introuvable ou accès refusé",
      ),
    );
    expect((await GET(req, readRoute)).status).toBe(404);
    mocks.reserve.mockRejectedValue(
      new PrivateStorageError("UPLOAD_QUOTA", "Plafond atteint"),
    );
    expect((await POST(request(), route)).status).toBe(409);
  });
});
