import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildInventoryScope(context: AuthorizedStoreContext) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  };
}
