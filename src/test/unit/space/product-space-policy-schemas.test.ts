import { describe, expect, it } from "vitest";

import {
  productSpacePolicySchema,
  productSpacePolicySetUpdateInputSchema,
} from "@/domain/space/product-space-policy-schemas";

const productId = "66d000000000000000000101";

describe("product space policy schemas", () => {
  it("requires at least one allowed fixture for a restricted policy", () => {
    expect(
      productSpacePolicySchema.safeParse({
        productId,
        mustStock: true,
        suitability: "restricted",
        allowedFixtureTypes: [],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate product policies at the API boundary", () => {
    const policy = {
      productId,
      mustStock: true,
      suitability: "unknown" as const,
      allowedFixtureTypes: [],
    };
    expect(
      productSpacePolicySetUpdateInputSchema.safeParse({
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        basedOnRevision: 0,
        policies: [policy, policy],
      }).success,
    ).toBe(false);
  });
});
