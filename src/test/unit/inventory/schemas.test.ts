import { describe, expect, it } from "vitest";

import {
  inventoryCountLineSchema,
  inventoryCountUpdateInputSchema,
} from "@/domain/inventory/schemas";

describe("inventory schemas", () => {
  it("accepts the observed cadencier packaging examples", () => {
    expect(
      inventoryCountLineSchema.safeParse({
        productId: "66d000000000000000000101",
        familyCode: "3400",
        stockUnit: "kg",
        packSize: 18.5,
        reserveCaseCount: 2,
        shelfQuantity: 1.25,
      }).success,
    ).toBe(true);
    expect(
      inventoryCountLineSchema.safeParse({
        productId: "66d000000000000000000102",
        familyCode: "3400",
        stockUnit: "piece",
        packSize: 9,
        reserveCaseCount: 1,
        shelfQuantity: 4,
      }).success,
    ).toBe(true);
  });

  it("requires integer packaging and shelf counts for piece-based articles", () => {
    expect(
      inventoryCountLineSchema.safeParse({
        productId: "66d000000000000000000101",
        familyCode: "3402",
        stockUnit: "piece",
        packSize: 9.5,
        reserveCaseCount: 1,
        shelfQuantity: 2.5,
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate products in one optimistic draft update", () => {
    const line = {
      productId: "66d000000000000000000101",
      familyCode: "3400" as const,
      stockUnit: "kg" as const,
      packSize: 18.5,
      reserveCaseCount: null,
      shelfQuantity: null,
    };
    expect(
      inventoryCountUpdateInputSchema.safeParse({
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        basedOnRevision: 0,
        lines: [line, line],
      }).success,
    ).toBe(false);
  });
});
