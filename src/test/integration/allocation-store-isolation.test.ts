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

describe("allocation store isolation", () => {
  it("derives persistence scope only from the authorized store context", () => {
    expect(buildAllocationScope(contextA)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("cannot reuse another organization's allocation scope", () => {
    expect(buildAllocationScope(contextA)).not.toEqual(
      buildAllocationScope(contextB),
    );
  });
});
