import { describe, expect, it } from "vitest";

import {
  assessDailyCoverage,
  calculateDailySalesView,
  calculateMonthlySalesReconciliation,
  calculateWeeklySalesView,
  type GranularDailyFactValue,
} from "@/domain/analytics/granular-sales";
import { isoWeekKeyFromBusinessDate } from "@/domain/imports/daily-dates";

function dailyFact(input: {
  businessDate: string;
  productId?: string;
  quantity?: number;
  revenueCents?: number;
  marginCents?: number;
  version?: number;
}): GranularDailyFactValue {
  return {
    productId: input.productId ?? "66d000000000000000000001",
    businessDate: input.businessDate,
    isoWeekKey: isoWeekKeyFromBusinessDate(input.businessDate),
    quantity: input.quantity ?? 1,
    revenueCents: input.revenueCents ?? 100,
    marginCents: input.marginCents ?? 25,
    version: input.version ?? 1,
  };
}

describe("granular sales calculations", () => {
  it("distinguishes unknown, partial and complete coverage without zero filling", () => {
    expect(
      assessDailyCoverage({
        from: "2026-09-01",
        to: "2026-09-03",
        observedDates: [],
      }).status,
    ).toBe("unknown");

    const partial = assessDailyCoverage({
      from: "2026-09-01",
      to: "2026-09-03",
      observedDates: ["2026-09-01", "2026-09-03"],
    });
    expect(partial.status).toBe("partial");
    expect(partial.missingDates).toEqual(["2026-09-02"]);

    expect(
      assessDailyCoverage({
        from: "2026-09-01",
        to: "2026-09-03",
        observedDates: ["2026-09-03", "2026-09-02", "2026-09-01"],
      }).status,
    ).toBe("complete");
  });

  it("aggregates daily totals while exposing active corrected facts", () => {
    const view = calculateDailySalesView({
      from: "2026-09-04",
      to: "2026-09-05",
      facts: [
        dailyFact({ businessDate: "2026-09-04", revenueCents: 200 }),
        dailyFact({
          businessDate: "2026-09-04",
          productId: "66d000000000000000000002",
          revenueCents: 300,
          version: 2,
        }),
      ],
    });

    expect(view.totals).toEqual({
      quantity: 2,
      revenueCents: 500,
      marginCents: 50,
    });
    expect(view.coverage.status).toBe("partial");
    expect(view.days[0]).toMatchObject({
      businessDate: "2026-09-04",
      productCount: 2,
      correctedFactCount: 1,
    });
    expect(view.warnings.map((warning) => warning.code)).toEqual([
      "PARTIAL_COVERAGE",
      "CORRECTED_FACTS",
    ]);
  });

  it("derives full ISO-week boundaries and never marks a partial week complete", () => {
    const view = calculateWeeklySalesView({
      from: "2026-12-31",
      to: "2027-01-01",
      facts: [
        dailyFact({ businessDate: "2026-12-31", quantity: 2, version: 2 }),
        dailyFact({ businessDate: "2027-01-01", quantity: -3 }),
      ],
    });

    expect(view.weeks).toHaveLength(1);
    expect(view.weeks[0]).toMatchObject({
      isoWeekKey: "2026-W53",
      startsOn: "2026-12-28",
      endsOn: "2027-01-03",
      totals: { quantity: -1 },
      correctedFactCount: 1,
      coverage: { status: "partial" },
    });
    expect(view.weeks[0]?.coverage.missingDates).toHaveLength(5);
    expect(view.weeks[0]?.warnings.map((warning) => warning.code)).toEqual([
      "PARTIAL_COVERAGE",
      "CORRECTED_FACTS",
      "NON_POSITIVE_NET_DEMAND",
    ]);
  });

  it("reconciles a complete daily month without replacing either source", () => {
    const dailyFacts = Array.from({ length: 30 }, (_, index) =>
      dailyFact({
        businessDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
        quantity: 2,
        revenueCents: 100,
        marginCents: 30,
      }),
    );
    const reconciliation = calculateMonthlySalesReconciliation({
      periodKey: "2026-09",
      dailyFacts,
      monthlyFacts: [
        {
          productId: "66d000000000000000000001",
          quantity: 60,
          revenueCents: 3_000,
          marginCents: 900,
        },
      ],
    });

    expect(reconciliation.status).toBe("matched");
    expect(reconciliation.daily.coverage.status).toBe("complete");
    expect(reconciliation.deltas).toEqual({
      quantity: 0,
      quantityRatio: 0,
      revenueCents: 0,
      revenueRatio: 0,
      marginCents: 0,
      marginRatio: 0,
    });
  });

  it("withholds deltas for incomplete months and protects zero denominators", () => {
    const partial = calculateMonthlySalesReconciliation({
      periodKey: "2026-09",
      dailyFacts: [dailyFact({ businessDate: "2026-09-04" })],
      monthlyFacts: [
        {
          productId: "66d000000000000000000001",
          quantity: 1,
          revenueCents: 100,
          marginCents: 25,
        },
      ],
    });
    expect(partial.status).toBe("incomplete_daily");
    expect(partial.deltas).toBeNull();

    const completeDates = Array.from({ length: 30 }, (_, index) =>
      dailyFact({
        businessDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
        quantity: 0,
        revenueCents: 0,
        marginCents: 0,
      }),
    );
    const zeroBase = calculateMonthlySalesReconciliation({
      periodKey: "2026-09",
      dailyFacts: completeDates,
      monthlyFacts: [
        {
          productId: "66d000000000000000000001",
          quantity: 0,
          revenueCents: 0,
          marginCents: 0,
        },
      ],
    });
    expect(zeroBase.deltas).toMatchObject({
      quantityRatio: null,
      revenueRatio: null,
      marginRatio: null,
    });
    expect(zeroBase.warnings.map((warning) => warning.code)).toContain(
      "RATIO_UNAVAILABLE_ZERO_BASE",
    );
  });
});
