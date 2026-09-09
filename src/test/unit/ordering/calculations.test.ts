import { describe, expect, it } from "vitest";

import {
  buildOrderSuggestionLine,
  calculateOrderCycle,
  calculatePackOrder,
} from "@/domain/ordering/calculations";
import type { DayOfWeekForecastProduct } from "@/domain/forecasting/day-of-week-forecast-schemas";
import type { StockSnapshot } from "@/domain/inventory/schemas";

const product = {
  id: "507f1f77bcf86cd799439011",
  label: "Banane vrac",
};

function snapshot(overrides: Partial<StockSnapshot> = {}): StockSnapshot {
  return {
    id: "507f1f77bcf86cd799439012",
    organizationId: "org-a",
    storeId: "507f1f77bcf86cd799439013",
    productId: product.id,
    businessDate: "2026-09-11",
    observedAt: "2026-09-11T06:30:00.000Z",
    familyCode: "3400",
    stockUnit: "kg",
    reserveCaseCount: 0,
    packSize: 18.5,
    shelfQuantity: 4,
    onHandQuantity: 4,
    onOrderQuantity: null,
    reservedQuantity: null,
    source: "manual_count",
    anomalies: [],
    countId: "507f1f77bcf86cd799439014",
    version: 1,
    active: true,
    supersedesSnapshotId: null,
    createdBy: "user-a",
    createdAt: "2026-09-11T06:30:00.000Z",
    ...overrides,
  };
}

function forecast(overrides: Partial<DayOfWeekForecastProduct> = {}): DayOfWeekForecastProduct {
  return {
    productId: product.id,
    label: product.label,
    status: "forecastable",
    confidence: "high",
    trainingCoverage: {
      status: "complete",
      expectedDates: [],
      observedDates: [],
      missingDates: [],
      reasons: [],
    },
    trainingObservationCount: 84,
    correctedFactCount: 0,
    weekdayModels: [
      ["monday", 1],
      ["tuesday", 2],
      ["wednesday", 3],
      ["thursday", 4],
      ["friday", 5],
      ["saturday", 6],
      ["sunday", 7],
    ].map(([weekday, isoWeekday]) => ({
      weekday: weekday as DayOfWeekForecastProduct["weekdayModels"][number]["weekday"],
      isoWeekday: isoWeekday as number,
      observationCount: 12,
      weightedMeanQuantity: 10,
    })),
    forecastDays: [
      { businessDate: "2026-09-11", weekday: "friday", isoWeekday: 5, predictedQuantity: 8, observationCount: 12 },
      { businessDate: "2026-09-12", weekday: "saturday", isoWeekday: 6, predictedQuantity: 10, observationCount: 12 },
      { businessDate: "2026-09-13", weekday: "sunday", isoWeekday: 7, predictedQuantity: 12, observationCount: 12 },
    ],
    forecastTotalQuantity: 30,
    predictedDayCount: 3,
    backtest: {
      method: "fixed_holdout",
      fitFrom: "2026-06-19",
      fitTo: "2026-08-27",
      from: "2026-08-28",
      to: "2026-09-10",
      coverage: {
        status: "complete",
        expectedDates: [],
        observedDates: [],
        missingDates: [],
        reasons: [],
      },
      eligibleObservationCount: 14,
      requiredObservationCount: 7,
      meanAbsoluteError: 1,
      rootMeanSquaredError: 1,
      meanError: 0,
      weightedAbsolutePercentageError: 0.1,
      points: [],
    },
    warnings: [],
    ...overrides,
  };
}

