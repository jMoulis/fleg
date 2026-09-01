import { describe, expect, it } from "vitest";

import { buildLayoutVersionScope } from "@/domain/space/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["stores.read", "layouts.write"],
};

const contextB: AuthorizedStoreContext = {
  userId: "manager-b",
  organizationId: "org-b",
  storeId: "66d000000000000000000002",
  role: "department_manager",
  permissions: ["stores.read", "layouts.write"],
};

describe("layout store isolation", () => {
  it("derives the repository scope only from the authorized context", () => {
    expect(buildLayoutVersionScope(contextA)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("keeps two store scopes distinct even across organizations", () => {
    expect(buildLayoutVersionScope(contextA)).not.toEqual(
      buildLayoutVersionScope(contextB),
    );
  });
});

