import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildExperimentScope(context: AuthorizedStoreContext) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  } as const;
}

export function controlStoresBelongToOrganization(input: {
  primaryContext: AuthorizedStoreContext;
  controlContexts: AuthorizedStoreContext[];
}): boolean {
  return input.controlContexts.every(
    (context) => context.organizationId === input.primaryContext.organizationId,
  );
}

export function controlStoreSetMatches(input: {
  primaryContext: AuthorizedStoreContext;
  controlContexts: AuthorizedStoreContext[];
  requestedStoreIds: string[];
}): boolean {
  const requested = [...input.requestedStoreIds].sort();
  const authorized = input.controlContexts
    .map(({ storeId }) => storeId)
    .sort();

  return (
    requested.length === authorized.length &&
    new Set(requested).size === requested.length &&
    !requested.includes(input.primaryContext.storeId) &&
    requested.every((storeId, index) => storeId === authorized[index]) &&
    input.controlContexts.every(
      (context) =>
        context.organizationId === input.primaryContext.organizationId &&
        context.userId === input.primaryContext.userId,
    )
  );
}
