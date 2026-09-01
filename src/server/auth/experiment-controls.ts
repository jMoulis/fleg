import "server-only";

import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { controlStoresBelongToOrganization } from "@/domain/experiments/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { requireAuthorizedStoreSet } from "@/server/auth/store-context";

export async function requireExperimentControlContexts(input: {
  primaryContext: AuthorizedStoreContext;
  controlStoreIds: string[];
  requestHeaders: Headers;
}): Promise<AuthorizedStoreContext[]> {
  if (input.controlStoreIds.length === 0) return [];
  if (
    !input.primaryContext.permissions.includes("experiments.compare_stores")
  ) {
    throw new StoreAccessDeniedError();
  }

  const controlContexts = await requireAuthorizedStoreSet(
    input.controlStoreIds,
    "experiments.read",
    input.requestHeaders,
  );
  if (
    !controlStoresBelongToOrganization({
      primaryContext: input.primaryContext,
      controlContexts,
    })
  ) {
    throw new StoreAccessDeniedError();
  }

  return controlContexts;
}
