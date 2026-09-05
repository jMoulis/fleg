import { describe, expect, it } from "vitest";

import {
  calculatePostMarkdownMargin,
  summarizeMarkdownFacts,
} from "@/domain/markdown/calculations";
import { markdownCreateInputSchema } from "@/domain/markdown/schemas";

describe("markdown facts", () => {
  it("validates a positive, idempotent manual capture", () => {
    expect(
      markdownCreateInputSchema.safeParse({
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        productId: "66d000000000000000000101",
        occurredOn: "2026-05-15",
        amountCents: 1_250,
        quantity: 8.5,
        reason: "quality",
        notes: null,
      }).success,
    ).toBe(true);
    expect(
      markdownCreateInputSchema.safeParse({
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
        productId: "66d000000000000000000101",
        occurredOn: "2026-05-15",
        amountCents: 0,
        quantity: null,
        reason: "quality",
        notes: null,
      }).success,
    ).toBe(false);
  });

  it("keeps unknown quantities explicit and computes post-markdown margin", () => {
    expect(
      summarizeMarkdownFacts([
        { amountCents: 500, quantity: 2 },
        { amountCents: 300, quantity: null },
      ]),
    ).toEqual({ amountCents: 800, quantity: null, factCount: 2 });
    expect(
      calculatePostMarkdownMargin({
        grossMarginCents: 3_000,
        markdownCents: 800,
      }),
    ).toBe(2_200);
  });
});
