import "server-only";

import { summarizeLayoutCapacity } from "@/domain/space/calculations";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { LayoutRepository } from "@/server/repositories/layout-repository";

export async function getCurrentStoreLayout(context: AuthorizedStoreContext) {
  const repository = new LayoutRepository(await getAppDb());
  const layout = await repository.getLatestForStore(context);

  return {
    layout,
    summary: layout ? summarizeLayoutCapacity(layout) : null,
  };
}

