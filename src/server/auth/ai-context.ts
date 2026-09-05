import "server-only";

import { buildAuthorizedAiNetworkScope } from "@/domain/ai/authorization";
import {
  requireAuthorizedStoreSet,
  requireStoreContext,
} from "@/server/auth/store-context";

export async function requireStoreAiContext(
  storeId: string,
  requestHeaders: Headers,
) {
  return requireStoreContext(
    storeId,
    ["ai.use", "analytics.read"],
    requestHeaders,
  );
}

export async function requireNetworkAiContexts(
  storeIds: string[],
  requestHeaders: Headers,
) {
  const contexts = await requireAuthorizedStoreSet(
    storeIds,
    ["ai.use", "analytics.read", "analytics.compare_stores"],
    requestHeaders,
  );

  buildAuthorizedAiNetworkScope(contexts);
  return contexts;
}
