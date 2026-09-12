import {
  get,
  issueSignedToken,
  parseStoreIdFromDelegationToken,
  presignUrl,
} from "@vercel/blob";
import * as z from "zod";
import {
  documentMaxSizeBytes,
  type PrivateBlobReference,
} from "@/domain/attachments/private-storage";
import { classifyMimeType } from "./evidence";
import { parsePrivateStorageConfig } from "@/server/storage/config";
import { VercelPrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { validatePdf } from "@/server/storage/pdf-validator";
import {
  acceptanceContext,
  acceptanceFixtures,
  acceptanceNamespace,
  acceptanceStoreId,
  type AcceptancePort,
} from "./probe";

export function acceptanceConfig(
  env: Record<string, string | undefined>,
  runId: string,
) {
  // Fail closed on credentials/environment, SDK destination overrides and
  // verbose logs. Only this local process sets retries=0; no env file is edited.
  if (
    env.VERCEL ||
    env.CI ||
    env.NODE_ENV === "production" ||
    (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "development") ||
    Object.entries(env).some(
      ([key, value]) =>
        value &&
        (key.startsWith("VERCEL_BLOB_") ||
          key.startsWith("NEXT_PUBLIC_VERCEL_BLOB_") ||
          [
            "DEBUG",
            "NEXT_PUBLIC_DEBUG",
            "NODE_DEBUG",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
          ].includes(key)) &&
        !(key === "VERCEL_BLOB_RETRIES" && value === "0"),
    )
  )
    throw new Error("Local acceptance environment refused");
  const config = parsePrivateStorageConfig({
    BLOB_STORE_ID: env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
    BLOB_NAMESPACE: acceptanceNamespace(runId),
    // Includes one bounded 25 MiB read; the application default is unchanged.
    BLOB_READ_TIMEOUT_MS: "30000",
  });
  if (config.storeId !== acceptanceStoreId)
    throw new Error("Development store required");
  return config;
}

export function createAcceptancePort(
  config: ReturnType<typeof acceptanceConfig>,
): AcceptancePort {
  if (process.env.VERCEL_BLOB_RETRIES !== "0")
    throw new Error("SDK retries must be disabled for bounded acceptance");
  const objects = new VercelPrivateUploadObjectStore(config);
  const paths = new Set(
    acceptanceFixtures(config.namespace.slice("local-acceptance-".length)).map(
      (fixture) => fixture.reference.pathname,
    ),
  );
  const hostname = `${acceptanceStoreId.slice(6).toLowerCase()}.private.blob.vercel-storage.com`;
  function ownedReference(reference: PrivateBlobReference) {
    if (
      reference.storeId !== config.storeId ||
      reference.namespace !== config.namespace ||
      !paths.has(reference.pathname)
    )
      throw new Error("Unowned acceptance path");
    return reference;
  }
  function ownedUrl(url: string) {
    const parsed = new URL(url);
    const privateRead =
      parsed.hostname === hostname && paths.has(parsed.pathname.slice(1));
    const api =
      parsed.hostname === "vercel.com" &&
      parsed.pathname === "/api/blob/" &&
      paths.has(parsed.searchParams.get("pathname") ?? "");
    if (
      parsed.protocol !== "https:" ||
      (!privateRead && !api) ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    )
      throw new Error("Unexpected provider destination");
    return parsed;
  }
  function plainUrl(reference: PrivateBlobReference) {
    return `https://${hostname}/${reference.pathname}`;
  }
  return {
    async absent(reference) {
      ownedReference(reference);
      const response = await get(reference.pathname, {
        token: config.token,
        access: "private",
        useCache: false,
        abortSignal: AbortSignal.timeout(config.readTimeoutMs),
      });
      if (response?.statusCode === 200) await response.stream.cancel();
      return response === null;
    },
    async authorize(reference, input, validUntil) {
      ownedReference(reference);
      const signed = z
        .object({
          delegationToken: z.string().min(1).max(8192),
          clientSigningToken: z.string().min(1).max(2048),
          validUntil: z.literal(validUntil),
        })
        .parse(
          await issueSignedToken({
            token: config.token,
            pathname: reference.pathname,
            operations: ["put"],
            maximumSizeInBytes: input.sizeBytes,
            allowedContentTypes: [input.mimeType],
            validUntil,
            abortSignal: AbortSignal.timeout(config.readTimeoutMs),
          }),
        );
      if (
        `store_${parseStoreIdFromDelegationToken(signed.delegationToken)}` !==
        config.storeId
      )
        throw new Error("Unexpected delegated store");
      const { presignedUrl } = await presignUrl(signed, {
        operation: "put",
        pathname: reference.pathname,
        access: "private",
        maximumSizeInBytes: input.sizeBytes,
        allowedContentTypes: [input.mimeType],
        validUntil,
        allowOverwrite: false,
        addRandomSuffix: false,
        // Deliberately no callback: no app route is unlocked by this probe.
      });
      const url = ownedUrl(presignedUrl);
      if (
        url.hostname !== "vercel.com" ||
        url.pathname !== "/api/blob/" ||
        url.searchParams.get("pathname") !== reference.pathname
      )
        throw new Error("Unexpected signed upload destination");
      return url.toString();
    },
    async request(url, { method, bytes, headers }) {
      const response = await fetch(ownedUrl(url), {
        method,
        redirect: "error",
        credentials: "omit",
        ...(bytes ? { body: new Blob([new Uint8Array(bytes)]) } : {}),
        headers: {
          ...(headers?.contentType
            ? { "Content-Type": headers.contentType }
            : {}),
          ...(headers?.blobContentType
            ? { "x-content-type": headers.blobContentType }
            : {}),
        },
        signal: AbortSignal.timeout(30000),
      });
      // Never log/parse an unbounded provider body or a signed URL.
      // Cancellation failure must not erase an already observed HTTP status.
      await response.body?.cancel().catch(() => undefined);
      return {
        httpStatus: response.status,
        responseContentType: classifyMimeType(
          response.headers.get("content-type"),
        ),
      };
    },
    async observe(reference) {
      ownedReference(reference);
      const response = await get(reference.pathname, {
        token: config.token,
        access: "private",
        useCache: false,
        abortSignal: AbortSignal.timeout(config.readTimeoutMs),
      });
      if (response === null) return { state: "absent" };
      if (response.statusCode !== 200) return { state: "unavailable" };
      // Read only metadata, cancel the body immediately: no second 25 MiB
      // buffer or parser run. The positive app reader still verifies the hash.
      await response.stream.cancel();
      const length = response.headers.get("content-length");
      const size =
        length !== null && /^\d{1,16}$/.test(length) ? Number(length) : NaN;
      if (
        response.blob.pathname !== reference.pathname ||
        !Number.isSafeInteger(size) ||
        size !== response.blob.size
      )
        return { state: "invalid_metadata" };
      if (size > documentMaxSizeBytes) return { state: "size_exceeds_limit" };
      return {
        state: "present",
        storedContentType: classifyMimeType(
          response.headers.get("content-type"),
        ),
        declaredSizeBytes: size,
      };
    },
    read: (reference, input) =>
      objects.read(acceptanceContext, ownedReference(reference), input),
    remove: (reference) =>
      objects.remove(acceptanceContext, ownedReference(reference)),
    validatePdf,
    anonymousUrl: (reference) =>
      `${plainUrl(ownedReference(reference))}?cache=0`,
    changePath(url, reference) {
      const changed = ownedUrl(url);
      ownedReference(reference);
      changed.searchParams.set("pathname", reference.pathname);
      return changed.toString();
    },
  };
}
