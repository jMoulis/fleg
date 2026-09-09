import { describe, expect, it } from "vitest";

import type { GranularDailyFactValue } from "@/domain/analytics/granular-sales";
import { calculateDayOfWeekForecast } from "@/domain/forecasting/day-of-week-forecast";
import {
  dayOfWeekForecastProductSchema,
  type DayOfWeekForecastConfigSnapshot,
} from "@/domain/forecasting/day-of-week-forecast-schemas";
import {
  enumerateBusinessDates,
  isoWeekKeyFromBusinessDate,
} from "@/domain/imports/daily-dates";

const product = {
  id: "66d000000000000000000001",
  label: "Banane vrac",
};

const config: DayOfWeekForecastConfigSnapshot = {
  windowWeeks: 6,
  backtestWeeks: 1,
  minimumObservationsPerWeekday: 2,
  minimumBacktestObservations: 7,
  recencyDecay: 1,
  highConfidenceMaxWape: 0.2,
  mediumConfidenceMaxWape: 0.4,
  configurationVersion: "analytics-v1-config-3",
};

function isoWeekday(businessDate: string) {
  const day = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function completeFacts(
  quantityFor: (input: {
    businessDate: string;
    isoWeekday: number;
    weekIndex: number;
  }) => number = ({ isoWeekday }) => isoWeekday,
): GranularDailyFactValue[] {
  return enumerateBusinessDates("2026-06-01", "2026-07-12").map(
    (businessDate, index) => ({
      productId: product.id,
      businessDate,
      isoWeekKey: isoWeekKeyFromBusinessDate(businessDate),
      quantity: quantityFor({
        businessDate,
        isoWeekday: isoWeekday(businessDate),
        weekIndex: Math.floor(index / 7),
      }),
      revenueCents: 100,
      marginCents: 25,
      version: 1,
    }),
  );
}

function calculate(facts: GranularDailyFactValue[]) {
  return calculateDayOfWeekForecast({
    products: [product],
    facts,
    asOf: "2026-07-12",
    horizonDays: 7,
    config,
  }).products[0]!;
}

describe("day-of-week forecast", () => {
  it("forecasts each weekday and exposes a leak-free perfect holdout", () => {
    const facts = completeFacts();
    facts.push({
      ...facts[0]!,
      businessDate: "2026-07-13",
      isoWeekKey: isoWeekKeyFromBusinessDate("2026-07-13"),
      quantity: 999,
    });
    const result = dayOfWeekForecastProductSchema.parse(
      calculate(facts),
    );

    expect(result).toMatchObject({
      status: "forecastable",
      confidence: "high",
      predictedDayCount: 7,
      forecastTotalQuantity: 28,
      backtest: {
        eligibleObservationCount: 7,
        meanAbsoluteError: 0,
        rootMeanSquaredError: 0,
        meanError: 0,
        weightedAbsolutePercentageError: 0,
      },
    });
    expect(
      result.forecastDays.map(({ predictedQuantity }) => predictedQuantity),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.backtest.fitTo).toBe("2026-07-05");
    expect(result.backtest.from).toBe("2026-07-06");
    expect(result.warnings).toEqual([]);
  });

  it("weights recent observations more heavily with the configured decay", () => {
    const result = calculateDayOfWeekForecast({
      products: [product],
      facts: completeFacts(({ isoWeekday, weekIndex }) =>
        isoWeekday === 1 && weekIndex === 5 ? 9 : 1,
      ),
      asOf: "2026-07-12",
      horizonDays: 7,
      config: { ...config, recencyDecay: 0.5 },
    }).products[0]!;

    expect(result.forecastDays[0]?.predictedQuantity).toBeCloseTo(319 / 63, 10);
    expect(result.forecastDays[0]?.predictedQuantity).toBeGreaterThan(7 / 3);
  });

  it("caps confidence below high when one training date is unknown", () => {
    const facts = completeFacts().filter(
      ({ businessDate }) => businessDate !== "2026-06-02",
    );
    const result = calculate(facts);

    expect(result.status).toBe("forecastable");
    expect(result.trainingCoverage.status).toBe("partial");
    expect(result.confidence).toBe("medium");
    expect(result.backtest.weightedAbsolutePercentageError).toBe(0);
    expect(result.warnings.map(({ code }) => code)).toContain(
      "INCOMPLETE_TRAINING_COVERAGE",
    );
  });

  it("keeps sparse weekdays unavailable instead of filling them with zero", () => {
    const mondayOnly = completeFacts().filter(
      ({ businessDate }) => isoWeekday(businessDate) === 1,
    );
    const result = calculate(mondayOnly);

    expect(result).toMatchObject({
      status: "partial",
      confidence: "low",
      predictedDayCount: 1,
      forecastTotalQuantity: null,
    });
    expect(result.forecastDays[0]?.predictedQuantity).toBe(1);
    expect(
      result.forecastDays.slice(1).every(({ predictedQuantity }) =>
        predictedQuantity === null,
      ),
    ).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "INSUFFICIENT_WEEKDAY_HISTORY",
        "UNAVAILABLE_FORECAST_DAYS",
      ]),
    );
  });

  it("reports holdout errors and lowers confidence when demand shifts", () => {
    const result = calculate(
      completeFacts(({ isoWeekday, weekIndex }) =>
        weekIndex === 5 ? isoWeekday * 2 : isoWeekday,
      ),
    );

    expect(result.status).toBe("forecastable");
    expect(result.confidence).toBe("low");
    expect(result.backtest.meanAbsoluteError).toBe(4);
    expect(result.backtest.rootMeanSquaredError).toBeCloseTo(
      Math.sqrt(20),
      10,
    );
    expect(result.backtest.meanError).toBe(-4);
    expect(result.backtest.weightedAbsolutePercentageError).toBe(0.5);
  });

  it("withholds WAPE for a zero-demand holdout", () => {
    const result = calculate(
      completeFacts(({ isoWeekday, weekIndex }) =>
        weekIndex === 5 ? 0 : isoWeekday,
      ),
    );

    expect(result.backtest.meanAbsoluteError).toBe(4);
    expect(result.backtest.weightedAbsolutePercentageError).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.warnings.map(({ code }) => code)).toContain(
      "ZERO_BACKTEST_DEMAND",
    );
  });

  it("blocks negative demand and exposes corrected active facts", () => {
    const facts = completeFacts();
    facts[0] = { ...facts[0]!, quantity: -1, version: 2 };
    const result = calculate(facts);

    expect(result).toMatchObject({
      status: "unavailable",
      confidence: "low",
      predictedDayCount: 0,
      forecastTotalQuantity: null,
      correctedFactCount: 1,
    });
    expect(result.forecastDays.every(({ predictedQuantity }) =>
      predictedQuantity === null,
    )).toBe(true);
    expect(result.warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["NEGATIVE_DEMAND", "CORRECTED_FACTS"]),
    );
  });
});
