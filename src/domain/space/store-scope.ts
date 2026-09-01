import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildLayoutVersionScope(context: AuthorizedStoreContext) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  } as const;
}
