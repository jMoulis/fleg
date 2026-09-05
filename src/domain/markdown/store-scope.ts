import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildMarkdownScope(context: AuthorizedStoreContext) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  };
}
