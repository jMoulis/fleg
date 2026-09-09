import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildOrderSuggestionScope(
  context: AuthorizedStoreContext,
) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  };
}
