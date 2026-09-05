import "server-only";

import { authorizeStoreAccess } from "@/domain/stores/authorization";
import {
  storeIdSchema,
  type AuthorizedStoreContext,
  type StorePermission,
} from "@/domain/stores/schemas";
import { getAuth } from "@/server/auth/auth";
import { requireSession } from "@/server/auth/session";
import { getAppDb } from "@/server/db/mongo-client";
import { StoreRepository } from "@/server/repositories/store-repository";

async function getOrganizationRole(
  organizationId: string,
  requestHeaders: Headers,
): Promise<string | null> {
  const auth = await getAuth();
  const organization = await auth.api.getFullOrganization({
    headers: requestHeaders,
    query: { organizationId },
  });

  if (!organization) {
    return null;
  }

  const session = await requireSession(requestHeaders);
  return (
    organization.members.find((member) => member.userId === session.user.id)?.role ??
    null
  );
}

export async function requireOrganizationMembership(
  organizationId: string,
  requestHeaders: Headers,
) {
  const role = await getOrganizationRole(organizationId, requestHeaders);

  if (!role) {
    throw new Error("Organisation introuvable ou accès refusé");
  }

  return { organizationId, role };
}

export async function requireStoreContext(
  storeIdInput: string,
  requiredPermissions: StorePermission[] = [],
  requestHeaders: Headers,
): Promise<AuthorizedStoreContext> {
  const storeId = storeIdSchema.safeParse(storeIdInput);

  if (!storeId.success) {
    return authorizeStoreAccess({
      userId: "invalid",
      store: null,
      organizationRole: null,
      membership: null,
      requiredPermissions,
    });
  }

  const session = await requireSession(requestHeaders);
  const repository = new StoreRepository(await getAppDb());
  const store = await repository.findIdentityById(storeId.data);

  if (!store) {
    return authorizeStoreAccess({
      userId: session.user.id,
      store: null,
      organizationRole: null,
      membership: null,
      requiredPermissions,
    });
  }

  const [organizationRole, membership] = await Promise.all([
    getOrganizationRole(store.organizationId, requestHeaders),
    repository.findMembership(store, session.user.id),
  ]);

  return authorizeStoreAccess({
    userId: session.user.id,
    store,
    organizationRole,
    membership,
    requiredPermissions,
  });
}

export async function requireAuthorizedStoreSet(
  storeIds: string[],
  requiredPermissions: StorePermission | StorePermission[],
  requestHeaders: Headers,
): Promise<AuthorizedStoreContext[]> {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  return Promise.all(
    storeIds.map((storeId) =>
      requireStoreContext(storeId, permissions, requestHeaders),
    ),
  );
}
