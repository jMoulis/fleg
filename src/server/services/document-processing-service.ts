import "server-only";
import { z } from "zod";
import { getAppDb, getAuthDb, getMongoClient } from "@/server/db/mongo-client";
import {
  DocumentProcessingRepository,
  processOneDocument,
} from "@/server/repositories/document-processing-repository";
import { DocumentSourceRepository } from "@/server/repositories/document-source-repository";
import { extractPdfText } from "@/server/storage/pdf-validator";
import { VercelPrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { parsePrivateStorageConfig } from "@/server/storage/config";
import { PrivateStorageError } from "@/domain/attachments/private-storage";
import { storeIdSchema } from "@/domain/stores/schemas";

export function documentProcessingConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.DOCUMENT_PROCESSING_ENABLED !== "true") return null;
  const storeIds = z
    .array(storeIdSchema)
    .min(1)
    .max(4)
    .parse(env.DOCUMENT_PROCESSING_STORE_IDS?.split(",").map((v) => v.trim()));
  return { storeIds: [...new Set(storeIds)] };
}
export function requireDocumentProcessing(storeId: string) {
  if (!documentProcessingConfig()?.storeIds.includes(storeId))
    throw new PrivateStorageError(
      "STORAGE_DISABLED",
      "Traitement PDF non activé pour ce magasin",
    );
}
// Presentation only: mutations still enforce admission and authorization.
export function documentProcessingAvailable(storeId: string): boolean {
  try {
    return documentProcessingConfig()?.storeIds.includes(storeId) ?? false;
  } catch {
    return false;
  }
}
export async function getDocumentProcessingRepository() {
  const [db, authDb, client] = await Promise.all([
    getAppDb(),
    getAuthDb(),
    getMongoClient(),
  ]);
  return new DocumentProcessingRepository(db, authDb, client);
}
export async function runDocumentProcessingBatch(storeIds: string[]) {
  // Callers supply only the validated service-principal allowlist, never request data.
  const ids = z.array(storeIdSchema).min(1).max(4).parse(storeIds);
  const [db, repository] = await Promise.all([
    getAppDb(),
    getDocumentProcessingRepository(),
  ]);
  const objects = new VercelPrivateUploadObjectStore(
    parsePrivateStorageConfig(process.env),
  );
  const sources = new DocumentSourceRepository(db);
  let processed = 0;
  for (const id of ids) {
    const { ObjectId } = await import("mongodb");
    const store = await db
      .collection("stores")
      .findOne(
        { _id: new ObjectId(id), active: true },
        { projection: { organizationId: 1 } },
      );
    if (!store) continue;
    const outcome = await processOneDocument({
      repository,
      scope: {
        storeId: id,
        organizationId: z.string().min(1).parse(store.organizationId),
      },
      read: async (context, sourceId) =>
        (await sources.content(context, sourceId, objects)).bytes,
      extract: extractPdfText,
    });
    if (outcome.processed) processed++;
  }
  return { processed };
}
