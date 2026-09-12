import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/blob")>()),
  issueSignedToken: vi.fn(),
}));
import { issueSignedToken } from "@vercel/blob";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  uploadGrantSchema,
  uploadAuthorizationLifetimeMs,
} from "@/domain/attachments/upload-transport";
import { scopedObjectPrefix } from "@/server/storage/private-object-reader";
import { readBoundedUploadJson } from "@/server/http/upload-intent-request";
import {
  VercelUploadTransport,
  requireUploadTransportConfig,
} from "@/server/storage/upload-transport";

const context: AuthorizedStoreContext = {
  organizationId: "org",
  storeId: "a".repeat(24),
  userId: "manager",
  role: "department_manager",
  permissions: ["attachments.write"],
};
const keys = generateKeyPairSync("ed25519");
const config = {
  token: "never-send-this-read-write-token",
  storeId: "store_test",
  namespace: "local-test",
  readTimeoutMs: 1000,
  callbackUrl: "https://fleg.example.com/api/storage/blob/upload-completed",
  webhookPublicKey: keys.publicKey
    .export({ type: "spki", format: "pem" })
    .toString(),
  storeQuotaBytes: 10000,
  environmentQuotaBytes: 20000,
  storeQuotaObjects: 10,
  environmentQuotaObjects: 20,
};
const transport = new VercelUploadTransport(config);
function grant() {
  const id = randomUUID();
  const now = Date.now();
  return uploadGrantSchema.parse({
    intentId: id,
    attemptId: randomUUID(),
    storage: {
      backend: "vercel_blob",
      storeId: config.storeId,
      namespace: config.namespace,
      pathname: `${scopedObjectPrefix(context, config.namespace)}${id}.png`,
    },
    issuedAt: new Date(now).toISOString(),
    validUntil: new Date(now + uploadAuthorizationLifetimeMs).toISOString(),
    input: {
      kind: "photo",
      target: { type: "store" },
      idempotencyKey: randomUUID(),
      originalFileName: "photo.png",
      caption: null,
      checksumSha256: "a".repeat(64),
      mimeType: "image/png",
      sizeBytes: 80,
    },
  });
}
function completionBody() {
  const input = grant();
  const url = `https://test.private.blob.vercel-storage.com/${input.storage.pathname}`;
  // Order differs deliberately from the Zod schema; include a signed unknown field.
  return {
    providerExtra: "signed",
    payload: {
      tokenPayload: JSON.stringify({
        intentId: input.intentId,
        attemptId: input.attemptId,
      }),
      blob: {
        contentType: input.input.mimeType,
        etag: '"etag"',
        pathname: input.storage.pathname,
        contentDisposition: 'inline; filename="photo.png"',
        downloadUrl: `${url}?download=1`,
        url,
      },
    },
    type: "blob.upload-completed",
  };
}
function callbackRequest(body: unknown) {
  return new Request(config.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-signature": sign(
        null,
        Buffer.from(JSON.stringify(body)),
        keys.privateKey,
      ).toString("hex"),
    },
    body: JSON.stringify(body),
  });
}