describe("order suggestion calculations", () => {
  it("maps Friday to a Saturday delivery covering the full weekend", () => {
    expect(calculateOrderCycle("2026-09-11")).toMatchObject({
      orderWeekday: "friday",
      orderingAllowed: true,
      deliveryDate: "2026-09-12",
      coverageDates: ["2026-09-12", "2026-09-13"],
    });
  });

  it("maps Saturday to Monday and excludes Sunday ordering", () => {
    expect(calculateOrderCycle("2026-09-12")).toMatchObject({
      orderWeekday: "saturday",
      deliveryDate: "2026-09-14",
      coverageDates: ["2026-09-14"],
    });
    expect(calculateOrderCycle("2026-09-13")).toMatchObject({
      orderWeekday: "sunday",
      orderingAllowed: false,
      deliveryDate: null,
      coverageDates: [],
    });
  });

  it("targets zero closing stock and exposes pack rounding", () => {
    expect(
      calculatePackOrder({
        coveredDemandQuantity: 22,
        morningOnHandQuantity: 4,
        packSize: 10,
        targetClosingStockRatio: 0,
      }),
    ).toEqual({
      targetClosingStockQuantity: 0,
      netNeedQuantity: 18,
      suggestedCaseCount: 2,
      suggestedOrderQuantity: 20,
      projectedClosingStockQuantity: 2,
    });
  });

  it("does not suggest a case when morning stock already covers demand", () => {
    expect(
      calculatePackOrder({
        coveredDemandQuantity: 8,
        morningOnHandQuantity: 10,
        packSize: 6,
        targetClosingStockRatio: 0,
      }),
    ).toEqual({
      targetClosingStockQuantity: 0,
      netNeedQuantity: 0,
      suggestedCaseCount: 0,
      suggestedOrderQuantity: 0,
      projectedClosingStockQuantity: 2,
    });
  });

  it("builds the Friday line from Saturday and Sunday demand", () => {
    const line = buildOrderSuggestionLine({
      product,
      stockSnapshot: snapshot(),
      forecast: forecast(),
      coverageDates: ["2026-09-12", "2026-09-13"],
      targetClosingStockRatio: 0,
    });

    expect(line).toMatchObject({
      status: "ready",
      coveredDemandQuantity: 22,
      morningOnHandQuantity: 4,
      netNeedQuantity: 18,
      suggestedCaseCount: 1,
      suggestedOrderQuantity: 18.5,
      projectedClosingStockQuantity: 0.5,
    });
    expect(line.warnings.map(({ code }) => code)).toContain(
      "PACK_ROUNDING_SURPLUS",
    );
  });

  it("keeps missing stock and incomplete forecasts unavailable", () => {
    const missingStock = buildOrderSuggestionLine({
      product,
      stockSnapshot: null,
      forecast: forecast(),
      coverageDates: ["2026-09-12", "2026-09-13"],
      targetClosingStockRatio: 0,
    });
    expect(missingStock.status).toBe("unavailable");
    expect(missingStock.suggestedCaseCount).toBeNull();

    const incompleteForecast = buildOrderSuggestionLine({
      product,
      stockSnapshot: snapshot(),
      forecast: forecast({
        forecastDays: [
          { businessDate: "2026-09-12", weekday: "saturday", isoWeekday: 6, predictedQuantity: 10, observationCount: 12 },
        ],
      }),
      coverageDates: ["2026-09-12", "2026-09-13"],
      targetClosingStockRatio: 0,
    });
    expect(incompleteForecast.status).toBe("unavailable");
    expect(incompleteForecast.warnings.map(({ code }) => code)).toContain(
      "FORECAST_UNAVAILABLE",
    );
  });

  it("blocks negative physical stock rather than clamping it", () => {
    const line = buildOrderSuggestionLine({
      product,
      stockSnapshot: snapshot({ onHandQuantity: -1, anomalies: ["negative_on_hand"] }),
      forecast: forecast(),
      coverageDates: ["2026-09-12", "2026-09-13"],
      targetClosingStockRatio: 0,
    });

    expect(line.status).toBe("unavailable");
    expect(line.suggestedCaseCount).toBeNull();
    expect(line.warnings.map(({ code }) => code)).toContain(
      "NEGATIVE_ON_HAND",
    );
  });

  it("retains low-confidence evidence on an editable quantity", () => {
    const line = buildOrderSuggestionLine({
      product,
      stockSnapshot: snapshot(),
      forecast: forecast({ confidence: "low" }),
      coverageDates: ["2026-09-12", "2026-09-13"],
      targetClosingStockRatio: 0,
    });

    expect(line.status).toBe("ready");
    expect(line.forecastConfidence).toBe("low");
    expect(line.warnings.map(({ code }) => code)).toContain(
      "LOW_FORECAST_CONFIDENCE",
    );
  });
});
