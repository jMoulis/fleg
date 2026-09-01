import * as z from "zod";

import {
  fixtureTypeSchema,
  type FixtureType,
  type LayoutVersion,
  type StoreFixture,
} from "@/domain/space/schemas";

export interface FixtureGeometryUpdate {
  name: string;
  widthM: number;
  depthM: number;
  xM: number;
  yM: number;
}

const positiveEditorValueSchema = z.number().finite().positive().max(1_000);
const positiveEditorWeightSchema = z.number().finite().positive().max(10);

export const newFixtureInputSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    type: fixtureTypeSchema,
    name: z.string().trim().min(1).max(160),
    widthM: positiveEditorValueSchema,
    depthM: positiveEditorValueSchema,
    shelfDepthM: positiveEditorValueSchema,
    trafficWeight: positiveEditorWeightSchema,
    visibilityWeight: positiveEditorWeightSchema,
    commercialWeight: positiveEditorWeightSchema,
    modulesPerMainFace: z.number().int().positive().max(20),
    commercialRole: z.literal("entrance").nullable(),
    associatedFixtureId: z.string().trim().min(1).max(100).nullable(),
  })
  .superRefine((fixture, context) => {
    if (fixture.commercialRole === "entrance" && fixture.type !== "endcap") {
      context.addIssue({
        code: "custom",
        path: ["commercialRole"],
        message: "Le rôle entrée est réservé aux têtes de gondole",
      });
    }

    if (fixture.type !== "island" && fixture.modulesPerMainFace !== 1) {
      context.addIssue({
        code: "custom",
        path: ["modulesPerMainFace"],
        message: "Seuls les îlots peuvent comporter plusieurs modules par face",
      });
    }
  });
export type NewFixtureInput = z.infer<typeof newFixtureInputSchema>;
export type NewFixtureDraft = Omit<NewFixtureInput, "id">;

