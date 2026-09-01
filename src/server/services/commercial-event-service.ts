import "server-only";

import { endcapOptionSchema } from "@/domain/commercial-events/schemas";
import type {
  CommercialEventCreateInput,
  CommercialEventUpdateInput,
} from "@/domain/commercial-events/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { CommercialEventRepository } from "@/server/repositories/commercial-event-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { getCurrentStoreLayout } from "@/server/services/layout-service";

export async function getCommercialEventWorkspace(
  context: AuthorizedStoreContext,
) {
  const db = await getAppDb();
  const [{ layout }, products, events] = await Promise.all([
    getCurrentStoreLayout(context),
    new ProductRepository(db).listOptions(context),
    new CommercialEventRepository(db).listForStore(context),
  ]);

  return {
    layout,
    endcaps:
      layout?.fixtures
        .filter((fixture) => fixture.type === "endcap")
        .map((fixture) =>
          endcapOptionSchema.parse({
            id: fixture.id,
            label: fixture.name,
            commercialRole: fixture.commercialRole,
          }),
        ) ?? [],
    products,
    events,
  };
}

export async function listCommercialEvents(
  context: AuthorizedStoreContext,
) {
  return new CommercialEventRepository(await getAppDb()).listForStore(context);
}

export async function createCommercialEvent(input: {
  context: AuthorizedStoreContext;
  createInput: CommercialEventCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new CommercialEventRepository(db, client).create(input);
}

export async function updateCommercialEvent(input: {
  context: AuthorizedStoreContext;
  eventId: string;
  updateInput: CommercialEventUpdateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new CommercialEventRepository(db, client).update(input);
}
