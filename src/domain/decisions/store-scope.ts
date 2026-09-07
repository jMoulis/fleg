import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export function buildRecommendationFollowUpScope(
  context: AuthorizedStoreContext,
) {
  return {
    organizationId: context.organizationId,
    storeId: context.storeId,
  } as const;
}
