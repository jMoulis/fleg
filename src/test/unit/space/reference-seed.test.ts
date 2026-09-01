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
    expect(layout.modelVersion).toBe(2);
    expect(layout.fixtures[0]?.faces).toHaveLength(2);
    expect(
      layout.fixtures[0]?.faces.every((face) => face.modules.length === 4),
    ).toBe(true);
    expect(
      layout.fixtures[0]?.faces.reduce(
        (total, face) => total + face.modules.length,
        0,
      ),
    ).toBe(8);
  });

  it("rejects a shelf wider than its selling module", () => {
    const { layout } = buildReferenceLayoutVersion(seedInput);
    const invalidLayout = structuredClone(layout);
    const firstShelf =
      invalidLayout.fixtures[0]?.faces[0]?.modules[0]?.shelves[0];

    if (!firstShelf) {
      throw new Error("Fixture de test absente");
    }

    firstShelf.widthM = 20;
    expect(layoutVersionSchema.safeParse(invalidLayout).success).toBe(false);
  });

  it("rejects an island without two balanced main faces", () => {
    const { layout } = buildReferenceLayoutVersion(seedInput);
    const invalidLayout = structuredClone(layout);
    const firstIsland = invalidLayout.fixtures[0];

    if (!firstIsland) {
      throw new Error("Îlot de test absent");
    }

    firstIsland.faces.pop();
    expect(layoutVersionSchema.safeParse(invalidLayout).success).toBe(false);
  });

  it("rejects duplicate capacity node ids before allocations use them", () => {
    const { layout } = buildReferenceLayoutVersion(seedInput);
    const invalidLayout = structuredClone(layout);
    const firstShelf =
      invalidLayout.fixtures[0]?.faces[0]?.modules[0]?.shelves[0];
    const secondShelf =
      invalidLayout.fixtures[0]?.faces[0]?.modules[1]?.shelves[0];

    if (!firstShelf || !secondShelf) {
      throw new Error("Niveaux de test absents");
    }

    secondShelf.id = firstShelf.id;
    expect(layoutVersionSchema.safeParse(invalidLayout).success).toBe(false);
  });

  it("reads the former four-face format as two faces of four modules", () => {
    const { layout } = buildReferenceLayoutVersion(seedInput);
    const toLegacyFace = (face: (typeof layout.fixtures)[number]["faces"][number]) => {
      const legacyFace: Record<string, unknown> = { ...face };
      delete legacyFace.modules;

      return {
        ...legacyFace,
        shelves: face.modules[0]?.shelves ?? [],
      };
    };
    const legacyLayout: Record<string, unknown> = {
      ...structuredClone(layout),
      fixtures: layout.fixtures.map((fixture) => {
        if (fixture.type !== "island") {
          return {
            ...fixture,
            faces: fixture.faces.map(toLegacyFace),
          };
        }

        const east = fixture.faces[0];
        const west = fixture.faces[1];

        if (!east || !west) {
          throw new Error("Faces de test absentes");
        }

        return {
          ...fixture,
          faces: [
            toLegacyFace(east),
            { ...toLegacyFace(east), id: `${fixture.id}-north`, orientation: "north" },
            toLegacyFace(west),
            { ...toLegacyFace(west), id: `${fixture.id}-south`, orientation: "south" },
          ],
        };
      }),
    };
    delete legacyLayout.modelVersion;

    const normalized = layoutVersionSchema.parse(legacyLayout);
    const firstIsland = normalized.fixtures.find(
      (fixture) => fixture.id === "island-1",
    );

    expect(normalized.modelVersion).toBe(2);
    expect(firstIsland?.faces).toHaveLength(2);
    expect(firstIsland?.faces.map((face) => face.modules.length)).toEqual([4, 4]);
  });

  it("rejects an unvalidated associated fixture", () => {
    const invalidSource = structuredClone(referenceLayoutSource);
    invalidSource.fixtures[0].associatedEndcaps = ["missing-endcap"];

    expect(() =>
      buildReferenceLayoutVersion({ ...seedInput, source: invalidSource }),
    ).toThrow();
  });
});
