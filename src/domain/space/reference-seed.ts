import * as z from "zod";

import {
  layoutVersionSchema,
  type LayoutVersion,
  type SellingFace,
  type StoreFixture,
} from "@/domain/space/schemas";

const positionSchema = z.object({
  xM: z.number().finite().nonnegative(),
  yM: z.number().finite().nonnegative(),
});

const referenceIslandSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.literal("island"),
  lengthM: z.number().finite().positive(),
  widthM: z.number().finite().positive(),
  faces: z.literal(4),
  upperShelfDepthM: z.number().finite().positive(),
  associatedEndcaps: z.array(z.string().trim().min(1)),
  position: positionSchema,
  rotationDeg: z.number().finite().min(0).lt(360),
});

const referenceEndcapSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.literal("endcap"),
  widthM: z.number().finite().positive(),
  depthM: z.number().finite().positive(),
  commercialRole: z.string().trim().min(1).optional(),
  associatedFixtureId: z.string().trim().min(1),
  position: positionSchema,
  rotationDeg: z.number().finite().min(0).lt(360),
});

export const referenceLayoutSeedSchema = z.object({
  seedKey: z.string().trim().min(1),
  version: z.number().int().positive(),
  name: z.string().trim().min(1),
  status: z.literal("seed_dimensions_to_confirm"),
  canvas: z.object({
    widthM: z.number().finite().positive(),
    depthM: z.number().finite().positive(),
  }),
  coefficients: z.object({
    upperShelfWeight: z.number().finite().positive(),
    endcapShelfWeight: z.number().finite().positive(),
    standardTrafficWeight: z.number().finite().positive(),
    entranceTrafficWeight: z.number().finite().positive(),
    standardVisibilityWeight: z.number().finite().positive(),
  }),
  fixtures: z.array(
    z.discriminatedUnion("type", [referenceIslandSchema, referenceEndcapSchema]),
  ),
  notes: z.array(z.string().trim().min(1)),
});
export type ReferenceLayoutSeed = z.infer<typeof referenceLayoutSeedSchema>;

function buildIslandFaces(
  fixture: z.infer<typeof referenceIslandSchema>,
  coefficients: ReferenceLayoutSeed["coefficients"],
): SellingFace[] {
  const faceDefinitions = [
    { orientation: "north" as const, label: "Face courte nord", widthM: fixture.widthM },
    { orientation: "east" as const, label: "Face longue est", widthM: fixture.lengthM },
    { orientation: "south" as const, label: "Face courte sud", widthM: fixture.widthM },
    { orientation: "west" as const, label: "Face longue ouest", widthM: fixture.lengthM },
  ];

  return faceDefinitions.map((face) => ({
    id: `${fixture.id}-${face.orientation}`,
    label: face.label,
    orientation: face.orientation,
    widthM: face.widthM,
    trafficWeight: coefficients.standardTrafficWeight,
    visibilityWeight: coefficients.standardVisibilityWeight,
    shelves: [
      {
        id: `${fixture.id}-${face.orientation}-upper`,
        label: "Étagère supérieure",
        level: "upper",
        widthM: face.widthM,
        depthM: fixture.upperShelfDepthM,
        commercialWeight: coefficients.upperShelfWeight,
      },
    ],
  }));
}

export function buildReferenceLayoutVersion(input: {
  source: unknown;
  id: string;
  organizationId: string;
  storeId: string;
  departmentId: string;
  createdBy: string;
  createdAt: string;
}): { seedKey: string; layout: LayoutVersion } {
  const source = referenceLayoutSeedSchema.parse(input.source);
  const fixtures: StoreFixture[] = source.fixtures.map((fixture) => {
    if (fixture.type === "island") {
      return {
        id: fixture.id,
        name: fixture.name,
        type: fixture.type,
        position: fixture.position,
        widthM: fixture.widthM,
        depthM: fixture.lengthM,
        rotationDeg: fixture.rotationDeg,
        commercialRole: null,
        associatedFixtureIds: fixture.associatedEndcaps,
        faces: buildIslandFaces(fixture, source.coefficients),
      };
    }

    return {
      id: fixture.id,
      name: fixture.name,
      type: fixture.type,
      position: fixture.position,
      widthM: fixture.widthM,
      depthM: fixture.depthM,
      rotationDeg: fixture.rotationDeg,
      commercialRole: fixture.commercialRole ?? null,
      associatedFixtureIds: [fixture.associatedFixtureId],
      faces: [
        {
          id: `${fixture.id}-front`,
          label: "Face avant",
          orientation: "front",
          widthM: fixture.widthM,
          trafficWeight:
            fixture.commercialRole === "entrance"
              ? source.coefficients.entranceTrafficWeight
              : source.coefficients.standardTrafficWeight,
          visibilityWeight: source.coefficients.standardVisibilityWeight,
          shelves: [
            {
              id: `${fixture.id}-front-main`,
              label: "Niveau principal",
              level: "main",
              widthM: fixture.widthM,
              depthM: fixture.depthM,
              commercialWeight: source.coefficients.endcapShelfWeight,
            },
          ],
        },
      ],
    };
  });

  return {
    seedKey: source.seedKey,
    layout: layoutVersionSchema.parse({
      id: input.id,
      organizationId: input.organizationId,
      storeId: input.storeId,
      departmentId: input.departmentId,
      departmentKey: "fruit_vegetable",
      version: source.version,
      name: source.name,
      status: source.status,
      source: "reference_seed",
      sourceReference: source.seedKey,
      geometryConfirmed: false,
      canvas: source.canvas,
      fixtures,
      notes: source.notes,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
    }),
  };
}

