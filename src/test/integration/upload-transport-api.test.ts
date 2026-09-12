import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  db: vi.fn(),
  client: vi.fn(),
  config: vi.fn(),
  begin: vi.fn(),
  current: vi.fn(),
  cancel: vi.fn(),
  record: vi.fn(),
  authorize: vi.fn(),
  verify: vi.fn(),
  intentConfig: vi.fn(),
  get: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.context,
}));
vi.mock("@/server/auth/session", () => ({
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/server/db/mongo-client", () => ({
  getAppDb: mocks.db,
  getMongoClient: mocks.client,
}));
vi.mock("@/server/http/api-error-monitor", () => ({
  reportUnexpectedApiError: vi.fn(),
}));
vi.mock("@/server/storage/config", () => ({
  requireUploadIntentConfig: mocks.intentConfig,
}));
vi.mock("@/server/storage/upload-transport", () => ({
  requireUploadTransportConfig: mocks.config,
  VercelUploadTransport: class {
    authorize = mocks.authorize;
    verifyCompletion = mocks.verify;
  },
}));
vi.mock("@/server/repositories/upload-intent-repository", () => ({
  UploadIntentRepository: class {
    get = mocks.get;
    beginAuthorization = mocks.begin;
    assertAuthorizationCurrent = mocks.current;
    cancel = mocks.cancel;
    recordCompletion = mocks.record;
  },
}));
vi.mock("@/server/services/upload-lifecycle-service", () => ({
  getUploadLifecycle: async () => ({ reconcile: mocks.reconcile }),
}));
import { POST as verifyUpload } from "@/app/api/stores/[storeId]/attachments/upload-intents/[intentId]/verify/route";
import { POST as authorize } from "@/app/api/stores/[storeId]/attachments/upload-intents/[intentId]/authorization/route";
import { POST as cancel } from "@/app/api/stores/[storeId]/attachments/upload-intents/[intentId]/cancel/route";
import { POST as callback } from "@/app/api/storage/blob/upload-completed/route";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";

