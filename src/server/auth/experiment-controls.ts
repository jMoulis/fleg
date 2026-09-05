import "server-only";

import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { controlStoresBelongToOrganization } from "@/domain/experiments/store-scope";
import { experimentControlStoreOptionSchema } from "@/domain/experiments/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import {
  requireAuthorizedStoreSet,
  requireStoreContext,
} from "@/server/auth/store-context";
import { listAuthorizedStores } from "@/server/services/store-access-service";

function canCompareControlStores(context: AuthorizedStoreContext): boolean {
  return (
    context.permissions.includes("analytics.read") &&
    context.permissions.includes("experiments.compare_stores") &&
    context.permissions.includes("analytics.compare_stores")
  );
}

export async function listExperimentControlStoreOptions(input: {
  primaryContext: AuthorizedStoreContext;
  requestHeaders: Headers;
}) {
  if (!canCompareControlStores(input.primaryContext)) return [];
  const candidates = (await listAuthorizedStores(input.requestHeaders)).filter(
    (store) =>
      store.organizationId === input.primaryContext.organizationId &&
      store.id !== input.primaryContext.storeId,
  );
  const options = await Promise.all(
    candidates.map(async (store) => {
      try {
        await requireStoreContext(
          store.id,
          ["experiments.read", "analytics.read"],
          input.requestHeaders,
        );
        return experimentControlStoreOptionSchema.parse(store);
      } catch (error) {
        if (error instanceof StoreAccessDeniedError) return null;
        throw error;
      }
    }),
  );

  return options.filter(
    (option): option is NonNullable<(typeof options)[number]> =>
      option !== null,
  );
}

export async function requireExperimentControlContexts(input: {
  primaryContext: AuthorizedStoreContext;
  controlStoreIds: string[];
  requestHeaders: Headers;
}): Promise<AuthorizedStoreContext[]> {
  if (input.controlStoreIds.length === 0) return [];
  if (!canCompareControlStores(input.primaryContext)) {
    throw new StoreAccessDeniedError();
  }

  const controlContexts = await requireAuthorizedStoreSet(
    input.controlStoreIds,
    ["experiments.read", "analytics.read"],
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
