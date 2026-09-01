import type {
  LayoutCapacitySummary,
  LayoutVersion,
  SellingShelf,
  StoreFixture,
} from "@/domain/space/schemas";

function roundMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export function calculateFixtureFloorAreaM2(
  fixture: Pick<StoreFixture, "widthM" | "depthM">,
): number {
  return roundMetric(fixture.widthM * fixture.depthM);
}

export function calculateShelfDisplayAreaM2(
  shelf: Pick<SellingShelf, "widthM" | "depthM">,
): number {
  return roundMetric(shelf.widthM * shelf.depthM);
}

export function calculateEffectiveCommercialWidthM(input: {
  shelfWidthM: number;
  shelfWeight: number;
  trafficWeight: number;
  visibilityWeight: number;
}): number {
  return roundMetric(
    input.shelfWidthM *
      input.shelfWeight *
      input.trafficWeight *
      input.visibilityWeight,
  );
}

export function summarizeLayoutCapacity(
  layout: Pick<LayoutVersion, "fixtures">,
): LayoutCapacitySummary {
  let faceCount = 0;
  let shelfCount = 0;
  let fixtureFloorAreaM2 = 0;
  let shelfDisplayAreaM2 = 0;
  let effectiveCommercialWidthM = 0;

  for (const fixture of layout.fixtures) {
    fixtureFloorAreaM2 += calculateFixtureFloorAreaM2(fixture);

    for (const face of fixture.faces) {
      faceCount += 1;

      for (const shelf of face.shelves) {
        shelfCount += 1;
        shelfDisplayAreaM2 += calculateShelfDisplayAreaM2(shelf);
        effectiveCommercialWidthM += calculateEffectiveCommercialWidthM({
          shelfWidthM: shelf.widthM,
          shelfWeight: shelf.commercialWeight,
          trafficWeight: face.trafficWeight,
          visibilityWeight: face.visibilityWeight,
        });
      }
    }
  }

  return {
    fixtureCount: layout.fixtures.length,
    faceCount,
    shelfCount,
    fixtureFloorAreaM2: roundMetric(fixtureFloorAreaM2),
    shelfDisplayAreaM2: roundMetric(shelfDisplayAreaM2),
    effectiveCommercialWidthM: roundMetric(effectiveCommercialWidthM),
  };
}

