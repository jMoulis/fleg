import { describe, expect, it } from "vitest";

import { buildContextObservationScope } from "@/domain/context-observations/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const contextA: AuthorizedStoreContext = {
  userId: "user-a",
  organizationId: "organization-a",
  storeId: "66a000000000000000000001",
  role: "department_manager",
  permissions: ["analytics.read", "context.write"],
};

const contextB: AuthorizedStoreContext = {
  ...contextA,
  storeId: "66a000000000000000000002",
};

describe("context observation store isolation", () => {
  it("always includes organization and authorized store in the scope", () => {
    expect(buildContextObservationScope(contextA)).toEqual({
      organizationId: "organization-a",
      storeId: "66a000000000000000000001",
    });
    expect(buildContextObservationScope(contextA)).not.toEqual(
      buildContextObservationScope(contextB),
    );
  });
});
