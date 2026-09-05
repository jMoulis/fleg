import { describe, expect, it } from "vitest";

import { buildMarkdownScope } from "@/domain/markdown/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const context: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["analytics.read", "markdown.write"],
};

describe("markdown store isolation", () => {
  it("derives every markdown query scope from the authorized context", () => {
    expect(buildMarkdownScope(context)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });
});
