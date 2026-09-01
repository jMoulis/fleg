import { describe, expect, it } from "vitest";

import { recommendationDecisionInputSchema } from "@/domain/decisions/schemas";

describe("recommendation decision boundary", () => {
  it("requires a replacement type for modified decisions", () => {
    expect(
      recommendationDecisionInputSchema.safeParse({
        idempotencyKey: "6cfed465-009e-40f1-aa99-7f44cad0bb37",
        decision: "modified",
        rationale: "Conserver le trafic tout en surveillant la marge",
      }).success,
    ).toBe(false);
  });

  it("accepts an auditable manager decision", () => {
    expect(
      recommendationDecisionInputSchema.parse({
        idempotencyKey: "6cfed465-009e-40f1-aa99-7f44cad0bb37",
        decision: "rejected",
        rationale: "Rupture fournisseur confirmée",
      }),
    ).toMatchObject({ decision: "rejected" });
  });
});
