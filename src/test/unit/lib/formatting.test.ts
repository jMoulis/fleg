import { describe, expect, it } from "vitest";

import { formatMoney, formatRatio } from "@/lib/formatting";

describe("business formatting", () => {
  it("formats integer cents as euros", () => {
    expect(formatMoney(12_345)).toContain("123");
  });

  it("formats decimal ratios as percentages", () => {
    expect(formatRatio(0.321)).toContain("32,1");
  });

  it("keeps unavailable values explicit", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatRatio(null)).toBe("—");
  });
});
