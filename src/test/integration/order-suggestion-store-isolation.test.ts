import { describe, expect, it } from "vitest";

import { buildOrderSuggestionScope } from "@/domain/ordering/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "organization-a",
  storeId: "66a000000000000000000001",
  role: "department_manager",
  permissions: [
    "analytics.read",
    "inventory.read",
    "recommendations.approve",
  ],
};

const contextB: AuthorizedStoreContext = {
  ...contextA,
  organizationId: "organization-b",
  storeId: "66a000000000000000000002",
};

describe("order suggestion store isolation", () => {
  it("derives every draft and decision scope from authorization", () => {
    expect(buildOrderSuggestionScope(contextA)).toEqual({
      organizationId: "organization-a",
      storeId: "66a000000000000000000001",
    });
    expect(buildOrderSuggestionScope(contextA)).not.toEqual(
      buildOrderSuggestionScope(contextB),
    );
  });
});
