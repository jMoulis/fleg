import { describe, expect, it } from "vitest";

import {
  calculateObservationAgeHours,
  calculateOnHandQuantity,
  InventoryCountValidationError,
  prepareStockObservations,
} from "@/domain/inventory/calculations";

const productId = "66d000000000000000000101";

describe("manual inventory calculations", () => {
  it("adds reserve cases and shelf remainder in the configured base unit", () => {
    expect(
      calculateOnHandQuantity({
        reserveCaseCount: 2,
        packSize: 18.5,
        shelfQuantity: 3.25,
      }),
    ).toBe(40.25);
  });

  it("distinguishes an explicit zero from an uncounted blank line", () => {
    const observations = prepareStockObservations([
      {
        productId,
        familyCode: "3400",
        stockUnit: "piece",
        packSize: 9,
        reserveCaseCount: 0,
        shelfQuantity: 0,
      },
      {
        productId: "66d000000000000000000102",
        familyCode: "3402",
        stockUnit: "kg",
        packSize: 5,
        reserveCaseCount: null,
        shelfQuantity: null,
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      productId,
      onHandQuantity: 0,
      anomalies: [],
    });
  });

  it("rejects a partial count instead of inventing its missing component", () => {
    expect(() =>
      prepareStockObservations([
        {
          productId,
          familyCode: "3400",
          stockUnit: "kg",
          packSize: 18.5,
          reserveCaseCount: 2,
          shelfQuantity: null,
        },
      ]),
    ).toThrow(InventoryCountValidationError);
  });

  it("preserves a negative total and flags it as an anomaly", () => {
    expect(
      prepareStockObservations([
        {
          productId,
          familyCode: "3402",
          stockUnit: "kg",
          packSize: 5,
          reserveCaseCount: 0,
          shelfQuantity: -1.5,
        },
      ])[0],
    ).toMatchObject({ onHandQuantity: -1.5, anomalies: ["negative_on_hand"] });
  });

  it("exposes observation age without returning a negative age", () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    expect(
      calculateObservationAgeHours("2026-09-09T09:30:00.000Z", now),
    ).toBe(2.5);
    expect(
      calculateObservationAgeHours("2026-09-09T13:00:00.000Z", now),
    ).toBe(0);
  });
});
