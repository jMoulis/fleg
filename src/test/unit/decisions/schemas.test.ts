import { describe, expect, it } from "vitest";

import { recommendationDecisionInputSchema } from "@/domain/decisions/schemas";
import {
  recommendationFollowUpCompleteInputSchema,
  recommendationFollowUpScheduleInputSchema,
} from "@/domain/decisions/follow-up-schemas";

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

describe("recommendation follow-up boundary", () => {
  it("requires a period and due date when scheduling", () => {
    expect(
      recommendationFollowUpScheduleInputSchema.parse({
        idempotencyKey: "7cfed465-009e-40f1-aa99-7f44cad0bb38",
        afterPeriodKey: "2026-09",
        dueOn: "2026-09-28",
      }),
    ).toMatchObject({ afterPeriodKey: "2026-09" });
  });

  it("keeps interpretation separate and rejects an empty conclusion", () => {
    expect(
      recommendationFollowUpCompleteInputSchema.safeParse({
        idempotencyKey: "8cfed465-009e-40f1-aa99-7f44cad0bb39",
        basedOnVersion: 1,
        interpretation: "Court",
        limitations: [],
      }).success,
    ).toBe(false);
  });
});
