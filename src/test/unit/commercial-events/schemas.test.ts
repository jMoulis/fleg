import { describe, expect, it } from "vitest";

import {
  commercialEventCreateInputSchema,
  commercialEventUpdateInputSchema,
} from "@/domain/commercial-events/schemas";

const base = {
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  layoutVersionId: "66d000000000000000000010",
  fixtureId: "tg-1",
  title: "Semaine italienne",
  theme: "Tomates et antipasti",
  startsOn: "2026-09-01",
  endsOn: "2026-09-07",
  productIds: ["66d000000000000000000101"],
  targetRevenueCents: 125_000,
  targetMarginCents: null,
  actualRevenueCents: null,
  actualMarginCents: null,
  notes: null,
};

describe("commercial event schemas", () => {
  it("accepts a valid published operation", () => {
    expect(
      commercialEventCreateInputSchema.safeParse({ ...base, action: "publish" })
        .success,
    ).toBe(true);
  });

  it("rejects publication without an objective", () => {
    expect(
      commercialEventCreateInputSchema.safeParse({
        ...base,
        targetRevenueCents: null,
        action: "publish",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid dates, duplicate products and premature actuals", () => {
    expect(
      commercialEventCreateInputSchema.safeParse({
        ...base,
        startsOn: "2026-09-08",
        productIds: [base.productIds[0], base.productIds[0]],
        actualRevenueCents: 100,
        action: "save",
      }).success,
    ).toBe(false);
  });

  it("requires an actual result to complete a published operation", () => {
    expect(
      commercialEventUpdateInputSchema.safeParse({
        ...base,
        basedOnUpdatedAt: "2026-09-01T08:00:00.000Z",
        action: "complete",
      }).success,
    ).toBe(false);
    expect(
      commercialEventUpdateInputSchema.safeParse({
        ...base,
        basedOnUpdatedAt: "2026-09-01T08:00:00.000Z",
        actualRevenueCents: 132_000,
        action: "complete",
      }).success,
    ).toBe(true);
  });
});
