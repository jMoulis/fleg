import { describe, expect, it } from "vitest";

import {
  authorizeStoreAccess,
  StoreAccessDeniedError,
  type StoreIdentity,
  type StoreMembershipIdentity,
} from "@/domain/stores/authorization";

const storeA: StoreIdentity = {
  id: "66d000000000000000000001",
  organizationId: "org-a",
  active: true,
};

const managerA: StoreMembershipIdentity = {
  organizationId: "org-a",
  storeId: storeA.id,
  userId: "manager-a",
  role: "department_manager",
  permissions: ["stores.read", "analytics.read", "imports.create"],
  active: true,
};

describe("store authorization isolation", () => {
  it("authorizes a matching active membership", () => {
    expect(
      authorizeStoreAccess({
        userId: "manager-a",
        store: storeA,
        organizationRole: "member",
        membership: managerA,
        requiredPermissions: ["analytics.read"],
      }),
    ).toMatchObject({ storeId: storeA.id, role: "department_manager" });
  });

  it("rejects a manager guessing another store in the same organization", () => {
    expect(() =>
      authorizeStoreAccess({
        userId: "manager-a",
        store: { ...storeA, id: "66d000000000000000000002" },
        organizationRole: "member",
        membership: managerA,
        requiredPermissions: ["analytics.read"],
      }),
    ).toThrow(StoreAccessDeniedError);
  });

  it("rejects a membership copied from another organization", () => {
    expect(() =>
      authorizeStoreAccess({
        userId: "manager-a",
        store: { ...storeA, organizationId: "org-b" },
        organizationRole: "member",
        membership: managerA,
        requiredPermissions: ["analytics.read"],
      }),
    ).toThrow(StoreAccessDeniedError);
  });

  it("rejects a viewer mutation", () => {
    expect(() =>
      authorizeStoreAccess({
        userId: "viewer-a",
        store: storeA,
        organizationRole: "member",
        membership: {
          ...managerA,
          userId: "viewer-a",
          role: "viewer",
          permissions: ["stores.read", "analytics.read"],
        },
        requiredPermissions: ["imports.commit"],
      }),
    ).toThrow(StoreAccessDeniedError);
  });

  it("does not infer experiment execution rights from read access", () => {
    expect(() =>
      authorizeStoreAccess({
        userId: "manager-a",
        store: storeA,
        organizationRole: "member",
        membership: {
          ...managerA,
          permissions: ["stores.read", "experiments.read"],
        },
        requiredPermissions: ["experiments.start"],
      }),
    ).toThrow(StoreAccessDeniedError);
  });

  it("grants organization admins the explicit organization store", () => {
    expect(
      authorizeStoreAccess({
        userId: "admin-a",
        store: storeA,
        organizationRole: "admin",
        membership: null,
        requiredPermissions: ["stores.manage", "imports.commit"],
      }).role,
    ).toBe("organization_admin");
  });
});
