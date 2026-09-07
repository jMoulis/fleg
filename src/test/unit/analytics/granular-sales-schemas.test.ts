import { describe, expect, it } from "vitest";

import {
  granularSalesRangeQuerySchema,
  granularSalesReconciliationQuerySchema,
  maximumGranularSalesRangeDays,
} from "@/domain/analytics/granular-sales-schemas";

describe("granular sales schemas", () => {
  it("accepts an omitted range or a bounded explicit range", () => {
    expect(granularSalesRangeQuerySchema.parse({})).toEqual({});
    expect(
      granularSalesRangeQuerySchema.parse({
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("rejects incomplete, inverted and oversized date ranges", () => {
    expect(() =>
      granularSalesRangeQuerySchema.parse({ from: "2026-09-01" }),
    ).toThrow();
    expect(() =>
      granularSalesRangeQuerySchema.parse({
        from: "2026-09-02",
        to: "2026-09-01",
      }),
    ).toThrow();
    expect(() =>
      granularSalesRangeQuerySchema.parse({
        from: "2025-01-01",
        to: "2026-01-02",
      }),
    ).toThrow(`${maximumGranularSalesRangeDays} jours`);
  });

  it("rejects unknown parameters and invalid product identifiers", () => {
    expect(() =>
      granularSalesRangeQuerySchema.parse({ unexpected: "value" }),
    ).toThrow();
    expect(() =>
      granularSalesReconciliationQuerySchema.parse({
        period: "2026-09",
        productId: "foreign-slug",
      }),
    ).toThrow();
  });
});
