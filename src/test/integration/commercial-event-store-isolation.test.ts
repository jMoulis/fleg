import { describe, expect, it } from "vitest";

import { buildCommercialEventScope } from "@/domain/commercial-events/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["stores.read", "tg.publish"],
};

const contextB: AuthorizedStoreContext = {
  userId: "manager-b",
  organizationId: "org-b",
  storeId: "66d000000000000000000002",
  role: "department_manager",
  permissions: ["stores.read", "tg.publish"],
};

describe("commercial event store isolation", () => {
  it("derives queries only from the authorized store context", () => {
    expect(buildCommercialEventScope(contextA)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("does not reuse another store or organization scope", () => {
    expect(buildCommercialEventScope(contextA)).not.toEqual(
      buildCommercialEventScope(contextB),
    );
  });
});
