import { describe, expect, it } from "vitest";

import { dayOfWeekForecastQuerySchema } from "@/domain/forecasting/day-of-week-forecast-schemas";

describe("day-of-week forecast query", () => {
  it("defaults to seven days and accepts a bounded string query value", () => {
    expect(dayOfWeekForecastQuerySchema.parse({}).horizonDays).toBe(7);
    expect(
      dayOfWeekForecastQuerySchema.parse({ horizonDays: "14" }).horizonDays,
    ).toBe(14);
  });

  it("rejects invalid horizons, dates and product identifiers", () => {
    expect(
      dayOfWeekForecastQuerySchema.safeParse({ horizonDays: "29" }).success,
    ).toBe(false);
    expect(
      dayOfWeekForecastQuerySchema.safeParse({ asOf: "09/09/2026" }).success,
    ).toBe(false);
    expect(
      dayOfWeekForecastQuerySchema.safeParse({ productId: "foreign" }).success,
    ).toBe(false);
  });
});
