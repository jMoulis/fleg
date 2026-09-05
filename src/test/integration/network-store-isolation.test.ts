import { describe, expect, it } from "vitest";

import {
  buildNetworkScope,
  NetworkStoreSetError,
} from "@/domain/network/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const primary: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "store_director",
  permissions: ["analytics.read", "analytics.compare_stores"],
};

describe("network store isolation", () => {
  it("builds the exact store set from same-user, same-organization contexts", () => {
    expect(
      buildNetworkScope([
        primary,
        { ...primary, storeId: "66d000000000000000000002" },
      ]),
    ).toEqual({
      organizationId: "org-a",
      userId: "manager-a",
      storeIds: [
        "66d000000000000000000001",
        "66d000000000000000000002",
      ],
    });
  });

  it("rejects a store from another organization instead of silently dropping it", () => {
    expect(() =>
      buildNetworkScope([
        primary,
        {
          ...primary,
          organizationId: "org-b",
          storeId: "66d000000000000000000002",
        },
      ]),
    ).toThrow(NetworkStoreSetError);
  });

  it("rejects mixed users and duplicate store identifiers", () => {
    expect(() =>
      buildNetworkScope([
        primary,
        {
          ...primary,
          userId: "manager-b",
          storeId: "66d000000000000000000002",
        },
      ]),
    ).toThrow(NetworkStoreSetError);
    expect(() => buildNetworkScope([primary, primary])).toThrow(
      NetworkStoreSetError,
    );
  });
});
