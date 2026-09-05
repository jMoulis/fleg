import { buildNetworkScope } from "@/domain/network/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const storeToolPermissions = ["ai.use", "analytics.read"] as const;
const networkToolPermissions = [
  ...storeToolPermissions,
  "analytics.compare_stores",
] as const;

function hasPermissions(
  context: AuthorizedStoreContext,
  permissions: readonly (typeof networkToolPermissions)[number][],
): boolean {
  return permissions.every((permission) =>
    context.permissions.includes(permission),
  );
}

export function assertStoreAiReadAccess(
  context: AuthorizedStoreContext,
): void {
  if (!hasPermissions(context, storeToolPermissions)) {
    throw new StoreAccessDeniedError();
  }
}

export function buildAuthorizedAiNetworkScope(
  contexts: AuthorizedStoreContext[],
) {
  if (
    contexts.length === 0 ||
    contexts.some((context) => !hasPermissions(context, networkToolPermissions))
  ) {
    throw new StoreAccessDeniedError();
  }

  return buildNetworkScope(contexts);
}
