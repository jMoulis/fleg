import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const positiveDimensionSchema = z.number().finite().positive().max(1_000);
const positiveWeightSchema = z.number().finite().positive().max(10);

export const layoutStatusSchema = z.enum([
  "seed_dimensions_to_confirm",
  "draft",
  "active",
  "superseded",
]);

export const shelfLevelSchema = z.enum(["main", "upper", "lower"]);
export const fixtureTypeSchema = z.enum(["island", "endcap", "wall", "bin"]);
export type FixtureType = z.infer<typeof fixtureTypeSchema>;

export const sellingShelfSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  level: shelfLevelSchema,
  widthM: positiveDimensionSchema,
  depthM: positiveDimensionSchema,
  commercialWeight: positiveWeightSchema,
});
export type SellingShelf = z.infer<typeof sellingShelfSchema>;

export const sellingModuleSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(120),
    position: z.number().int().positive().max(100),
    widthM: positiveDimensionSchema,
    shelves: z.array(sellingShelfSchema).min(1),
  })
  .superRefine((module, context) => {
    for (const [index, shelf] of module.shelves.entries()) {
      if (shelf.widthM > module.widthM) {
        context.addIssue({
          code: "custom",
          path: ["shelves", index, "widthM"],
          message: "La largeur d'étagère dépasse le module",
        });
      }
    }
  });
export type SellingModule = z.infer<typeof sellingModuleSchema>;

const sellingFaceV2Schema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(120),
    orientation: z.enum(["north", "east", "south", "west", "front"]),
    widthM: positiveDimensionSchema,
    trafficWeight: positiveWeightSchema,
    visibilityWeight: positiveWeightSchema,
    modules: z.array(sellingModuleSchema).min(1).max(100),
  })
  .superRefine((face, context) => {
    const positions = new Set(face.modules.map((module) => module.position));
    const moduleWidthM = face.modules.reduce(
      (total, module) => total + module.widthM,
      0,
    );

    if (positions.size !== face.modules.length) {
      context.addIssue({
        code: "custom",
        path: ["modules"],
        message: "Les positions des modules doivent être uniques sur une face",
      });
    }

    if (Math.abs(moduleWidthM - face.widthM) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["modules"],
        message: "La somme des modules doit correspondre à la largeur de la face",
      });
    }
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wrapLegacyFaceShelves(value: unknown): unknown {
  if (!isRecord(value) || Array.isArray(value.modules) || !Array.isArray(value.shelves)) {
    return value;
  }

  const id = typeof value.id === "string" ? value.id : "legacy-face";

  return {
    ...value,
    modules: [
      {
        id: `${id}-module-1`,
        label: "Module 1",
        position: 1,
        widthM: value.widthM,
        shelves: value.shelves,
      },
    ],
  };
}

export const sellingFaceSchema = z.preprocess(
  wrapLegacyFaceShelves,
  sellingFaceV2Schema,
);
export type SellingFace = z.infer<typeof sellingFaceSchema>;

export const storeFixtureSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    type: fixtureTypeSchema,
    position: z.object({
      xM: z.number().finite().nonnegative().max(1_000),
      yM: z.number().finite().nonnegative().max(1_000),
    }),
    widthM: positiveDimensionSchema,
    depthM: positiveDimensionSchema,
    rotationDeg: z.number().finite().min(0).lt(360),
    commercialRole: z.string().trim().min(1).max(100).nullable(),
    associatedFixtureIds: z.array(z.string().trim().min(1).max(100)),
    faces: z.array(sellingFaceSchema).min(1),
  })
  .superRefine((fixture, context) => {
    if (fixture.type !== "island") {
      return;
    }

    if (fixture.faces.length !== 2) {
      context.addIssue({
        code: "custom",
        path: ["faces"],
        message: "Un îlot doit comporter exactement deux faces principales",
      });
      return;
    }

    const orientations = new Set(
      fixture.faces.map((face) => face.orientation),
    );
    const moduleCounts = new Set(
      fixture.faces.map((face) => face.modules.length),
    );

    if (!orientations.has("east") || !orientations.has("west")) {
      context.addIssue({
        code: "custom",
        path: ["faces"],
        message: "Les deux faces principales d'un îlot doivent être opposées",
      });
    }

    if (moduleCounts.size !== 1) {
      context.addIssue({
        code: "custom",
        path: ["faces"],
        message: "Les deux faces d'un îlot doivent avoir le même nombre de modules",
      });
    }
  });
export type StoreFixture = z.infer<typeof storeFixtureSchema>;

