import "server-only";
import { timingSafeEqual } from "node:crypto";
import * as z from "zod";
import { storeIdSchema } from "@/domain/stores/schemas";

const configSchema = z.object({
  CRON_SECRET: z.string().min(32).max(256),
  // Explicit service-principal scope. This job never gains access to new stores
  // from a request parameter, client cookie, or a bucket-wide listing.
  BLOB_MAINTENANCE_STORE_IDS: z
    .string()
    .transform((value) => value.split(",").map((id) => id.trim()))
    .pipe(z.array(storeIdSchema).min(1).max(100)),
});

export function storageMaintenanceConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const config = configSchema.parse(env);
  return {
    secret: config.CRON_SECRET,
    storeIds: [...new Set(config.BLOB_MAINTENANCE_STORE_IDS)],
  };
}

export function matchesMaintenanceSecret(
  header: string | null,
  secret: string,
) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
