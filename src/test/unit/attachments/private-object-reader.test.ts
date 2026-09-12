import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ get: vi.fn() }));
import { get, type GetBlobResult } from "@vercel/blob";
import { attachmentSchema } from "@/domain/attachments/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import type { PrivateBlobReference } from "@/domain/attachments/private-storage";
import {
  scopedObjectPrefix,
  VercelPrivateObjectReader,
} from "@/server/storage/private-object-reader";

const context: AuthorizedStoreContext = {
  organizationId: "org-a",
  storeId: "a".repeat(24),
  userId: "manager",
  role: "department_manager",
  permissions: ["stores.read"],
};
const config = {
  storeId: "store_test",
  namespace: "local-test",
  token: "explicit-fake-token",
  readTimeoutMs: 1000,
};
const reference: PrivateBlobReference = {
  backend: "vercel_blob",
  storeId: config.storeId,
  namespace: config.namespace,
  pathname: `${scopedObjectPrefix(context, config.namespace)}${randomUUID()}.png`,
};
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const attachment = attachmentSchema.parse({
  id: "b".repeat(24),
  organizationId: context.organizationId,
  storeId: context.storeId,
  target: { type: "store" },
  targetKey: "store",
  caption: null,
  originalFileName: "rayon.png",
  mimeType: "image/png",
  sizeBytes: bytes.length,
  checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  retentionPolicy: "until_manual_deletion",
  uploadedBy: context.userId,
  createdAt: new Date().toISOString(),
  contentUrl: "/api/stores/test",
});
function response(
  content = bytes,
): Extract<GetBlobResult, { statusCode: 200 }> {
  return {
    statusCode: 200,
    headers: new Headers(),
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(content);
        controller.close();
      },
    }),
    blob: {
      url: "https://test.private.blob.vercel-storage.com/" + reference.pathname,
      pathname: reference.pathname,
      downloadUrl: "",
      contentDisposition: "",
      cacheControl: "",
      uploadedAt: new Date(),
      etag: "etag",
      contentType: "image/png",
      size: bytes.length,
    },
  };
}
describe("private object reader (hermetic SDK stub)", () => {
  beforeEach(() => vi.mocked(get).mockReset());
  it("reads only an exact scoped path with explicit credentials and validates bytes", async () => {
    vi.mocked(get).mockResolvedValue(response());
    expect(
      await new VercelPrivateObjectReader(config).readPhoto(
        context,
        reference,
        attachment,
      ),
    ).toEqual(bytes);
    expect(get).toHaveBeenCalledWith(
      reference.pathname,
      expect.objectContaining({
        token: config.token,
        access: "private",
        useCache: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });
  it("rejects foreign store, organization, resource and namespace before provider access", async () => {
    const reader = new VercelPrivateObjectReader(config);
    for (const wrong of [
      { ...reference, storeId: "store_foreign" },
      { ...reference, namespace: "preview-other" },
      {
        ...reference,
        pathname: reference.pathname.replace(context.storeId, "c".repeat(24)),
      },
    ])
      await expect(
        reader.readPhoto(context, wrong, attachment),
      ).rejects.toThrow();
    await expect(
      reader.readPhoto(
        { ...context, organizationId: "foreign" },
        reference,
        attachment,
      ),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it("rejects oversized, short, changed and falsely typed content", async () => {
    const reader = new VercelPrivateObjectReader(config);
    for (const badBytes of [
      Uint8Array.from([...bytes, 1]),
      bytes.slice(0, -1),
      Uint8Array.from([0, ...bytes.slice(1)]),
    ]) {
      vi.mocked(get).mockResolvedValue(response(badBytes));
      await expect(
        reader.readPhoto(context, reference, attachment),
      ).rejects.toThrow();
    }
    const badMime = response();
    badMime.blob.contentType = "text/html";
    vi.mocked(get).mockResolvedValue(badMime);
    await expect(
      reader.readPhoto(context, reference, attachment),
    ).rejects.toThrow();
    const fakePng = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    vi.mocked(get).mockResolvedValue(response(fakePng));
    await expect(
      reader.readPhoto(context, reference, {
        ...attachment,
        checksumSha256: createHash("sha256").update(fakePng).digest("hex"),
      }),
    ).rejects.toThrow();
  });
  it("keeps timeout/5xx/missing objects unavailable without leaking SDK errors", async () => {
    const reader = new VercelPrivateObjectReader(config);
    vi.mocked(get).mockRejectedValue(
      new Error("secret-token / provider-details"),
    );
    await expect(
      reader.readPhoto(context, reference, attachment),
    ).rejects.toThrow("temporairement indisponible");
    vi.mocked(get).mockResolvedValue(null);
    await expect(
      reader.readPhoto(context, reference, attachment),
    ).rejects.toThrow("temporairement indisponible");
    vi.mocked(get).mockImplementation((_path, options) => {
      if (!options?.abortSignal) return Promise.resolve(null);
      return new Promise((_resolve, reject) =>
        options.abortSignal?.addEventListener("abort", () =>
          reject(new Error("timeout")),
        ),
      );
    });
    await expect(
      reader.readPhoto(context, reference, attachment),
    ).rejects.toThrow("temporairement indisponible");
  });
});
