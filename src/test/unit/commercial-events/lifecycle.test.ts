import { describe, expect, it } from "vitest";

import {
  dateRangesOverlap,
  resolveCommercialEventStatus,
} from "@/domain/commercial-events/lifecycle";

describe("commercial event lifecycle", () => {
  it("creates drafts and requires an explicit publication action", () => {
    expect(
      resolveCommercialEventStatus({ currentStatus: null, action: "save" }),
    ).toBe("draft");
    expect(
      resolveCommercialEventStatus({ currentStatus: null, action: "publish" }),
    ).toBe("published");
  });

  it("only completes a published operation", () => {
    expect(
      resolveCommercialEventStatus({ currentStatus: "draft", action: "complete" }),
    ).toBeNull();
    expect(
      resolveCommercialEventStatus({ currentStatus: "published", action: "complete" }),
    ).toBe("completed");
    expect(
      resolveCommercialEventStatus({ currentStatus: "completed", action: "save" }),
    ).toBeNull();
  });

  it("treats shared boundary dates as an overlap", () => {
    expect(
      dateRangesOverlap(
        { startsOn: "2026-09-01", endsOn: "2026-09-07" },
        { startsOn: "2026-09-07", endsOn: "2026-09-12" },
      ),
    ).toBe(true);
    expect(
      dateRangesOverlap(
        { startsOn: "2026-09-01", endsOn: "2026-09-07" },
        { startsOn: "2026-09-08", endsOn: "2026-09-12" },
      ),
    ).toBe(false);
  });
});
