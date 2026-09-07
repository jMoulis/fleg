import { describe, expect, it } from "vitest";

import {
  enumerateBusinessDates,
  isoWeekBounds,
  isoWeekKeyFromBusinessDate,
  parseBusinessDate,
} from "@/domain/imports/daily-dates";

describe("daily business dates", () => {
  it("normalizes French and ISO dates without using the server locale", () => {
    expect(parseBusinessDate("04/09/2026")).toBe("2026-09-04");
    expect(parseBusinessDate("2026-09-04")).toBe("2026-09-04");
    expect(() => parseBusinessDate("31/02/2026")).toThrow();
  });

  it("uses the ISO week-year at year boundaries", () => {
    expect(isoWeekKeyFromBusinessDate("2027-01-01")).toBe("2026-W53");
    expect(isoWeekBounds("2026-W53")).toEqual({
      startsOn: "2026-12-28",
      endsOn: "2027-01-03",
    });
  });

  it("enumerates leap days and rejects reversed ranges", () => {
    expect(enumerateBusinessDates("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
    expect(() => enumerateBusinessDates("2028-03-01", "2028-02-28")).toThrow();
  });
});
