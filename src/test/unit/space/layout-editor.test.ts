import { describe, expect, it } from "vitest";

import {
  addLayoutFixture,
  duplicateLayoutFixture,
  getFixtureCreationDefaults,
  newFixtureInputSchema,
  removeLayoutFixture,
  resizeLayoutCanvas,
  updateFixtureGeometry,
  updateIslandModulesPerFace,
} from "@/domain/space/layout-editor";
import { buildReferenceLayoutVersion } from "@/domain/space/reference-seed";
import {
  layoutVersionCreateInputSchema,
  layoutVersionSchema,
} from "@/domain/space/schemas";
import { buildNextLayoutVersion } from "@/domain/space/versioning";

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

function validCreateInput() {
  return layoutVersionCreateInputSchema.parse({
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    basedOnVersion: layout.version,
    name: "Plan relevé sur site",
    geometryConfirmed: true,
    canvas: layout.canvas,
    fixtures: layout.fixtures,
    versionNote: "Mesures contrôlées avec le manager.",
  });
}

describe("mobile layout editor domain", () => {
  it("resizes a fixture, its faces and its shelves consistently", () => {
    const updated = updateFixtureGeometry(layout, "island-1", {
      name: "Îlot légumes relevé",
      widthM: 1.8,
      depthM: 4.5,
      xM: 100,
      yM: 2,
    });
    const fixture = updated.fixtures.find(({ id }) => id === "island-1");

    expect(fixture).toMatchObject({
      name: "Îlot légumes relevé",
      widthM: 1.8,
      depthM: 4.5,
      position: { xM: 9.7, yM: 2 },
    });
    const eastFace = fixture?.faces.find(
      ({ orientation }) => orientation === "east",
    );

    expect(fixture?.faces).toHaveLength(2);
    expect(eastFace?.widthM).toBe(4.5);
    expect(eastFace?.modules).toHaveLength(4);
    expect(eastFace?.modules[0]?.widthM).toBe(1.125);
    expect(eastFace?.modules[0]?.shelves[0]?.widthM).toBe(1.125);
  });

  it("duplicates a fixture without copying unsafe associations or ids", () => {
    const updated = duplicateLayoutFixture(
      layout,
      "island-1",
      "new-island",
    );
    const duplicate = updated.fixtures.find(({ id }) => id === "new-island");

    expect(updated.fixtures).toHaveLength(6);
    expect(duplicate?.associatedFixtureIds).toEqual([]);
    expect(duplicate?.faces.every((face) => face.id.startsWith("new-island"))).toBe(true);
    expect(duplicate?.faces[0]?.trafficWeight).toBe(
      layout.fixtures[0]?.faces[0]?.trafficWeight,
    );
  });

  it("derives editable creation defaults from the current layout", () => {
    const defaults = getFixtureCreationDefaults(layout, "endcap");

    expect(defaults).toMatchObject({
      type: "endcap",
      widthM: 1.77,
      depthM: 0.83,
      trafficWeight: 1,
      visibilityWeight: 1,
      commercialWeight: 1,
      modulesPerMainFace: 1,
    });
  });

  it("changes the module count on both faces while preserving the hierarchy", () => {
    const updated = updateIslandModulesPerFace(layout, "island-1", 5);
    const fixture = updated.fixtures.find(({ id }) => id === "island-1");

    expect(fixture?.faces).toHaveLength(2);
    expect(fixture?.faces.every((face) => face.modules.length === 5)).toBe(true);
    expect(fixture?.faces[0]?.modules[0]?.id).toBe(
      layout.fixtures[0]?.faces[0]?.modules[0]?.id,
    );
    expect(fixture?.faces[0]?.modules[0]?.widthM).toBe(0.82);
    expect(layoutVersionSchema.safeParse(updated).success).toBe(true);
  });

  it.each(["island", "endcap", "wall", "bin"] as const)(
    "adds a new %s with explicit commercial coefficients",
    (type) => {
      const defaults = getFixtureCreationDefaults(layout, type);
      const input = newFixtureInputSchema.parse({
        ...defaults,
        id: `new-${type}`,
        trafficWeight: 1.1,
        visibilityWeight: 0.95,
        commercialWeight: 0.85,
        commercialRole: type === "endcap" ? "entrance" : null,
        associatedFixtureId: type === "endcap" ? "island-1" : null,
      });
      const updated = addLayoutFixture(layout, input);
      const fixture = updated.fixtures.find(({ id }) => id === `new-${type}`);

      expect(fixture).toBeDefined();
      expect(layoutVersionSchema.safeParse(updated).success).toBe(true);
      expect(fixture?.faces).toHaveLength(type === "island" ? 2 : 1);
      expect(
        fixture?.faces.reduce(
          (total, face) => total + face.modules.length,
          0,
        ),
      ).toBe(type === "island" ? 8 : 1);
      expect(fixture?.faces[0]).toMatchObject({
        trafficWeight: 1.1,
        visibilityWeight: 0.95,
      });
      expect(
        fixture?.faces[0]?.modules[0]?.shelves[0]?.commercialWeight,
      ).toBe(0.85);
    },
  );

  it("rejects an entrance role on non-endcap furniture", () => {
    const defaults = getFixtureCreationDefaults(layout, "wall");

    expect(
      newFixtureInputSchema.safeParse({
        ...defaults,
        id: "invalid-wall",
        commercialRole: "entrance",
      }).success,
    ).toBe(false);
  });

  it("removes associations to a deleted fixture", () => {
    const updated = removeLayoutFixture(layout, "island-1");

    expect(updated.fixtures.some(({ id }) => id === "island-1")).toBe(false);
    expect(
      updated.fixtures
        .flatMap(({ associatedFixtureIds }) => associatedFixtureIds)
        .includes("island-1"),
    ).toBe(false);
  });

  it("clamps existing furniture when the canvas changes", () => {
    const updated = resizeLayoutCanvas(layout, { widthM: 8.3, depthM: 7 });
    const island2 = updated.fixtures.find(({ id }) => id === "island-2");

    expect(island2?.position.xM).toBe(6.5);
    expect(island2?.position.yM).toBeLessThanOrEqual(2.9);
  });

  it("rejects empty or overflowing plan versions", () => {
    const valid = validCreateInput();
    const empty = { ...valid, fixtures: [] };
    const overflowing = structuredClone(valid);
    const firstFixture = overflowing.fixtures[0];

    if (!firstFixture) {
      throw new Error("Fixture de test absente");
    }

    firstFixture.position.xM = overflowing.canvas.widthM;
    expect(layoutVersionCreateInputSchema.safeParse(empty).success).toBe(false);
    expect(layoutVersionCreateInputSchema.safeParse(overflowing).success).toBe(false);
  });

  it("creates an immutable manager draft as the next version", () => {
    const next = buildNextLayoutVersion({
      current: layout,
      createInput: validCreateInput(),
      id: "66d000000000000000000011",
      actorUserId: "manager-b",
      createdAt: "2026-09-01T09:00:00.000Z",
    });

    expect(next).toMatchObject({
      id: "66d000000000000000000011",
      version: 2,
      status: "draft",
      source: "manager",
      geometryConfirmed: true,
      createdBy: "manager-b",
    });
    expect(next.notes.at(-1)).toBe("Mesures contrôlées avec le manager.");
    expect(layout.version).toBe(1);
  });
});
