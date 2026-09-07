import "server-only";

import type { ProductSpacePolicySetUpdateInput } from "@/domain/space/product-space-policy-schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { ProductSpacePolicyRepository } from "@/server/repositories/product-space-policy-repository";

export async function getProductSpacePolicySet(
  context: AuthorizedStoreContext,
) {
  return new ProductSpacePolicyRepository(await getAppDb()).getForStore(
    context,
  );
}

export async function updateProductSpacePolicySet(input: {
  context: AuthorizedStoreContext;
  updateInput: ProductSpacePolicySetUpdateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new ProductSpacePolicyRepository(db, client).updateForStore(input);
}
