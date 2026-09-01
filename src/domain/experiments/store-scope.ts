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
