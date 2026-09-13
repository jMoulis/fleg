import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  session: vi.fn(),
  db: vi.fn(),
  target: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.context,
}));
vi.mock("@/server/auth/session", () => ({
  requireSession: mocks.session,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/server/db/mongo-client", () => ({ getAppDb: mocks.db }));
vi.mock("@/server/repositories/store-repository", () => ({
  StoreRepository: class {
    async getOfflineReferenceMetadata() {
      return { name: "Magasin de test" };
    }
  },
}));
vi.mock("@/server/repositories/attachment-target", () => ({
  assertAttachmentTargetExists: mocks.target,
}));
vi.mock("@/server/http/api-error-monitor", () => ({
  reportUnexpectedApiError: vi.fn(),
}));
import {
  GET,
  POST,
} from "@/app/api/stores/[storeId]/attachments/offline/route";
import { readUploadIntentRequest } from "@/server/http/upload-intent-request";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";

const storeId = "a".repeat(24);
const origin = "https://app.example";
const route = { params: Promise.resolve({ storeId }) };
const target = {
  type: "fixture",
  layoutVersionId: "b".repeat(24),
  fixtureId: "face-a",
};
const identity = {
  userId: "manager",
  organizationId: "org",
  storeId,
  sessionBinding: createHash("sha256").update("session-a").digest("hex"),
};
function request(body: unknown, headers = {}) {
  return new Request(`${origin}/api/stores/${storeId}/attachments/offline`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    ...identity,
    permissions: ["attachments.write"],
  });
  mocks.session.mockResolvedValue({
    user: { id: "manager" },
    session: { id: "session-a", expiresAt: new Date(Date.now() + 60000) },
  });
});
describe("photo preparation access boundary", () => {
  it("validates target under authorized tenant/store and caps preparation at session expiry", async () => {
    const response = await POST(request({ target, label: "Face A" }), route);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      identity,
      targets: [{ target, label: "Face A" }],
    });
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(60000);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.target).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ storeId, organizationId: "org" }),
      target,
    );
  });
  it("refuses foreign stores, stale sessions and forged targets without producing a preparation", async () => {
    mocks.context.mockRejectedValueOnce(new StoreAccessDeniedError());
    expect(
      (await POST(request({ target, label: "Face A" }), route)).status,
    ).toBe(404);
    expect(mocks.target).not.toHaveBeenCalled();
    mocks.session.mockResolvedValueOnce({ user: { id: "other" } });
    expect(
      (await POST(request({ target, label: "Face A" }), route)).status,
    ).toBe(404);
    expect(mocks.target).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({
            target: { ...target, layoutVersionId: "forged" },
            label: "X",
          }),
          route,
        )
      ).status,
    ).toBe(400);
  });
  it("keeps access checks private and refuses missing write rights/cross-site preparation", async () => {
    const result = await GET(
      new Request(`${origin}/api/stores/${storeId}/attachments/offline`),
      route,
    );
    expect(await result.json()).toMatchObject(identity);
    expect(mocks.context).toHaveBeenCalledWith(
      storeId,
      ["attachments.write"],
      expect.any(Headers),
    );
    expect(
      (
        await POST(
          request(
            { target, label: "A" },
            { Origin: "https://foreign.example" },
          ),
          route,
        )
      ).status,
    ).toBe(404);
  });
  it("fences all offline upload commands against changed cookies or store IDs", async () => {
    const input = {};
    await expect(
      readUploadIntentRequest(
        request(input, { "x-fleg-photo-owner": JSON.stringify(identity) }),
      ),
    ).resolves.toEqual(input);
    for (const owner of [
      { ...identity, userId: "other" },
      { ...identity, sessionBinding: "f".repeat(64) },
      { ...identity, storeId: "d".repeat(24) },
    ]) {
      await expect(
        readUploadIntentRequest(
          request(input, { "x-fleg-photo-owner": JSON.stringify(owner) }),
        ),
      ).rejects.toBeInstanceOf(StoreAccessDeniedError);
    }
  });
});
