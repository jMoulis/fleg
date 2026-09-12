import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  uploadIntentInputSchema,
  documentMaxSizeBytes,
  privateBlobReferenceSchema,
} from "@/domain/attachments/private-storage";
import {
  parsePrivateStorageConfig,
  requireUploadIntentConfig,
} from "@/server/storage/config";

const env = {
  BLOB_STORE_ID: "store_5MOJSflf0L273Hz3",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_5MOJSflf0L273Hz3_fake",
  BLOB_NAMESPACE: "local-test",
};
const photo = {
  kind: "photo",
  idempotencyKey: randomUUID(),
  originalFileName: "rayon.png",
  checksumSha256: "a".repeat(64),
  caption: null,
  target: { type: "store" },
  mimeType: "image/png",
  sizeBytes: 10,
};

describe("TECH-04 contracts", () => {
  it("validates bounded photos and store PDFs without claiming content validation", () => {
    expect(uploadIntentInputSchema.safeParse(photo).success).toBe(true);
    expect(
      uploadIntentInputSchema.safeParse({
        ...photo,
        sizeBytes: 4 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(
      uploadIntentInputSchema.safeParse({ ...photo, mimeType: "text/html" })
        .success,
    ).toBe(false);
    const pdf = {
      ...photo,
      kind: "document",
      mimeType: "application/pdf",
      sizeBytes: documentMaxSizeBytes,
    };
    expect(uploadIntentInputSchema.safeParse(pdf).success).toBe(true);
    expect(
      uploadIntentInputSchema.safeParse({
        ...pdf,
        sizeBytes: documentMaxSizeBytes + 1,
      }).success,
    ).toBe(false);
    expect(
      uploadIntentInputSchema.safeParse({
        ...pdf,
        target: { type: "commercial_event", eventId: "a".repeat(24) },
      }).success,
    ).toBe(false);
    for (const extra of [
      { pathname: "other/store" },
      { url: "https://attacker.test" },
      { ownerId: "another-user" },
      { organizationId: "foreign" },
      { token: "fake" },
    ]) {
      expect(
        uploadIntentInputSchema.safeParse({ ...photo, ...extra }).success,
      ).toBe(false);
    }
  });

  it("rejects URLs, traversal and unbounded paths as stored object references", () => {
    for (const pathname of [
      "https://attacker.test/file.png",
      "../private.png",
      "fleg/local-test/../../image.png",
      "fleg/local-test/" + "a".repeat(1000),
    ]) {
      expect(
        privateBlobReferenceSchema.safeParse({
          backend: "vercel_blob",
          storeId: env.BLOB_STORE_ID,
          namespace: env.BLOB_NAMESPACE,
          pathname,
        }).success,
      ).toBe(false);
    }
  });

  it("is disabled by default even when a Blob token is present", () => {
    expect(() => requireUploadIntentConfig(env)).toThrow("pas activée");
    expect(() => requireUploadIntentConfig({})).toThrow("pas activée");
    expect(parsePrivateStorageConfig(env)).toMatchObject({
      storeId: env.BLOB_STORE_ID,
      namespace: "local-test",
      readTimeoutMs: 15000,
    });
    expect(() =>
      requireUploadIntentConfig({ ...env, BLOB_INTENTS_ENABLED: "true" }),
    ).toThrow("plafonds");
    expect(
      requireUploadIntentConfig({
        ...env,
        BLOB_INTENTS_ENABLED: "true",
        BLOB_STORE_QUOTA_BYTES: "500",
        BLOB_ENV_QUOTA_BYTES: "1000",
        BLOB_STORE_QUOTA_OBJECTS: "20",
        BLOB_ENV_QUOTA_OBJECTS: "40",
      }),
    ).toMatchObject({ storeQuotaBytes: 500, environmentQuotaBytes: 1000 });
    expect(() =>
      requireUploadIntentConfig({
        ...env,
        BLOB_INTENTS_ENABLED: "true",
        BLOB_STORE_QUOTA_BYTES: "1001",
        BLOB_ENV_QUOTA_BYTES: "1000",
      }),
    ).toThrow("plafonds");
  });

  it("pins resource, token and namespace without leaking credentials or using ambient OIDC", () => {
    const prod = {
      BLOB_STORE_ID: "store_k3DcIwSL9uBZuhhH",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_k3DcIwSL9uBZuhhH_fake",
      BLOB_NAMESPACE: "production-v1",
    };
    for (const bad of [
      { ...env, BLOB_READ_WRITE_TOKEN: prod.BLOB_READ_WRITE_TOKEN },
      prod,
      { ...env, BLOB_NAMESPACE: "production-v1" },
      { ...env, VERCEL_ENV: "production" },
      { ...env, VERCEL_ENV: "preview" },
      { ...env, BLOB_READ_WRITE_TOKEN: "", VERCEL_OIDC_TOKEN: "ambient" },
    ]) {
      expect(() => parsePrivateStorageConfig(bad)).toThrow();
      try {
        parsePrivateStorageConfig(bad);
      } catch (error) {
        expect(String(error)).not.toContain("vercel_blob_rw");
      }
    }
    expect(
      parsePrivateStorageConfig({ ...prod, VERCEL_ENV: "production" }).storeId,
    ).toBe(prod.BLOB_STORE_ID);
    expect(
      parsePrivateStorageConfig({
        ...env,
        VERCEL_ENV: "preview",
        BLOB_NAMESPACE: "preview-branch",
      }).namespace,
    ).toBe("preview-branch");
  });
});
