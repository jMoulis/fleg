import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAppDb, getAuthDb, getMongoClient } from "@/server/db/mongo-client";
import { CommercialBriefRepository } from "@/server/repositories/commercial-brief-repository";
import {
  commercialBriefConfig,
  extractCommercialBrief,
  reservedBriefCost,
} from "./commercial-brief-provider";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";

export async function getCommercialBriefRepository() {
  const [db, authDb, client] = await Promise.all([
    getAppDb(),
    getAuthDb(),
    getMongoClient(),
  ]);
  return new CommercialBriefRepository(db, authDb, client);
}
export function requireCommercialBrief(storeId: string) {
  const config = commercialBriefConfig();
  if (!config?.storeIds.includes(storeId))
    throw new PrivateStorageError(
      "STORAGE_DISABLED",
      "Analyse commerciale non activée pour ce magasin",
    );
  return config;
}
export function commercialBriefAvailable(storeId: string) {
  try {
    return commercialBriefConfig()?.storeIds.includes(storeId) ?? false;
  } catch {
    return false;
  }
}
export function commercialBriefEstimate(storeId: string) {
  try {
    const config = requireCommercialBrief(storeId);
    return {
      model: config.model,
      reservedUsdCents: reservedBriefCost(config),
      dailyBudgetUsdCents: config.dailyBudgetCents,
    };
  } catch {
    return null;
  }
}

export async function runCommercialBriefBatch() {
  const config = commercialBriefConfig();
  if (!config) return { processed: 0 };
  const [db, repository] = await Promise.all([
    getAppDb(),
    getCommercialBriefRepository(),
  ]);
  for (const storeId of config.storeIds) {
    const store = await db
      .collection("stores")
      .findOne(
        { _id: new ObjectId(storeId), active: true },
        { projection: { organizationId: 1 } },
      );
    if (!store) continue;
    const job = await repository.claim({
      storeId,
      organizationId: z.string().min(1).parse(store.organizationId),
    });
    if (!job) continue;
    try {
      await repository.workerSource(job);
      // Keep the explicitly admitted model/rates; never substitute a new model.
      const result = await extractCommercialBrief(job.pages, job.config);
      await repository.complete(job, result);
    } catch (error) {
      await repository.fail(
        job,
        error instanceof StoreAccessDeniedError ||
          error instanceof PrivateStorageError
          ? "source_unavailable"
          : "provider_unavailable",
      );
    }
    return { processed: 1 }; // At most one paid request per scheduled invocation.
  }
  return { processed: 0 };
}
