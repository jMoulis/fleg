import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ get: mocks.get, del: mocks.del }));
import { VercelPrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { scopedObjectPrefix } from "@/server/storage/private-object-reader";
import {
  uploadIntentInputSchema,
  type PrivateBlobReference,
} from "@/domain/attachments/private-storage";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
const context: AuthorizedStoreContext = {
  userId: "owner",
  organizationId: "org",
  storeId: "a".repeat(24),
  role: "department_manager",
  permissions: ["stores.read", "attachments.write"],
};
const config = {
  storeId: "store_test",
  namespace: "local-test",
  token: "test-only",
  readTimeoutMs: 1000,
};
const reference: PrivateBlobReference = {
  backend: "vercel_blob",
  storeId: config.storeId,
  namespace: config.namespace,
  pathname: `${scopedObjectPrefix(context, config.namespace)}${randomUUID()}.pdf`,
};
const bytes = new TextEncoder().encode(
  "%PDF-1.7 bytes validated separately by the parser",
);
const input = uploadIntentInputSchema.parse({
  kind: "document",
  target: { type: "store" },
  idempotencyKey: randomUUID(),
  originalFileName: "brief.pdf",
  caption: null,
  mimeType: "application/pdf",
  sizeBytes: bytes.length,
  checksumSha256: createHash("sha256").update(bytes).digest("hex"),
});
const store = new VercelPrivateUploadObjectStore(config);
function response(chunks = [bytes], blob = {}) {
  return {
    statusCode: 200,
    blob: {
      pathname: reference.pathname,
      contentType: "application/pdf",
      size: bytes.length,
      ...blob,
    },
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  };
}
describe("private quarantined object adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue(response());
    mocks.del.mockResolvedValue(undefined);
  });
  it("reads only the persisted path with explicit credentials, fresh private read and checksum", async () => {
    expect(await store.read(context, reference, input)).toEqual(bytes);
    expect(mocks.get).toHaveBeenCalledWith(
      reference.pathname,
      expect.objectContaining({
        access: "private",
        token: "test-only",
        useCache: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });
  it("rejects wrong metadata, hash, truncation and oversized streams", async () => {
    for (const value of [
      response([bytes], { contentType: "text/html" }),
      response([bytes], { pathname: "foreign" }),
      response([bytes], { size: bytes.length + 1 }),
      response([bytes.subarray(1)]),
      response([bytes, bytes]),
      response([new Uint8Array(bytes.length)]),
    ]) {
      mocks.get.mockResolvedValueOnce(value);
      await expect(store.read(context, reference, input)).rejects.toMatchObject(
        { code: "STORAGE_INTEGRITY" },
      );
    }
  });
  it("treats only an explicit not-found result as absence, never a 304, timeout or 5xx", async () => {
    mocks.get.mockResolvedValueOnce(null);
    expect(await store.read(context, reference, input)).toBeNull();
    mocks.get.mockResolvedValueOnce({ statusCode: 304 });
    await expect(store.read(context, reference, input)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
    mocks.get.mockRejectedValueOnce(new Error("provider 503 secret URL"));
    await expect(store.read(context, reference, input)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      message: "Lecture privée temporairement indisponible",
    });
  });
  it("rejects foreign scopes and read-only deletion before calling the provider", async () => {
    for (const altered of [
      { ...reference, storeId: "store_other" },
      { ...reference, namespace: "local-other" },
    ])
      await expect(store.read(context, altered, input)).rejects.toMatchObject({
        code: "STORAGE_INTEGRITY",
      });
    await expect(
      store.read({ ...context, organizationId: "other" }, reference, input),
    ).rejects.toMatchObject({ code: "STORAGE_INTEGRITY" });
    await expect(
      store.remove({ ...context, permissions: ["stores.read"] }, reference),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND_OR_FORBIDDEN" });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });
  it("checks fresh absence after deletion and refuses false confirmations", async () => {
    await expect(store.remove(context, reference)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
    mocks.get.mockRejectedValueOnce(new Error("timeout"));
    await expect(store.remove(context, reference)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
    mocks.get.mockResolvedValueOnce(null);
    await expect(store.remove(context, reference)).resolves.toBeUndefined();
    expect(mocks.del).toHaveBeenCalledWith(
      reference.pathname,
      expect.objectContaining({ token: "test-only" }),
    );
  });
});
