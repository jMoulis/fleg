import { describe, expect, it } from "vitest";

import { buildInventoryScope } from "@/domain/inventory/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["inventory.read", "inventory.write"],
};

const contextB: AuthorizedStoreContext = {
  userId: "manager-b",
  organizationId: "org-b",
  storeId: "66d000000000000000000002",
  role: "department_manager",
  permissions: ["inventory.read", "inventory.write"],
};

describe("inventory store isolation", () => {
  it("derives inventory persistence scope from authorized context only", () => {
    expect(buildInventoryScope(contextA)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("cannot reuse another store or organization scope", () => {
    expect(buildInventoryScope(contextA)).not.toEqual(
      buildInventoryScope(contextB),
    );
  });
});
