import { describe, expect, it } from "vitest";

import {
  assertStoreAiReadAccess,
  buildAuthorizedAiNetworkScope,
} from "@/domain/ai/authorization";
import { NetworkStoreSetError } from "@/domain/network/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const primary: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["ai.use", "analytics.read", "analytics.compare_stores"],
};

describe("AI tool store isolation", () => {
  it("requires both AI and analytics read permissions for store tools", () => {
    expect(() => assertStoreAiReadAccess(primary)).not.toThrow();
    expect(() =>
      assertStoreAiReadAccess({
        ...primary,
        permissions: ["analytics.read"],
      }),
    ).toThrow(StoreAccessDeniedError);
  });

  it("builds the network tool scope only from fully authorized contexts", () => {
    expect(
      buildAuthorizedAiNetworkScope([
        primary,
        { ...primary, storeId: "66d000000000000000000002" },
      ]).storeIds,
    ).toEqual([
      "66d000000000000000000001",
      "66d000000000000000000002",
    ]);
    expect(() =>
      buildAuthorizedAiNetworkScope([
        primary,
        {
          ...primary,
          storeId: "66d000000000000000000002",
          permissions: ["ai.use", "analytics.read"],
        },
      ]),
    ).toThrow(StoreAccessDeniedError);
  });

  it("rejects foreign organizations, mixed users and duplicate stores", () => {
    expect(() =>
      buildAuthorizedAiNetworkScope([
        primary,
        {
          ...primary,
          organizationId: "org-b",
          storeId: "66d000000000000000000002",
        },
      ]),
    ).toThrow(NetworkStoreSetError);
    expect(() =>
      buildAuthorizedAiNetworkScope([
        primary,
        {
          ...primary,
          userId: "manager-b",
          storeId: "66d000000000000000000002",
        },
      ]),
    ).toThrow(NetworkStoreSetError);
    expect(() => buildAuthorizedAiNetworkScope([primary, primary])).toThrow(
      NetworkStoreSetError,
    );
  });
});
