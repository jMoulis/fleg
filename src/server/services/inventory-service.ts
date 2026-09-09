import "server-only";

import type {
  InventoryCountCommitInput,
  InventoryCountCreateInput,
  InventoryCountUpdateInput,
} from "@/domain/inventory/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { InventoryRepository } from "@/server/repositories/inventory-repository";
import { ProductRepository } from "@/server/repositories/product-repository";

export async function getInventoryWorkspace(input: {
  context: AuthorizedStoreContext;
  businessDate: string;
}) {
  const db = await getAppDb();
  const products = await new ProductRepository(db).listOptions(input.context);
  return new InventoryRepository(db).getWorkspace({ ...input, products });
}

export async function createInventoryCount(input: {
  context: AuthorizedStoreContext;
  createInput: InventoryCountCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new InventoryRepository(db, client).createDraft(input);
}

export async function saveInventoryCount(input: {
  context: AuthorizedStoreContext;
  countId: string;
  updateInput: InventoryCountUpdateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new InventoryRepository(db, client).saveDraft(input);
}

export async function commitInventoryCount(input: {
  context: AuthorizedStoreContext;
  countId: string;
  commitInput: InventoryCountCommitInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new InventoryRepository(db, client).commitDraft({
    context: input.context,
    countId: input.countId,
    basedOnRevision: input.commitInput.basedOnRevision,
    idempotencyKey: input.commitInput.idempotencyKey,
    requestId: input.requestId,
  });
}
