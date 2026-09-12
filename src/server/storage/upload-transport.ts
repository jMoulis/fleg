import "server-only";
import * as z from "zod";
import {
  issueSignedToken,
  parseStoreIdFromDelegationToken,
  presignUrl,
} from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import {
  providerCompletionSchema,
  signedUploadSchema,
  uploadAuthorizationLifetimeMs,
  uploadCorrelationSchema,
  uploadGrantSchema,
  type ProviderCompletion,
  type UploadGrant,
} from "@/domain/attachments/upload-transport";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  requireUploadIntentConfig,
  type UploadIntentConfig,
} from "@/server/storage/config";
import { scopedObjectPrefix } from "@/server/storage/private-object-reader";

export type UploadTransportConfig = UploadIntentConfig & {
  callbackUrl?: string;
  webhookPublicKey?: string;
};

const signedTokenSchema = z.object({
  delegationToken: z.string().min(1).max(8192),
  clientSigningToken: z.string().min(1).max(2048),
  validUntil: z.number().int().positive(),
});

export function requireUploadTransportConfig(
  env: Record<string, string | undefined> = process.env,
): UploadTransportConfig {
  // Live dev acceptance verified MIME/size/path/overwrite/private reads. This
  // opt-in is NOT a production release: issued tombstones still retain quota.
  if (
    env.BLOB_DEV_UPLOADS_ENABLED !== "true" ||
    env.VERCEL_ENV === "production"
  )
    throw new PrivateStorageError(
      "STORAGE_DISABLED",
      "Les envois privés ne sont pas activés sur cet environnement",
    );
  const config = requireUploadIntentConfig(env);
  if (config.storeId !== "store_5MOJSflf0L273Hz3")
    throw new PrivateStorageError(
      "STORAGE_DISABLED",
      "Les essais d’envoi sont réservés au stockage de développement",
    );
  // Development uses explicit, authenticated verification after the PUT. No
  // public callback origin/key is invented, and no browser receipt is trusted.
  return config;
}

export function privateUploadsAvailable() {
  try {
    requireUploadTransportConfig();
    return true;
  } catch {
    return false;
  }
}

export class VercelUploadTransport {
  constructor(private readonly config: UploadTransportConfig) {}

  async authorize(context: AuthorizedStoreContext, rawGrant: UploadGrant) {
    if (!context.permissions.includes("attachments.write"))
      throw new StoreAccessDeniedError();
    const grant = uploadGrantSchema.parse(rawGrant);
    const issuedAt = Date.parse(grant.issuedAt);
    const validUntil = Date.parse(grant.validUntil);
    if (
      grant.storage.storeId !== this.config.storeId ||
      grant.storage.namespace !== this.config.namespace ||
      !grant.storage.pathname.startsWith(
        scopedObjectPrefix(context, this.config.namespace),
      ) ||
      validUntil <= Date.now() ||
      issuedAt > Date.now() ||
      validUntil - issuedAt !== uploadAuthorizationLifetimeMs
    )
      throw new PrivateStorageError(
        "UPLOAD_CONFLICT",
        "Autorisation d’envoi invalide ou expirée",
      );
    try {
      const signedToken = signedTokenSchema.parse(
        await issueSignedToken({
          token: this.config.token,
          pathname: grant.storage.pathname,
          operations: ["put"],
          maximumSizeInBytes: grant.input.sizeBytes,
          allowedContentTypes: [grant.input.mimeType],
          validUntil,
          abortSignal: AbortSignal.timeout(this.config.readTimeoutMs),
        }),
      );
      if (
        `store_${parseStoreIdFromDelegationToken(signedToken.delegationToken)}` !==
          this.config.storeId ||
        signedToken.validUntil !== validUntil
      )
        throw new Error("Unexpected provider resource or expiry");
      const { presignedUrl } = await presignUrl(signedToken, {
        operation: "put",
        pathname: grant.storage.pathname,
        access: "private",
        maximumSizeInBytes: grant.input.sizeBytes,
        allowedContentTypes: [grant.input.mimeType],
        validUntil,
        allowOverwrite: false,
        addRandomSuffix: false,
        ...(this.config.callbackUrl
          ? {
              onUploadCompleted: {
                callbackUrl: this.config.callbackUrl,
                tokenPayload: JSON.stringify({
                  intentId: grant.intentId,
                  attemptId: grant.attemptId,
                }),
              },
            }
          : {}),
      });
      // Signing material and provider errors must never reach a client or audit.
      // `put` also covers multipart in SDK 2.8.0: this is NOT a PUT-only or
      // single-use capability. Keep the release gate until cleanup handles it.
      return signedUploadSchema.parse({
        method: "PUT",
        url: presignedUrl,
        contentType: grant.input.mimeType,
        headers: { "x-content-type": grant.input.mimeType },
        validUntil: grant.validUntil,
      });
    } catch {
      throw new PrivateStorageError(
        "STORAGE_UNAVAILABLE",
        "L’autorisation d’envoi est temporairement indisponible",
      );
    }
  }

  async verifyCompletion(
    request: Request,
    body: unknown,
  ): Promise<ProviderCompletion> {
    try {
      if (!this.config.webhookPublicKey)
        throw new Error("Callback not configured");
      providerCompletionSchema.parse(body);
      // Retain the original property order and unknown signed provider fields.
      const original = body as CompletionEnvelope;
      await handleUploadPresigned({
        request,
        body: original,
        webhookPublicKey: this.config.webhookPublicKey,
        getSignedToken: async () => {
          throw new Error("Callbacks cannot issue tokens");
        },
      });
      const correlation = uploadCorrelationSchema.parse(
        JSON.parse(original.payload.tokenPayload),
      );
      return {
        ...correlation,
        pathname: original.payload.blob.pathname,
        url: original.payload.blob.url,
        contentType: original.payload.blob.contentType,
      };
    } catch {
      // Includes signature/JSON errors, never raw provider payload or credentials.
      throw new PrivateStorageError(
        "UPLOAD_CALLBACK_INVALID",
        "Notification d’envoi invalide",
      );
    }
  }
}

type CompletionEnvelope = ReturnType<typeof providerCompletionSchema.parse>;
