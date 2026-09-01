import { describe, expect, it } from "vitest";

import {
  buildExperimentScope,
  controlStoresBelongToOrganization,
} from "@/domain/experiments/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const primary: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: [
    "experiments.read",
    "experiments.write",
    "experiments.start",
    "experiments.compare_stores",
  ],
};

const sameOrganizationControl: AuthorizedStoreContext = {
  ...primary,
  storeId: "66d000000000000000000002",
  permissions: ["experiments.read"],
};

const otherOrganizationControl: AuthorizedStoreContext = {
  ...sameOrganizationControl,
  organizationId: "org-b",
  storeId: "66d000000000000000000003",
};

describe("experiment store isolation", () => {
  it("derives persistence scope only from the authorized primary store", () => {
    expect(buildExperimentScope(primary)).toEqual({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    });
  });

  it("allows controls only inside the authorized organization", () => {
    expect(
      controlStoresBelongToOrganization({
        primaryContext: primary,
        controlContexts: [sameOrganizationControl],
      }),
    ).toBe(true);
    expect(
      controlStoresBelongToOrganization({
        primaryContext: primary,
        controlContexts: [otherOrganizationControl],
      }),
    ).toBe(false);
  });
});
