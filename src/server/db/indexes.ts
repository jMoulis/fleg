import "server-only";

import { getAppDb } from "@/server/db/mongo-client";

export async function ensureFoundationIndexes(): Promise<void> {
  await getAppDb();
}
