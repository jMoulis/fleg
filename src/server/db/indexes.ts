import "server-only";

import { getAppDb } from "@/server/db/mongo-client";
import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";

export async function ensureFoundationIndexes(): Promise<void> {
  const db = await getAppDb();
  await ensureFoundationIndexesForDb(db);
}
