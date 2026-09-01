import { describe, expect, it } from "vitest";

import { buildReferenceLayoutVersion } from "@/domain/space/reference-seed";
import { layoutVersionSchema } from "@/domain/space/schemas";

import referenceLayoutSource from "../../../../schemas/reference-layout.json";

const seedInput = {
  source: referenceLayoutSource,
  id: "66d000000000000000000010",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  departmentId: "66d000000000000000000020",
  createdBy: "manager-a",
  createdAt: "2026-09-01T08:00:00.000Z",
};

describe("reference layout seed", () => {
  it("normalizes the supplied sketch into a tenant-scoped version", () => {
    const { seedKey, layout } = buildReferenceLayoutVersion(seedInput);

    expect(seedKey).toBe("reference-layout-v1");
    expect(layout).toMatchObject({
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
      departmentId: "66d000000000000000000020",
      departmentKey: "fruit_vegetable",
      version: 1,
      status: "seed_dimensions_to_confirm",
      geometryConfirmed: false,
    });
    expect(layout.fixtures.map(({ id }) => id)).toEqual([
      "island-1",
      "island-2",
      "tg-1",
      "tg-2",
      "tg-3",
    ]);
    expect(layout.fixtures[0]?.faces).toHaveLength(4);
  });

  it("rejects a shelf wider than its selling face", () => {
    const { layout } = buildReferenceLayoutVersion(seedInput);
    const invalidLayout = structuredClone(layout);
    const firstShelf = invalidLayout.fixtures[0]?.faces[0]?.shelves[0];

    if (!firstShelf) {
      throw new Error("Fixture de test absente");
    }

    firstShelf.widthM = 20;
    expect(layoutVersionSchema.safeParse(invalidLayout).success).toBe(false);
  });

  it("rejects an unvalidated associated fixture", () => {
    const invalidSource = structuredClone(referenceLayoutSource);
    invalidSource.fixtures[0].associatedEndcaps = ["missing-endcap"];

    expect(() =>
      buildReferenceLayoutVersion({ ...seedInput, source: invalidSource }),
    ).toThrow();
  });
});

