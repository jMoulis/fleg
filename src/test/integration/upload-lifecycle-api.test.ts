import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  db: vi.fn(),
  config: vi.fn(),
  lifecycle: vi.fn(),
  reconcile: vi.fn(),
  remove: vi.fn(),
  content: vi.fn(),
  list: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/store-context", () => ({
  requireStoreContext: mocks.context,
}));
vi.mock("@/server/auth/session", () => ({
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/server/db/mongo-client", () => ({ getAppDb: mocks.db }));
vi.mock("@/server/http/api-error-monitor", () => ({
  reportUnexpectedApiError: vi.fn(),
}));
vi.mock("@/server/storage/config", () => ({
  requireUploadIntentConfig: mocks.config,
  parsePrivateStorageConfig: mocks.config,
}));
vi.mock("@/server/services/upload-lifecycle-service", () => ({
  getUploadLifecycle: mocks.lifecycle,
}));
vi.mock("@/server/repositories/document-source-repository", () => ({
  DocumentSourceRepository: class {
    content = mocks.content;
    list = mocks.list;
  },
}));
vi.mock("@/server/storage/private-upload-object", () => ({
  VercelPrivateUploadObjectStore: class {},
}));
import { POST as maintenance } from "@/app/api/stores/[storeId]/attachments/maintenance/route";
import { POST as remove } from "@/app/api/stores/[storeId]/attachments/sources/[sourceId]/remove/route";
import { GET as download } from "@/app/api/stores/[storeId]/attachments/documents/[sourceId]/content/route";
import { GET as list } from "@/app/api/stores/[storeId]/attachments/documents/route";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
const storeId = "a".repeat(24);
const sourceId = "b".repeat(24);
const context = {
  userId: "manager",
  organizationId: "org",
  storeId,
  permissions: ["attachments.write", "stores.read"],
};
const route = { params: Promise.resolve({ storeId, sourceId }) };
function request(body: unknown = {}, origin = "https://fleg.test") {
  return new Request(
    `https://fleg.test/api/stores/${storeId}/attachments/maintenance`,
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
describe("TECH-04 lifecycle API boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue(context);
    mocks.config.mockReturnValue({});
    mocks.lifecycle.mockResolvedValue({
      reconcile: mocks.reconcile,
      removeSource: mocks.remove,
    });
    mocks.reconcile.mockResolvedValue({ processed: false });
    mocks.remove.mockResolvedValue({
      state: "deleting",
      deletionComplete: false,
    });
    mocks.content.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      originalFileName: "brief été.pdf",
      pageCount: 1,
    });
    mocks.list.mockResolvedValue({ sources: [], nextCursor: null });
  });
  it("authorizes before accessing configuration, MongoDB or object storage", async () => {
    mocks.context.mockRejectedValue(new StoreAccessDeniedError());
    for (const action of [maintenance, remove, download, list])
      expect((await action(request(), route)).status).toBe(404);
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });
  it("refuses unconfigured maintenance without processing", async () => {
    mocks.lifecycle.mockRejectedValueOnce(
      new PrivateStorageError("STORAGE_CONFIGURATION", "Indisponible"),
    );
    expect((await maintenance(request(), route)).status).toBe(503);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and nonempty maintenance/delete commands", async () => {
    for (const action of [maintenance, remove]) {
      expect(
        (await action(request({}, "https://other.test"), route)).status,
      ).toBe(404);
      expect(
        (await action(request({ pathname: "other/path" }), route)).status,
      ).toBe(400);
    }
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });
  it("runs one scoped pass and returns an explicit pending deletion receipt", async () => {
    expect((await maintenance(request(), route)).status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith(context, expect.any(String));
    const response = await remove(request(), route);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      state: "deleting",
      deletionComplete: false,
    });
  });
  it("serves PDFs only as private attachments and rechecks permissions after reading", async () => {
    const response = await download(request(), route);
    expect(response.status).toBe(200);
    expect(mocks.context).toHaveBeenCalledTimes(2);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename=\"document.pdf\"; filename*=UTF-8''brief%20%C3%A9t%C3%A9.pdf",
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
  it("does not return bytes if access is revoked during download", async () => {
    mocks.context
      .mockResolvedValueOnce(context)
      .mockRejectedValueOnce(new StoreAccessDeniedError());
    expect((await download(request(), route)).status).toBe(404);
  });
  it("bounds pagination input without accepting URL or namespace overrides", async () => {
    const response = await list(
      new Request(`https://fleg.test/list?cursor=${sourceId}`),
      route,
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(context, sourceId);
    expect(
      (
        await list(
          new Request("https://fleg.test/list?url=https://other.test"),
          route,
        )
      ).status,
    ).toBe(400);
  });
});
