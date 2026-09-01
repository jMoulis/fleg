import { describe, expect, it } from "vitest";

import {
  addDays,
  eventCoversDate,
  getIsoWeekDays,
  startOfIsoWeek,
} from "@/domain/commercial-events/calendar";

describe("commercial event calendar", () => {
  it("builds an ISO week from Monday to Sunday", () => {
    expect(startOfIsoWeek("2026-09-01")).toBe("2026-08-31");
    expect(getIsoWeekDays("2026-09-01")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("crosses month boundaries without local timezone drift", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("includes both endpoints of an operation", () => {
    const operation = { startsOn: "2026-09-01", endsOn: "2026-09-07" };

    expect(eventCoversDate(operation, "2026-09-01")).toBe(true);
    expect(eventCoversDate(operation, "2026-09-07")).toBe(true);
    expect(eventCoversDate(operation, "2026-09-08")).toBe(false);
  });
});
