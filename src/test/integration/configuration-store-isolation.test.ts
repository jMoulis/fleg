import { describe, expect, it } from "vitest";

import { buildStoreConfigurationScope } from "@/domain/configuration/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const context: AuthorizedStoreContext = {
  userId: "director-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "store_director",
  permissions: ["stores.read", "analytics.read", "settings.write", "targets.write"],
};

describe("store configuration isolation", () => {
  it("derives the persisted target and settings scope from authorization", () => {
    expect(buildStoreConfigurationScope(context)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("does not reuse scope across organizations or stores", () => {
    expect(buildStoreConfigurationScope(context)).not.toEqual(
      buildStoreConfigurationScope({
        ...context,
        organizationId: "org-b",
        storeId: "66d000000000000000000002",
      }),
    );
  });
});