describe("TECH-04 constrained transport (no live provider)", () => {
  beforeEach(() => {
    vi.mocked(issueSignedToken)
      .mockReset()
      .mockImplementation(async (options) => {
        if (!options) throw new Error("Missing test options");
        return {
          delegationToken: `${Buffer.from(
            JSON.stringify({
              storeId: config.storeId,
              pathname: options.pathname,
              operations: options.operations,
              allowedContentTypes: options.allowedContentTypes,
              maximumSizeInBytes: options.maximumSizeInBytes,
              validUntil: options.validUntil,
            }),
          ).toString("base64url")}.test-only`,
          clientSigningToken: "test-only-signing-key",
          validUntil: options.validUntil!,
        };
      });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is release-locked even when intent reservations are explicitly enabled", () => {
    vi.stubEnv("BLOB_INTENTS_ENABLED", "true");
    expect(requireUploadTransportConfig).toThrow("pas activés");
    expect(issueSignedToken).not.toHaveBeenCalled();
  });
  it("signs exact path, size, MIME, expiry and callback; never returns signing or RW material", async () => {
    const input = grant();
    const result = await transport.authorize(context, input);
    expect(issueSignedToken).toHaveBeenCalledWith({
      token: config.token,
      pathname: input.storage.pathname,
      operations: ["put"],
      maximumSizeInBytes: 80,
      allowedContentTypes: ["image/png"],
      validUntil: Date.parse(input.validUntil),
      abortSignal: expect.any(AbortSignal),
    });
    expect(Object.keys(result).sort()).toEqual([
      "contentType",
      "headers",
      "method",
      "url",
      "validUntil",
    ]);
    expect(JSON.stringify(result)).not.toContain(config.token);
    expect(result.headers).toEqual({ "x-content-type": "image/png" });
    expect(JSON.stringify(result)).not.toContain("test-only-signing-key");
    const url = new URL(result.url);
    expect(url.origin).toBe("https://vercel.com");
    expect(url.searchParams.get("pathname")).toBe(input.storage.pathname);
    expect(url.searchParams.get("vercel-blob-allow-overwrite")).toBe("false");
    expect(url.searchParams.get("vercel-blob-add-random-suffix")).toBe("false");
    expect(url.searchParams.get("vercel-blob-maximum-size-in-bytes")).toBe(
      "80",
    );
    expect(url.searchParams.get("vercel-blob-callback-url")).toBe(
      config.callbackUrl,
    );
    expect(
      JSON.parse(url.searchParams.get("vercel-blob-callback-token-payload")!),
    ).toEqual({ intentId: input.intentId, attemptId: input.attemptId });
  });
  it("opens only explicitly configured dev/preview resources and never production", async () => {
    const env = {
      BLOB_DEV_UPLOADS_ENABLED: "true",
      BLOB_INTENTS_ENABLED: "true",
      BLOB_STORE_ID: "store_5MOJSflf0L273Hz3",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_5MOJSflf0L273Hz3_test",
      BLOB_NAMESPACE: "local-test",
      BLOB_STORE_QUOTA_BYTES: "1000",
      BLOB_ENV_QUOTA_BYTES: "2000",
      BLOB_STORE_QUOTA_OBJECTS: "10",
      BLOB_ENV_QUOTA_OBJECTS: "20",
    };
    expect(requireUploadTransportConfig(env)).toMatchObject({
      storeId: env.BLOB_STORE_ID,
    });
    expect(() =>
      requireUploadTransportConfig({ ...env, VERCEL_ENV: "production" }),
    ).toThrow("pas activés");
    expect(() =>
      requireUploadTransportConfig({ ...env, BLOB_INTENTS_ENABLED: "false" }),
    ).toThrow();
    expect(() =>
      requireUploadTransportConfig({ ...env, BLOB_ENV_QUOTA_BYTES: "" }),
    ).toThrow();
    expect(() =>
      requireUploadTransportConfig({
        ...env,
        BLOB_STORE_ID: "store_k3DcIwSL9uBZuhhH",
      }),
    ).toThrow();
    const result = await new VercelUploadTransport({
      ...config,
      callbackUrl: undefined,
      webhookPublicKey: undefined,
    }).authorize(context, grant());
    expect(
      new URL(result.url).searchParams.has("vercel-blob-callback-url"),
    ).toBe(false);
  });
  it("rejects foreign scope/resource, readers and expired or expanded lifetimes before any provider call", async () => {
    const input = grant();
    for (const candidate of [
      { ...input, storage: { ...input.storage, storeId: "store_foreign" } },
      { ...input, storage: { ...input.storage, namespace: "preview-other" } },
      { ...input, validUntil: new Date(Date.now() - 1000).toISOString() },
      {
        ...input,
        validUntil: new Date(Date.parse(input.validUntil) + 1).toISOString(),
      },
    ])
      await expect(transport.authorize(context, candidate)).rejects.toThrow();
    for (const altered of [
      { ...context, permissions: [] },
      { ...context, organizationId: "other" },
      { ...context, storeId: "b".repeat(24) },
    ])
      await expect(transport.authorize(altered, input)).rejects.toThrow();
    expect(issueSignedToken).not.toHaveBeenCalled();
  });
  it("sanitizes SDK errors and supplies a bounded issuance timeout", async () => {
    vi.mocked(issueSignedToken).mockRejectedValue(
      new Error(`${config.token} signed-url-secret`),
    );
    await expect(transport.authorize(context, grant())).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
    await expect(transport.authorize(context, grant())).rejects.not.toThrow(
      config.token,
    );
  });
  it("authenticates Ed25519 callbacks with original property order, without user session or Origin", async () => {
    const body = completionBody();
    const request = callbackRequest(body);
    const parsed = await readBoundedUploadJson(request, 16384);
    expect(await transport.verifyCompletion(request, parsed)).toEqual({
      ...JSON.parse(body.payload.tokenPayload),
      pathname: body.payload.blob.pathname,
      url: body.payload.blob.url,
      contentType: "image/png",
    });
    expect(issueSignedToken).not.toHaveBeenCalled();
  });
  it("rejects unsigned, forged, foreign-key, tampered and token-issuing events", async () => {
    const body = completionBody();
    const signed = callbackRequest(body);
    const foreign = new VercelUploadTransport({
      ...config,
      webhookPublicKey: generateKeyPairSync("ed25519")
        .publicKey.export({ type: "spki", format: "pem" })
        .toString(),
    });
    for (const headers of [
      new Headers(),
      new Headers({ "x-vercel-signature": "a".repeat(128) }),
      new Headers({ "x-vercel-signature": "zz" }),
    ]) {
      await expect(
        transport.verifyCompletion(
          new Request(config.callbackUrl, { headers }),
          body,
        ),
      ).rejects.toMatchObject({ code: "UPLOAD_CALLBACK_INVALID" });
    }
    await expect(foreign.verifyCompletion(signed, body)).rejects.toMatchObject({
      code: "UPLOAD_CALLBACK_INVALID",
    });
    await expect(
      transport.verifyCompletion(signed, {
        ...body,
        providerExtra: "tampered",
      }),
    ).rejects.toThrow("invalide");
    const tokenEvent = {
      type: "blob.generate-presigned-url",
      payload: { pathname: "*", multipart: true, clientPayload: null },
    };
    await expect(
      transport.verifyCompletion(callbackRequest(tokenEvent), tokenEvent),
    ).rejects.toThrow("invalide");
    expect(issueSignedToken).not.toHaveBeenCalled();
  });
  it("rejects invalid or scope-bearing tokenPayload even if genuinely signed", async () => {
    for (const tokenPayload of [
      "not-json",
      "{}",
      JSON.stringify({
        ...JSON.parse(completionBody().payload.tokenPayload),
        storeId: context.storeId,
      }),
    ]) {
      const body = completionBody();
      body.payload.tokenPayload = tokenPayload;
      await expect(
        transport.verifyCompletion(callbackRequest(body), body),
      ).rejects.toThrow("invalide");
    }
  });
  it("bounds callback bytes without trusting Content-Length and rejects malformed UTF-8", async () => {
    for (const body of [new Uint8Array([255]), "x".repeat(16385)]) {
      const request = new Request(config.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": "2" },
        body,
      });
      await expect(readBoundedUploadJson(request, 16384)).rejects.toThrow();
    }
  });
});
