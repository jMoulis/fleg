import { describe, expect, it } from "vitest";

import { calculateTrueXyz } from "@/domain/analytics/true-xyz";
import type { TrueXyzConfigSnapshot } from "@/domain/analytics/true-xyz-schemas";
import type { GranularDailyFactValue } from "@/domain/analytics/granular-sales";
import {
  enumerateBusinessDates,
  isoWeekKeyFromBusinessDate,
} from "@/domain/imports/daily-dates";

const product = {
  id: "66d000000000000000000001",
  label: "Banane vrac",
};

const config: TrueXyzConfigSnapshot = {
  windowWeeks: 4,
  minimumCompleteWeeks: 4,
  minimumMeanWeeklyQuantity: 1,
  xMaxCoefficientOfVariation: 0.2,
  yMaxCoefficientOfVariation: 0.8,
  configurationVersion: "analytics-v1-config-2",
};

function weekFacts(
  startsOn: string,
  weeklyQuantity: number,
  options: { days?: number; version?: number } = {},
): GranularDailyFactValue[] {
  const dates = enumerateBusinessDates(
    startsOn,
    new Date(
      new Date(`${startsOn}T00:00:00.000Z`).getTime() +
        ((options.days ?? 7) - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10),
  );

  return dates.map((businessDate) => ({
    productId: product.id,
    businessDate,
    isoWeekKey: isoWeekKeyFromBusinessDate(businessDate),
    quantity: weeklyQuantity / (options.days ?? 7),
    revenueCents: 100,
    marginCents: 25,
    version: options.version ?? 1,
  }));
}

function calculate(
  weeklyQuantities: number[],
  overrides: Partial<TrueXyzConfigSnapshot> = {},
) {
  const weekStarts = [
    "2026-08-03",
    "2026-08-10",
    "2026-08-17",
    "2026-08-24",
  ];
  return calculateTrueXyz({
    products: [product],
    facts: weeklyQuantities.flatMap((quantity, index) =>
      weekFacts(weekStarts[index]!, quantity),
    ),
    from: "2026-08-03",
    to: "2026-08-30",
    config: { ...config, ...overrides },
  })[0]!;
}

describe("true XYZ calculation", () => {
  it("classifies stable, variable and irregular complete weekly demand", () => {
    const stable = calculate([10, 10, 10, 10]);
    const variable = calculate([5, 10, 15, 10]);
    const irregular = calculate([1, 1, 1, 37]);

    expect(stable).toMatchObject({
      status: "classified",
      xyzClass: "X",
      meanWeeklyQuantity: 10,
      populationStandardDeviation: 0,
      coefficientOfVariation: 0,
      completeWeekCount: 4,
    });
    expect(variable.xyzClass).toBe("Y");
    expect(variable.coefficientOfVariation).toBeCloseTo(0.353553, 5);
    expect(irregular.xyzClass).toBe("Z");
    expect(irregular.coefficientOfVariation).toBeGreaterThan(0.8);
  });

  it("excludes partial weeks instead of replacing missing days with zero", () => {
    const facts = [
      ...weekFacts("2026-08-03", 10),
      ...weekFacts("2026-08-10", 10),
      ...weekFacts("2026-08-17", 10),
      ...weekFacts("2026-08-24", 60, { days: 6 }),
    ];
    const result = calculateTrueXyz({
      products: [product],
      facts,
      from: "2026-08-03",
      to: "2026-08-30",
      config,
    })[0]!;

    expect(result).toMatchObject({
      status: "unclassified",
      xyzClass: null,
      completeWeekCount: 3,
      meanWeeklyQuantity: 10,
    });
    expect(result.weeks[3]).toMatchObject({
      coverageStatus: "partial",
      observedQuantity: 60,
      includedInCalculation: false,
    });
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "INCOMPLETE_WEEKS_EXCLUDED",
        "INSUFFICIENT_COMPLETE_WEEKS",
      ]),
    );
  });

  it("withholds classification for weak, zero or negative demand bases", () => {
    const small = calculate([0.5, 0.5, 0.5, 0.5]);
    const zero = calculate([0, 0, 0, 0]);
    const negative = calculate([-1, 10, 10, 10]);

    expect(small.xyzClass).toBeNull();
    expect(small.warnings.map(({ code }) => code)).toContain(
      "SMALL_MEAN_DEMAND",
    );
    expect(zero.coefficientOfVariation).toBeNull();
    expect(zero.warnings.map(({ code }) => code)).toContain(
      "NON_POSITIVE_MEAN_DEMAND",
    );
    expect(negative.meanWeeklyQuantity).toBeNull();
    expect(negative.warnings.map(({ code }) => code)).toContain(
      "NEGATIVE_WEEKLY_DEMAND",
    );
  });

  it("exposes corrected observations without hiding an otherwise valid class", () => {
    const facts = [
      ...weekFacts("2026-08-03", 10, { version: 2 }),
      ...weekFacts("2026-08-10", 10),
      ...weekFacts("2026-08-17", 10),
      ...weekFacts("2026-08-24", 10),
    ];
    const result = calculateTrueXyz({
      products: [product],
      facts,
      from: "2026-08-03",
      to: "2026-08-30",
      config,
    })[0]!;

    expect(result.xyzClass).toBe("X");
    expect(result.warnings.map(({ code }) => code)).toContain(
      "CORRECTED_FACTS",
    );
  });

  it("returns an explainable unclassified result when no daily facts exist", () => {
    const result = calculateTrueXyz({
      products: [product],
      facts: [],
      from: "2026-08-03",
      to: "2026-08-30",
      config,
    })[0]!;

    expect(result).toMatchObject({
      status: "unclassified",
      xyzClass: null,
      completeWeekCount: 0,
      meanWeeklyQuantity: null,
    });
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "NO_DAILY_OBSERVATIONS",
        "INCOMPLETE_WEEKS_EXCLUDED",
        "INSUFFICIENT_COMPLETE_WEEKS",
      ]),
    );
  });
});
