import { describe, expect, it } from "vitest";

import { buildAttachmentScope } from "@/domain/attachments/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const firstContext: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["stores.read", "attachments.write"],
};

const secondContext: AuthorizedStoreContext = {
  userId: "manager-b",
  organizationId: "org-a",
  storeId: "66d000000000000000000002",
  role: "department_manager",
  permissions: ["stores.read", "attachments.write"],
};

describe("attachment store isolation", () => {
  it("derives object and metadata scope from the authorized store", () => {
    expect(buildAttachmentScope(firstContext)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("cannot reuse attachment scope for another store", () => {
    expect(buildAttachmentScope(firstContext)).not.toEqual(
      buildAttachmentScope(secondContext),
    );
  });
});
