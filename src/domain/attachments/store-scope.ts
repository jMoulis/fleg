import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildAttachmentScope(context: AuthorizedStoreContext) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  };
}
