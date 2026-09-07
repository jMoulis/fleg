import { describe, expect, it } from "vitest";

import {
  attachmentCreateMetadataSchema,
  attachmentTargetKey,
} from "@/domain/attachments/schemas";

describe("attachment schemas", () => {
  it("accepts explicit store, layout, fixture and event targets", () => {
    const targets = [
      { type: "store" },
      { type: "layout", layoutVersionId: "66d000000000000000000001" },
      {
        type: "fixture",
        layoutVersionId: "66d000000000000000000001",
        fixtureId: "island-1",
      },
      {
        type: "commercial_event",
        eventId: "66d000000000000000000002",
      },
    ] as const;

    for (const target of targets) {
      expect(
        attachmentCreateMetadataSchema.safeParse({
          target,
          caption: null,
          idempotencyKey: crypto.randomUUID(),
        }).success,
      ).toBe(true);
    }
  });

  it("builds version-aware fixture keys", () => {
    expect(
      attachmentTargetKey({
        type: "fixture",
        layoutVersionId: "66d000000000000000000001",
        fixtureId: "island-1",
      }),
    ).toBe("fixture:66d000000000000000000001:island-1");
  });

  it("rejects an unscoped fixture target", () => {
    expect(
      attachmentCreateMetadataSchema.safeParse({
        target: { type: "fixture", fixtureId: "island-1" },
        caption: null,
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
