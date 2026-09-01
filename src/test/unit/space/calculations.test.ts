import { describe, expect, it } from "vitest";

import {
  calculateEffectiveCommercialWidthM,
  calculateFixtureFloorAreaM2,
  calculateShelfDisplayAreaM2,
  summarizeLayoutCapacity,
} from "@/domain/space/calculations";
import { buildReferenceLayoutVersion } from "@/domain/space/reference-seed";

import referenceLayoutSource from "../../../../schemas/reference-layout.json";

const layout = buildReferenceLayoutVersion({
  source: referenceLayoutSource,
  id: "66d000000000000000000010",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  departmentId: "66d000000000000000000020",
  createdBy: "manager-a",
  createdAt: "2026-09-01T08:00:00.000Z",
}).layout;

describe("space calculations", () => {
  it("calculates physical areas without applying commercial weights", () => {
    expect(calculateFixtureFloorAreaM2({ widthM: 1.77, depthM: 4.1 })).toBe(
      7.257,
    );
    expect(calculateShelfDisplayAreaM2({ widthM: 4.1, depthM: 0.45 })).toBe(
      1.845,
    );
  });

  it("applies every persisted coefficient to effective width", () => {
    expect(
      calculateEffectiveCommercialWidthM({
        shelfWidthM: 1.77,
        shelfWeight: 1,
        trafficWeight: 1.15,
        visibilityWeight: 1,
      }),
    ).toBe(2.0355);
  });

  it("summarizes the complete reference layout", () => {
    expect(summarizeLayoutCapacity(layout)).toEqual({
      fixtureCount: 5,
      faceCount: 7,
      moduleCount: 19,
      shelfCount: 19,
      fixtureFloorAreaM2: 18.9213,
      shelfDisplayAreaM2: 11.7873,
      effectiveCommercialWidthM: 18.6955,
    });
  });
});
