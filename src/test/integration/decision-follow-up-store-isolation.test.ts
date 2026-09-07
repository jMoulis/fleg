import { describe, expect, it } from "vitest";

import { buildRecommendationFollowUpScope } from "@/domain/decisions/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const context: AuthorizedStoreContext = {
  userId: "director-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "store_director",
  permissions: ["analytics.read", "recommendations.approve"],
};

describe("recommendation follow-up isolation", () => {
  it("derives every persisted query scope from authorization", () => {
    expect(buildRecommendationFollowUpScope(context)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("never reuses another store or organization scope", () => {
    expect(buildRecommendationFollowUpScope(context)).not.toEqual(
      buildRecommendationFollowUpScope({
        ...context,
        organizationId: "org-b",
        storeId: "66d000000000000000000002",
      }),
    );
  });
});
