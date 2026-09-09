import { describe, expect, it } from "vitest";

import {
  businessContextRangeQuerySchema,
  promotionObservationCreateInputSchema,
  weatherObservationCreateInputSchema,
} from "@/domain/context-observations/schemas";

const productId = "66d000000000000000000001";

describe("context observation schemas", () => {
  it("requires evidence for an active promotion", () => {
    const result = promotionObservationCreateInputSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      businessDate: "2026-09-09",
      state: "active",
      productIds: [],
      mechanic: null,
      label: null,
      discountRate: null,
      provenance: { kind: "manual" },
      notes: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path.join("."))).toEqual(
        expect.arrayContaining(["productIds", "mechanic", "label"]),
      );
    }
  });

  it("represents an observed absence separately from missing context", () => {
    expect(
      promotionObservationCreateInputSchema.parse({
        idempotencyKey: crypto.randomUUID(),
        businessDate: "2026-09-09",
        state: "none",
        productIds: [],
        mechanic: null,
        label: null,
        discountRate: null,
        provenance: { kind: "manual" },
        notes: null,
      }).state,
    ).toBe("none");
  });

  it("bounds weather values and chronological ranges", () => {
    expect(
      weatherObservationCreateInputSchema.safeParse({
        idempotencyKey: crypto.randomUUID(),
        businessDate: "2026-09-09",
        condition: "rain",
        minimumTemperatureC: 20,
        maximumTemperatureC: 10,
        precipitationMm: 600,
        provenance: { kind: "manual" },
        notes: null,
      }).success,
    ).toBe(false);
    expect(
      businessContextRangeQuerySchema.safeParse({
        from: "2026-01-01",
        to: "2026-06-01",
        productId,
      }).success,
    ).toBe(false);
    expect(
      businessContextRangeQuerySchema.safeParse({ from: "2026-09-01" })
        .success,
    ).toBe(false);
  });
});
