import { describe, expect, it } from "vitest";

import { buildGranularSalesScope } from "@/domain/analytics/granular-sales-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["stores.read", "analytics.read"],
};

const contextB: AuthorizedStoreContext = {
  userId: "manager-b",
  organizationId: "org-b",
  storeId: "66d000000000000000000002",
  role: "department_manager",
  permissions: ["stores.read", "analytics.read"],
};

describe("granular sales store isolation", () => {
  it("derives every read scope from the authorized store context", () => {
    expect(buildGranularSalesScope(contextA)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("cannot reuse another organization or store scope", () => {
    expect(buildGranularSalesScope(contextA)).not.toEqual(
      buildGranularSalesScope(contextB),
    );
  });
});
