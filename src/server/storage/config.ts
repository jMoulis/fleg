import "server-only";
import * as z from "zod";
import {
  blobNamespaceSchema,
  blobStoreIdSchema,
  PrivateStorageError,
} from "@/domain/attachments/private-storage";

// Approved FLEG resources. Do not silently use the production token locally.
const stores = {
  production: "store_k3DcIwSL9uBZuhhH",
  nonProduction: "store_5MOJSflf0L273Hz3",
};
const emptyOptional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );
const configSchema = z.object({
  BLOB_INTENTS_ENABLED: z.enum(["true", "false"]).default("false"),
  BLOB_STORE_ID: blobStoreIdSchema,
  BLOB_NAMESPACE: blobNamespaceSchema,
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  BLOB_STORE_QUOTA_BYTES: emptyOptional(
    z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ),
  BLOB_ENV_QUOTA_BYTES: emptyOptional(
    z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ),
  BLOB_STORE_QUOTA_OBJECTS: emptyOptional(
    z.coerce.number().int().positive().max(1000000),
  ),
  BLOB_ENV_QUOTA_OBJECTS: emptyOptional(
    z.coerce.number().int().positive().max(1000000),
  ),
  BLOB_READ_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(15000),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
});
export type PrivateStorageConfig = {
  storeId: string;
  namespace: string;
  token: string;
  readTimeoutMs: number;
};
export type UploadIntentConfig = PrivateStorageConfig & {
  storeQuotaBytes: number;
  environmentQuotaBytes: number;
  storeQuotaObjects: number;
  environmentQuotaObjects: number;
};

export function parsePrivateStorageConfig(
  env: Record<string, string | undefined>,
): PrivateStorageConfig {
  const result = configSchema.safeParse(env);
  // Do not expose Zod/provider errors containing credential values.
  if (!result.success)
    throw new PrivateStorageError(
      "STORAGE_CONFIGURATION",
      "Configuration du stockage privé incomplète",
    );
  const value = result.data;
  const production = value.VERCEL_ENV === "production";
  const expectedStore = production ? stores.production : stores.nonProduction;
  const prefix = production
    ? "production-"
    : value.VERCEL_ENV === "preview"
      ? "preview-"
      : "local-";
  // SDK 2.8.0 resolves an explicitly supplied RW token before OIDC. Pin that
  // credential to the approved resource; no ambient SDK credential fallback.
  const tokenStore = /^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9]+$/.exec(
    value.BLOB_READ_WRITE_TOKEN,
  )?.[1];
  if (
    value.BLOB_STORE_ID !== expectedStore ||
    `store_${tokenStore}` !== expectedStore ||
    !value.BLOB_NAMESPACE.startsWith(prefix)
  ) {
    throw new PrivateStorageError(
      "STORAGE_CONFIGURATION",
      "Le stockage privé ne correspond pas à cet environnement",
    );
  }
  return {
    storeId: value.BLOB_STORE_ID,
    namespace: value.BLOB_NAMESPACE,
    token: value.BLOB_READ_WRITE_TOKEN,
    readTimeoutMs: value.BLOB_READ_TIMEOUT_MS,
  };
}

export function requireUploadIntentConfig(
  env: Record<string, string | undefined>,
): UploadIntentConfig {
  if (env.BLOB_INTENTS_ENABLED !== "true")
    throw new PrivateStorageError(
      "STORAGE_DISABLED",
      "La préparation des uploads privés n’est pas activée",
    );
  const base = parsePrivateStorageConfig(env);
  const value = configSchema.parse(env);
  if (
    !value.BLOB_STORE_QUOTA_BYTES ||
    !value.BLOB_ENV_QUOTA_BYTES ||
    value.BLOB_STORE_QUOTA_BYTES > value.BLOB_ENV_QUOTA_BYTES ||
    !value.BLOB_STORE_QUOTA_OBJECTS ||
    !value.BLOB_ENV_QUOTA_OBJECTS ||
    value.BLOB_STORE_QUOTA_OBJECTS > value.BLOB_ENV_QUOTA_OBJECTS
  ) {
    throw new PrivateStorageError(
      "STORAGE_CONFIGURATION",
      "Les plafonds de stockage doivent être configurés explicitement",
    );
  }
  return {
    ...base,
    storeQuotaBytes: value.BLOB_STORE_QUOTA_BYTES,
    environmentQuotaBytes: value.BLOB_ENV_QUOTA_BYTES,
    storeQuotaObjects: value.BLOB_STORE_QUOTA_OBJECTS,
    environmentQuotaObjects: value.BLOB_ENV_QUOTA_OBJECTS,
  };
}
