import {
  authorizedStoreContextSchema,
  storePermissionValues,
  type AuthorizedStoreContext,
  type StorePermission,
  type StoreRole,
} from "@/domain/stores/schemas";

export interface StoreIdentity {
  id: string;
  organizationId: string;
  active: boolean;
}

export interface StoreMembershipIdentity {
  organizationId: string;
  storeId: string;
  userId: string;
  role: Exclude<StoreRole, "organization_admin">;
  permissions: StorePermission[];
  active: boolean;
}

export class StoreAccessDeniedError extends Error {
  readonly code = "STORE_NOT_FOUND_OR_FORBIDDEN";

  constructor() {
    super("Magasin introuvable ou accès refusé");
    this.name = "StoreAccessDeniedError";
  }
}

interface AuthorizeStoreAccessInput {
  userId: string;
  store: StoreIdentity | null;
  organizationRole: string | null;
  membership: StoreMembershipIdentity | null;
  requiredPermissions?: StorePermission[];
}

export function authorizeStoreAccess({
  userId,
  store,
  organizationRole,
  membership,
  requiredPermissions = [],
}: AuthorizeStoreAccessInput): AuthorizedStoreContext {
  if (!store?.active || !organizationRole) {
    throw new StoreAccessDeniedError();
  }

  if (organizationRole === "owner" || organizationRole === "admin") {
    return authorizedStoreContextSchema.parse({
      userId,
      organizationId: store.organizationId,
      storeId: store.id,
      role: "organization_admin",
      permissions: storePermissionValues,
    });
  }

  const membershipMatches =
    membership?.active === true &&
    membership.userId === userId &&
    membership.storeId === store.id &&
    membership.organizationId === store.organizationId;

  if (!membershipMatches) {
    throw new StoreAccessDeniedError();
  }

  const hasEveryPermission = requiredPermissions.every((permission) =>
    membership.permissions.includes(permission),
  );

  if (!hasEveryPermission) {
    throw new StoreAccessDeniedError();
  }

  return authorizedStoreContextSchema.parse({
    userId,
    organizationId: store.organizationId,
    storeId: store.id,
    role: membership.role,
    permissions: membership.permissions,
  });
}
