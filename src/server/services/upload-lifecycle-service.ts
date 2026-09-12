import "server-only";
import { getAppDb, getAuthDb, getMongoClient } from "@/server/db/mongo-client";
import { parsePrivateStorageConfig } from "@/server/storage/config";
import { VercelPrivateUploadObjectStore } from "@/server/storage/private-upload-object";
import { UploadLifecycleRepository } from "@/server/repositories/upload-lifecycle-repository";

export async function getUploadLifecycle() {
  const config = parsePrivateStorageConfig(process.env);
  const [db, authDb, client] = await Promise.all([
    getAppDb(),
    getAuthDb(),
    getMongoClient(),
  ]);
  return new UploadLifecycleRepository(
    db,
    authDb,
    client,
    config,
    new VercelPrivateUploadObjectStore(config),
  );
}