function hasDuplicateLayoutNodeIds(
  fixtures: z.infer<typeof storeFixtureSchema>[],
): boolean {
  const ids = new Set<string>();

  for (const fixture of fixtures) {
    for (const face of fixture.faces) {
      if (ids.has(face.id)) {
        return true;
      }
      ids.add(face.id);

      for (const sellingModule of face.modules) {
        if (ids.has(sellingModule.id)) {
          return true;
        }
        ids.add(sellingModule.id);

        for (const shelf of sellingModule.shelves) {
          if (ids.has(shelf.id)) {
            return true;
          }
          ids.add(shelf.id);
        }
      }
    }
  }

  return false;
}

function fixturesOverlap(
  first: z.infer<typeof storeFixtureSchema>,
  second: z.infer<typeof storeFixtureSchema>,
): boolean {
  return (
    first.position.xM < second.position.xM + second.widthM &&
    first.position.xM + first.widthM > second.position.xM &&
    first.position.yM < second.position.yM + second.depthM &&
    first.position.yM + first.depthM > second.position.yM
  );
}

function splitLegacyIslandFace(
  faceValue: Record<string, unknown>,
  faceIndex: number,
): Record<string, unknown> {
  const faceId =
    typeof faceValue.id === "string" ? faceValue.id : `legacy-face-${faceIndex + 1}`;
  const faceWidthM =
    typeof faceValue.widthM === "number" ? faceValue.widthM : 1;
  const shelves = Array.isArray(faceValue.shelves) ? faceValue.shelves : [];
  const moduleCount = 4;
  const moduleWidthM = faceWidthM / moduleCount;

  return {
    ...faceValue,
    label: faceIndex === 0 ? "Face A" : "Face B",
    modules: Array.from({ length: moduleCount }, (_, moduleIndex) => ({
      id: `${faceId}-module-${moduleIndex + 1}`,
      label: `Module ${moduleIndex + 1}`,
      position: moduleIndex + 1,
      widthM: moduleWidthM,
      shelves: shelves.map((shelf, shelfIndex) => {
        const shelfValue = isRecord(shelf) ? shelf : {};
        return {
          ...shelfValue,
          id: `${faceId}-module-${moduleIndex + 1}-shelf-${shelfIndex + 1}`,
          widthM: moduleWidthM,
        };
      }),
    })),
  };
}

function normalizeLegacyLayout(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.fixtures)) {
    return value;
  }

  return {
    ...value,
    modelVersion: 2,
    fixtures: value.fixtures.map((fixtureValue) => {
      if (!isRecord(fixtureValue) || !Array.isArray(fixtureValue.faces)) {
        return fixtureValue;
      }

      const alreadyModular = fixtureValue.faces.every(
        (face) => isRecord(face) && Array.isArray(face.modules),
      );

      if (fixtureValue.type !== "island" || alreadyModular) {
        return fixtureValue;
      }

      const longFaces = fixtureValue.faces.filter(
        (face) =>
          isRecord(face) &&
          (face.orientation === "east" || face.orientation === "west"),
      );
      const sourceFaces =
        longFaces.length >= 2 ? longFaces.slice(0, 2) : fixtureValue.faces.slice(0, 2);

      return {
        ...fixtureValue,
        faces: sourceFaces.map((face, index) =>
          splitLegacyIslandFace(isRecord(face) ? face : {}, index),
        ),
      };
    }),
  };
}

