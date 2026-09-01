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

export const sellingShelfSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  level: shelfLevelSchema,
  widthM: positiveDimensionSchema,
  depthM: positiveDimensionSchema,
  commercialWeight: positiveWeightSchema,
});
export type SellingShelf = z.infer<typeof sellingShelfSchema>;

export const sellingFaceSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(120),
    orientation: z.enum(["north", "east", "south", "west", "front"]),
    widthM: positiveDimensionSchema,
    trafficWeight: positiveWeightSchema,
    visibilityWeight: positiveWeightSchema,
    shelves: z.array(sellingShelfSchema).min(1),
  })
  .superRefine((face, context) => {
    for (const [index, shelf] of face.shelves.entries()) {
      if (shelf.widthM > face.widthM) {
        context.addIssue({
          code: "custom",
          path: ["shelves", index, "widthM"],
          message: "La largeur d'étagère dépasse la face de vente",
        });
      }
    }
  });
export type SellingFace = z.infer<typeof sellingFaceSchema>;

export const storeFixtureSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(160),
  type: z.enum(["island", "endcap", "wall", "bin"]),
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
});
export type StoreFixture = z.infer<typeof storeFixtureSchema>;

export const layoutVersionSchema = z
  .object({
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
  });
export type LayoutVersion = z.infer<typeof layoutVersionSchema>;

export const layoutCapacitySummarySchema = z.object({
  fixtureCount: z.number().int().nonnegative(),
  faceCount: z.number().int().nonnegative(),
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

