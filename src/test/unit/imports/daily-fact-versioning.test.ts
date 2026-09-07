import { describe, expect, it } from "vitest";

import { planDailyFactVersions } from "@/domain/imports/daily-fact-versioning";

const preparedFact = {
  productId: "66d000000000000000000010",
  businessDate: "2026-09-04",
  periodKey: "2026-09",
  isoWeekKey: "2026-W36",
  quantity: 2,
  revenueCents: 400,
  marginCents: 110,
  purchaseCents: 200,
  rceCents: 0,
  vatCents: 20,
};

describe("daily fact version planning", () => {
  it("does not version an unchanged observation", () => {
    expect(
      planDailyFactVersions({
        preparedFacts: [preparedFact],
        activeFacts: [
          {
            id: "66d000000000000000000020",
            version: 1,
            ...preparedFact,
          },
        ],
      }),
    ).toEqual({ changed: [], unchangedCount: 1 });
  });

  it("creates a new version that supersedes a corrected observation", () => {
    const result = planDailyFactVersions({
      preparedFacts: [{ ...preparedFact, revenueCents: 450 }],
      activeFacts: [
        {
          id: "66d000000000000000000020",
          version: 3,
          ...preparedFact,
        },
      ],
    });

    expect(result).toEqual({
      unchangedCount: 0,
      changed: [
        {
          fact: { ...preparedFact, revenueCents: 450 },
          version: 4,
          supersedesFactId: "66d000000000000000000020",
        },
      ],
    });
  });

  it("starts a new product-date observation at version one", () => {
    expect(
      planDailyFactVersions({ preparedFacts: [preparedFact], activeFacts: [] }),
    ).toMatchObject({
      unchangedCount: 0,
      changed: [{ version: 1, supersedesFactId: null }],
    });
  });
});
