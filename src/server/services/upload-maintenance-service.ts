import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  authorizedStoreContextSchema,
  storeIdSchema,
} from "@/domain/stores/schemas";
import * as z from "zod";
import type { IntentDocument } from "@/server/repositories/upload-intent-repository";
import type { UploadLifecycleRepository } from "@/server/repositories/upload-lifecycle-repository";
import type { PrivateStorageConfig } from "@/server/storage/config";

// One invocation handles at most 20 intents / 240s. Leases make overlapping cron
// invocations safe; the persisted due date and index drain the oldest work first.
export async function runUploadMaintenanceBatch(input: {
  db: Db;
  lifecycle: Pick<UploadLifecycleRepository, "reconcile">;
  storage: PrivateStorageConfig;
  authorizedStoreIds: string[];
  requestId: string;
}) {
  const storeIds = z
    .array(storeIdSchema)
    .min(1)
    .max(100)
    .parse(input.authorizedStoreIds);
  const started = Date.now();
  const candidates = await input.db
    .collection<IntentDocument>("uploadIntents")
    .find(
      {
        storeId: { $in: storeIds.map((id) => new ObjectId(id)) },
        "storage.storeId": input.storage.storeId,
        "storage.namespace": input.storage.namespace,
        reconcileAfter: { $lte: new Date() },
        $or: [
          {
            state: {
              $in: [
                "reserved",
                "uploaded",
                "cancelled",
                "rejected",
                "deleting",
              ],
            },
          },
          { state: "deleted", authorization: { $exists: true } },
          { cleanupRequired: true },
        ],
      },
      { projection: { organizationId: 1, storeId: 1 } },
    )
    .sort({ reconcileAfter: 1, _id: 1 })
    .limit(20)
    .toArray();
  let processed = 0;
  let retries = 0;
  for (const candidate of candidates) {
    if (Date.now() - started >= 240_000) break;
    const context = authorizedStoreContextSchema.parse({
      userId: "system:storage-maintenance",
      organizationId: candidate.organizationId,
      storeId: candidate.storeId.toHexString(),
      role: "organization_admin",
      permissions: ["stores.read", "attachments.write"],
    });
    // Authorization comes from the cron service's explicit store-id allowlist.
    // Linking additionally reauthorizes the original human author in reconcile.
    const result = await input.lifecycle.reconcile(context, input.requestId);
    if (result.processed) {
      processed++;
      if (result.outcome === "retry") retries++;
    }
  }
  return { examined: candidates.length, processed, retries };
}