const fixtureDefaultNames: Record<FixtureType, string> = {
  island: "Nouvel îlot",
  endcap: "Nouvelle tête de gondole",
  wall: "Nouveau mobilier mural",
  bin: "Nouveau bac",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function overlapsAtPosition(
  fixture: Pick<StoreFixture, "widthM" | "depthM">,
  position: StoreFixture["position"],
  existing: StoreFixture,
): boolean {
  return (
    position.xM < existing.position.xM + existing.widthM &&
    position.xM + fixture.widthM > existing.position.xM &&
    position.yM < existing.position.yM + existing.depthM &&
    position.yM + fixture.depthM > existing.position.yM
  );
}

function findAvailablePosition(
  layout: LayoutVersion,
  source: StoreFixture,
): StoreFixture["position"] | null {
  const stepM = 0.25;
  const maximumX = Math.max(0, layout.canvas.widthM - source.widthM);
  const maximumY = Math.max(0, layout.canvas.depthM - source.depthM);

  for (let yM = 0; yM <= maximumY + Number.EPSILON; yM += stepM) {
    for (let xM = 0; xM <= maximumX + Number.EPSILON; xM += stepM) {
      const position = {
        xM: Math.round(xM * 100) / 100,
        yM: Math.round(yM * 100) / 100,
      };
      const overlaps = layout.fixtures.some((fixture) =>
        overlapsAtPosition(source, position, fixture),
      );

      if (!overlaps) {
        return position;
      }
    }
  }

  return null;
}

export function getFixtureCreationDefaults(
  layout: LayoutVersion,
  type: FixtureType,
): NewFixtureDraft {
  const source =
    layout.fixtures.find(
      (fixture) => fixture.type === type && fixture.commercialRole !== "entrance",
    ) ?? layout.fixtures[0];

  if (!source) {
    throw new Error("Un mobilier source est requis pour proposer des valeurs");
  }

  const sourceFace = source.faces[0];
  const sourceModule = sourceFace?.modules[0];
  const sourceShelf = sourceModule?.shelves[0];

  if (!sourceFace || !sourceModule || !sourceShelf) {
    throw new Error("Le mobilier source ne contient aucune capacité commerciale");
  }

  return {
    type,
    name: fixtureDefaultNames[type],
    widthM: source.widthM,
    depthM: source.depthM,
    shelfDepthM: sourceShelf.depthM,
    trafficWeight: sourceFace.trafficWeight,
    visibilityWeight: sourceFace.visibilityWeight,
    commercialWeight: sourceShelf.commercialWeight,
    modulesPerMainFace:
      type === "island" ? sourceFace.modules.length : 1,
    commercialRole: null,
    associatedFixtureId: null,
  };
}

function buildFixtureFaces(input: NewFixtureInput) {
  if (input.type === "island") {
    const faceDefinitions = [
      { orientation: "east" as const, label: "Face A", widthM: input.depthM },
      { orientation: "west" as const, label: "Face B", widthM: input.depthM },
    ];

    return faceDefinitions.map((face, index) => ({
      id: `${input.id}-face-${index + 1}`,
      label: face.label,
      orientation: face.orientation,
      widthM: face.widthM,
      trafficWeight: input.trafficWeight,
      visibilityWeight: input.visibilityWeight,
      modules: Array.from(
        { length: input.modulesPerMainFace },
        (_, moduleIndex) => {
          const moduleWidthM = face.widthM / input.modulesPerMainFace;
          return {
            id: `${input.id}-face-${index + 1}-module-${moduleIndex + 1}`,
            label: `Module ${moduleIndex + 1}`,
            position: moduleIndex + 1,
            widthM: moduleWidthM,
            shelves: [
              {
                id: `${input.id}-face-${index + 1}-module-${moduleIndex + 1}-shelf-1`,
                label: "Étagère supérieure",
                level: "upper" as const,
                widthM: moduleWidthM,
                depthM: input.shelfDepthM,
                commercialWeight: input.commercialWeight,
              },
            ],
          };
        },
      ),
    }));
  }

  return [
    {
      id: `${input.id}-face-1`,
      label: "Face avant",
      orientation: "front" as const,
      widthM: input.widthM,
      trafficWeight: input.trafficWeight,
      visibilityWeight: input.visibilityWeight,
      modules: [
        {
          id: `${input.id}-face-1-module-1`,
          label: "Module 1",
          position: 1,
          widthM: input.widthM,
          shelves: [
            {
              id: `${input.id}-face-1-module-1-shelf-1`,
              label: "Niveau principal",
              level: "main" as const,
              widthM: input.widthM,
              depthM: input.shelfDepthM,
              commercialWeight: input.commercialWeight,
            },
          ],
        },
      ],
    },
  ];
}

export function addLayoutFixture(
  layout: LayoutVersion,
  inputValue: NewFixtureInput,
): LayoutVersion {
  const input = newFixtureInputSchema.parse(inputValue);

  if (
    layout.fixtures.some((fixture) => fixture.id === input.id) ||
    (input.associatedFixtureId &&
      !layout.fixtures.some((fixture) => fixture.id === input.associatedFixtureId))
  ) {
    return layout;
  }

  const fixture: StoreFixture = {
    id: input.id,
    type: input.type,
    name: input.name,
    widthM: input.widthM,
    depthM: input.depthM,
    position: { xM: 0, yM: 0 },
    rotationDeg: 0,
    commercialRole: input.commercialRole,
    associatedFixtureIds: input.associatedFixtureId
      ? [input.associatedFixtureId]
      : [],
    faces: buildFixtureFaces(input),
  };
  const position = findAvailablePosition(layout, fixture);

  if (!position) {
    return layout;
  }

  return {
    ...layout,
    fixtures: [...layout.fixtures, { ...fixture, position }],
  };
}

function resizeFixtureFaces(
  fixture: StoreFixture,
  widthM: number,
  depthM: number,
) {
  return fixture.faces.map((face) => {
    const faceWidthM =
      face.orientation === "east" || face.orientation === "west"
        ? depthM
        : widthM;

    return {
      ...face,
      widthM: faceWidthM,
      modules: face.modules.map((module) => {
        const moduleWidthM = faceWidthM / face.modules.length;
        return {
          ...module,
          widthM: moduleWidthM,
          shelves: module.shelves.map((shelf) => ({
            ...shelf,
            widthM: moduleWidthM,
            depthM:
              fixture.type === "endcap" && shelf.level === "main"
                ? depthM
                : shelf.depthM,
          })),
        };
      }),
    };
  });
}

export function updateFixtureGeometry(
  layout: LayoutVersion,
  fixtureId: string,
  update: FixtureGeometryUpdate,
): LayoutVersion {
  return {
    ...layout,
    fixtures: layout.fixtures.map((fixture) => {
      if (fixture.id !== fixtureId) {
        return fixture;
      }

      const widthM = Math.max(0.01, update.widthM);
      const depthM = Math.max(0.01, update.depthM);

      return {
        ...fixture,
        name: update.name,
        widthM,
        depthM,
        position: {
          xM: clamp(update.xM, 0, layout.canvas.widthM - widthM),
          yM: clamp(update.yM, 0, layout.canvas.depthM - depthM),
        },
        faces: resizeFixtureFaces(fixture, widthM, depthM),
      };
    }),
  };
}

export function updateIslandModulesPerFace(
  layout: LayoutVersion,
  fixtureId: string,
  requestedModuleCount: number,
): LayoutVersion {
  if (
    !Number.isInteger(requestedModuleCount) ||
    requestedModuleCount < 1 ||
    requestedModuleCount > 20
  ) {
    return layout;
  }

  const fixture = layout.fixtures.find((item) => item.id === fixtureId);

  if (!fixture || fixture.type !== "island") {
    return layout;
  }

  return {
    ...layout,
    fixtures: layout.fixtures.map((item) => {
      if (item.id !== fixtureId) {
        return item;
      }

      return {
        ...item,
        faces: item.faces.map((face) => {
          const sourceModule = face.modules[0];

          if (!sourceModule) {
            return face;
          }

          const moduleWidthM = face.widthM / requestedModuleCount;
          const modules = Array.from(
            { length: requestedModuleCount },
            (_, moduleIndex) => {
              const existingModule = face.modules[moduleIndex];
              const moduleId =
                existingModule?.id ?? `${face.id}-module-${moduleIndex + 1}`;
              const shelves = existingModule?.shelves ?? sourceModule.shelves;

              return {
                ...(existingModule ?? structuredClone(sourceModule)),
                id: moduleId,
                label: existingModule?.label ?? `Module ${moduleIndex + 1}`,
                position: moduleIndex + 1,
                widthM: moduleWidthM,
                shelves: shelves.map((shelf, shelfIndex) => ({
                  ...structuredClone(shelf),
                  id:
                    existingModule?.shelves[shelfIndex]?.id ??
                    `${moduleId}-shelf-${shelfIndex + 1}`,
                  widthM: moduleWidthM,
                })),
              };
            },
          );

          return { ...face, modules };
        }),
      };
    }),
  };
}

export function duplicateLayoutFixture(
  layout: LayoutVersion,
  fixtureId: string,
  newFixtureId: string,
): LayoutVersion {
  const source = layout.fixtures.find((fixture) => fixture.id === fixtureId);

  if (!source) {
    return layout;
  }

  const position = findAvailablePosition(layout, source);

  if (!position) {
    return layout;
  }

  const duplicate: StoreFixture = {
    ...structuredClone(source),
    id: newFixtureId,
    name: `${source.name.slice(0, 151)} (copie)`,
    position,
    associatedFixtureIds: [],
    faces: source.faces.map((face, faceIndex) => ({
      ...structuredClone(face),
      id: `${newFixtureId}-face-${faceIndex + 1}`,
      modules: face.modules.map((module, moduleIndex) => ({
        ...structuredClone(module),
        id: `${newFixtureId}-face-${faceIndex + 1}-module-${moduleIndex + 1}`,
        shelves: module.shelves.map((shelf, shelfIndex) => ({
          ...structuredClone(shelf),
          id: `${newFixtureId}-face-${faceIndex + 1}-module-${moduleIndex + 1}-shelf-${shelfIndex + 1}`,
        })),
      })),
    })),
  };

  return { ...layout, fixtures: [...layout.fixtures, duplicate] };
}

export function removeLayoutFixture(
  layout: LayoutVersion,
  fixtureId: string,
): LayoutVersion {
  if (layout.fixtures.length <= 1) {
    return layout;
  }

  return {
    ...layout,
    fixtures: layout.fixtures
      .filter((fixture) => fixture.id !== fixtureId)
      .map((fixture) => ({
        ...fixture,
        associatedFixtureIds: fixture.associatedFixtureIds.filter(
          (associatedId) => associatedId !== fixtureId,
        ),
      })),
  };
}

export function resizeLayoutCanvas(
  layout: LayoutVersion,
  canvas: LayoutVersion["canvas"],
): LayoutVersion {
  return {
    ...layout,
    canvas,
    fixtures: layout.fixtures.map((fixture) => ({
      ...fixture,
      position: {
        xM: clamp(fixture.position.xM, 0, canvas.widthM - fixture.widthM),
        yM: clamp(fixture.position.yM, 0, canvas.depthM - fixture.depthM),
      },
    })),
  };
}
