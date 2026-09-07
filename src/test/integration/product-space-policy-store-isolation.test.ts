import { describe, expect, it } from "vitest";

import { buildAllocationScope } from "@/domain/space/allocation-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["stores.read", "analytics.read", "allocations.write"],
};

const contextB: AuthorizedStoreContext = {
  userId: "manager-b",
  organizationId: "org-b",
  storeId: "66d000000000000000000002",
  role: "department_manager",
  permissions: ["stores.read", "analytics.read", "allocations.write"],
};

describe("product space policy store isolation", () => {
  it("derives policy persistence scope from the authorized store context", () => {
    expect(buildAllocationScope(contextA)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("cannot reuse a policy scope from another organization or store", () => {
    expect(buildAllocationScope(contextA)).not.toEqual(
      buildAllocationScope(contextB),
    );
  });
});
