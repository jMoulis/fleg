import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildCommercialEventScope(context: AuthorizedStoreContext) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  } as const;
}