const layoutVersionV2Schema = z
  .object({
    modelVersion: z.literal(2).default(2),
    id: mongoIdSchema,
    organizationId: z.string().min(1),
    storeId: storeIdSchema,
    departmentId: mongoIdSchema,
    departmentKey: z.literal("fruit_vegetable"),
    version: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    status: layoutStatusSchema,
    source: z.enum(["reference_seed", "manager"]),
    sourceReference: z.string().trim().min(1).max(160).nullable(),
    geometryConfirmed: z.boolean(),
    canvas: z.object({
      widthM: positiveDimensionSchema,
      depthM: positiveDimensionSchema,
    }),
    fixtures: z.array(storeFixtureSchema),
    notes: z.array(z.string().trim().min(1).max(500)),
    createdBy: z.string().min(1),
    createdAt: z.iso.datetime(),
  })
  .superRefine((layout, context) => {
    const fixtureIds = new Set(layout.fixtures.map((fixture) => fixture.id));

    if (fixtureIds.size !== layout.fixtures.length) {
      context.addIssue({
        code: "custom",
        path: ["fixtures"],
        message: "Les identifiants de mobilier doivent être uniques",
      });
    }

    if (hasDuplicateLayoutNodeIds(layout.fixtures)) {
      context.addIssue({
        code: "custom",
        path: ["fixtures"],
        message: "Les identifiants de face, module et niveau doivent être uniques",
      });
    }

    for (const [index, fixture] of layout.fixtures.entries()) {
      if (
        fixture.position.xM + fixture.widthM > layout.canvas.widthM ||
        fixture.position.yM + fixture.depthM > layout.canvas.depthM
      ) {
        context.addIssue({
          code: "custom",
          path: ["fixtures", index, "position"],
          message: "Le mobilier dépasse la zone de plan",
        });
      }

      for (const associatedId of fixture.associatedFixtureIds) {
        if (!fixtureIds.has(associatedId)) {
          context.addIssue({
            code: "custom",
            path: ["fixtures", index, "associatedFixtureIds"],
            message: "Le mobilier associé n'existe pas dans cette version",
          });
        }
      }
    }

    for (let firstIndex = 0; firstIndex < layout.fixtures.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < layout.fixtures.length;
        secondIndex += 1
      ) {
        const first = layout.fixtures[firstIndex];
        const second = layout.fixtures[secondIndex];

        if (first && second && fixturesOverlap(first, second)) {
          context.addIssue({
            code: "custom",
            path: ["fixtures", secondIndex, "position"],
            message: `Le mobilier chevauche ${first.name}`,
          });
        }
      }
    }
  });
export const layoutVersionSchema = z.preprocess(
  normalizeLegacyLayout,
  layoutVersionV2Schema,
);
export type LayoutVersion = z.infer<typeof layoutVersionSchema>;

export const layoutCapacitySummarySchema = z.object({
  fixtureCount: z.number().int().nonnegative(),
  faceCount: z.number().int().nonnegative(),
  moduleCount: z.number().int().nonnegative(),
  shelfCount: z.number().int().nonnegative(),
  fixtureFloorAreaM2: z.number().finite().nonnegative(),
  shelfDisplayAreaM2: z.number().finite().nonnegative(),
  effectiveCommercialWidthM: z.number().finite().nonnegative(),
});
export type LayoutCapacitySummary = z.infer<
  typeof layoutCapacitySummarySchema
>;

export const layoutResponseSchema = z.object({
  layout: layoutVersionSchema.nullable(),
  summary: layoutCapacitySummarySchema.nullable(),
  requestId: z.uuid(),
});

export const layoutVersionCreateInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    geometryConfirmed: z.boolean(),
    canvas: z.object({
      widthM: positiveDimensionSchema,
      depthM: positiveDimensionSchema,
    }),
    fixtures: z.array(storeFixtureSchema).min(1).max(100),
    versionNote: z.string().trim().max(500).optional(),
  })
  .superRefine((input, context) => {
    const fixtureIds = new Set(input.fixtures.map((fixture) => fixture.id));

    if (fixtureIds.size !== input.fixtures.length) {
      context.addIssue({
        code: "custom",
        path: ["fixtures"],
        message: "Les identifiants de mobilier doivent être uniques",
      });
    }

    if (hasDuplicateLayoutNodeIds(input.fixtures)) {
      context.addIssue({
        code: "custom",
        path: ["fixtures"],
        message: "Les identifiants de face, module et niveau doivent être uniques",
      });
    }

    for (const [index, fixture] of input.fixtures.entries()) {
      if (
        fixture.position.xM + fixture.widthM > input.canvas.widthM ||
        fixture.position.yM + fixture.depthM > input.canvas.depthM
      ) {
        context.addIssue({
          code: "custom",
          path: ["fixtures", index, "position"],
          message: "Le mobilier dépasse la zone de plan",
        });
      }

      for (const associatedId of fixture.associatedFixtureIds) {
        if (!fixtureIds.has(associatedId)) {
          context.addIssue({
            code: "custom",
            path: ["fixtures", index, "associatedFixtureIds"],
            message: "Le mobilier associé n'existe pas dans cette version",
          });
        }
      }
    }

    for (let firstIndex = 0; firstIndex < input.fixtures.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < input.fixtures.length;
        secondIndex += 1
      ) {
        const first = input.fixtures[firstIndex];
        const second = input.fixtures[secondIndex];

        if (first && second && fixturesOverlap(first, second)) {
          context.addIssue({
            code: "custom",
            path: ["fixtures", secondIndex, "position"],
            message: `Le mobilier chevauche ${first.name}`,
          });
        }
      }
    }
  });
export type LayoutVersionCreateInput = z.infer<
  typeof layoutVersionCreateInputSchema
>;
