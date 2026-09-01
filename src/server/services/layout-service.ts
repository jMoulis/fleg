import "server-only";

import { summarizeLayoutCapacity } from "@/domain/space/calculations";
import type { LayoutVersionCreateInput } from "@/domain/space/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { LayoutRepository } from "@/server/repositories/layout-repository";

export async function getCurrentStoreLayout(context: AuthorizedStoreContext) {
  const repository = new LayoutRepository(await getAppDb());
  const layout = await repository.getLatestForStore(context);

  return {
    layout,
    summary: layout ? summarizeLayoutCapacity(layout) : null,
  };
}

export async function createStoreLayoutVersion(input: {
  context: AuthorizedStoreContext;
  createInput: LayoutVersionCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const layout = await new LayoutRepository(db, client).createNextVersion(input);

  return {
    layout,
    summary: summarizeLayoutCapacity(layout),
  };
}