const origin = "https://fleg-preview.example.com";
const storeId = "a".repeat(24);
const intentId = randomUUID();
const context = {
  userId: "manager",
  organizationId: "org",
  storeId,
  permissions: ["attachments.write"],
};
const route = { params: Promise.resolve({ storeId, intentId }) };
const uploaded = {
  method: "PUT",
  url: "https://provider.test/signed-secret",
  contentType: "image/png",
  validUntil: new Date().toISOString(),
};
function request(body: unknown = {}, requestOrigin: string | null = origin) {
  return new Request(
    `${origin}/api/stores/${storeId}/attachments/upload-intents/${intentId}/authorization`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}
describe("TECH-04 transport route boundaries (release enabled only by test injection)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue(context);
    mocks.config.mockReturnValue({});
    mocks.intentConfig.mockReturnValue({});
    mocks.begin.mockResolvedValue({ intentId });
    mocks.authorize.mockResolvedValue(uploaded);
    mocks.current.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue({ id: intentId, state: "linked" });
    mocks.verify.mockResolvedValue({ intentId });
    mocks.cancel.mockResolvedValue({
      id: intentId,
      state: "cancelled",
      uploadAvailable: false,
    });
  });
  it("requires current store write permission before any grant, cancellation or configuration", async () => {
    mocks.context.mockRejectedValue(new StoreAccessDeniedError());
    expect((await authorize(request(), route)).status).toBe(404);
    expect((await cancel(request(), route)).status).toBe(404);
    expect((await verifyUpload(request(), route)).status).toBe(404);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("accepts only an empty same-origin command, never client paths, URLs, limits or multipart switches", async () => {
    for (const req of [
      request({}, null),
      request({}, "https://foreign.test"),
      request({ pathname: "*" }),
      request({ url: "https://foreign.test" }),
      request({ multipart: true }),
      request({ validUntil: Date.now() + 100000 }),
    ]) {
      expect([400, 404]).toContain((await authorize(req, route)).status);
    }
    expect((await cancel(request({ ownerId: "other" }), route)).status).toBe(
      400,
    );
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("verifies only the current owner's intent with an empty origin-checked command", async () => {
    for (const req of [
      request({}, null),
      request({}, "https://foreign.test"),
      request({ received: true }),
    ])
      expect([400, 404]).toContain((await verifyUpload(req, route)).status);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    mocks.get.mockRejectedValueOnce(
      new PrivateStorageError("UPLOAD_NOT_FOUND", "Introuvable"),
    );
    expect((await verifyUpload(request(), route)).status).toBe(404);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    const response = await verifyUpload(request(), route);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.reconcile).toHaveBeenCalledWith(
      context,
      expect.any(String),
      intentId,
    );
    mocks.get.mockResolvedValue({ id: intentId, state: "reserved" });
    expect((await verifyUpload(request(), route)).status).toBe(202);
  });
  it("does not verify with the dev gate disabled, or return a receipt after access revocation", async () => {
    mocks.config.mockImplementationOnce(() => {
      throw new PrivateStorageError("STORAGE_DISABLED", "Indisponible");
    });
    expect((await verifyUpload(request(), route)).status).toBe(503);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    mocks.context
      .mockResolvedValueOnce(context)
      .mockRejectedValueOnce(new StoreAccessDeniedError());
    expect((await verifyUpload(request(), route)).status).toBe(404);
  });
  it("refuses disabled transport and callbacks without DB/provider calls", async () => {
    mocks.config.mockImplementation(() => {
      throw new PrivateStorageError("STORAGE_DISABLED", "Indisponible");
    });
    for (const response of [
      await authorize(request(), route),
      await callback(request({}, null)),
    ]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "STORAGE_DISABLED" });
    }
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("records before signing and reauthorizes before returning a no-store capability", async () => {
    mocks.authorize.mockImplementation(async () => {
      expect(mocks.begin).toHaveBeenCalledWith(
        context,
        intentId,
        expect.any(String),
      );
      return uploaded;
    });
    const response = await authorize(request(), route);
    expect(response.status).toBe(200);
    expect(mocks.context).toHaveBeenCalledTimes(2);
    expect(mocks.current).toHaveBeenCalledWith(context, { intentId });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toMatchObject({ upload: uploaded });
  });
  it("never returns a minted URL after revocation, account change or cancellation during provider work", async () => {
    mocks.context
      .mockResolvedValueOnce(context)
      .mockRejectedValueOnce(new StoreAccessDeniedError());
    const revoked = await authorize(request(), route);
    expect(revoked.status).toBe(404);
    expect(await revoked.text()).not.toContain("signed-secret");
    mocks.context.mockResolvedValue({ ...context, userId: "another" });
    mocks.current.mockRejectedValue(
      new PrivateStorageError("UPLOAD_CONFLICT", "Annulé"),
    );
    const cancelled = await authorize(request(), route);
    expect(cancelled.status).toBe(409);
    expect(await cancelled.text()).not.toContain("signed-secret");
  });
  it("returns only a cancellation receipt, never a claim of physical deletion", async () => {
    const response = await cancel(request(), route);
    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith(
      context,
      intentId,
      expect.any(String),
    );
    expect(await response.json()).toMatchObject({
      intent: { state: "cancelled", uploadAvailable: false },
    });
  });
  it("authenticates callbacks before database access, not through a user session", async () => {
    mocks.verify.mockRejectedValue(
      new PrivateStorageError("UPLOAD_CALLBACK_INVALID", "Invalide"),
    );
    expect((await callback(request({}, null))).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("ACKs only durable callbacks and returns a retryable failure when MongoDB is unavailable", async () => {
    mocks.record.mockRejectedValueOnce(new Error("Mongo unavailable"));
    expect((await callback(request({}, null))).status).toBe(503);
    const response = await callback(request({}, null));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "blob.upload-completed",
      response: "ok",
    });
    expect(mocks.record).toHaveBeenCalledTimes(2);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("rejects oversized or non-JSON callback bodies before verifying or accessing MongoDB", async () => {
    expect(
      (await callback(request({ huge: "x".repeat(16384) }, null))).status,
    ).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
