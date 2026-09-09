import {
  inventoryCountLineSchema,
  type InventoryCountLine,
  type InventoryFamilyCode,
  type StockSnapshotAnomaly,
  type StockUnit,
} from "@/domain/inventory/schemas";

export interface PreparedStockObservation {
  productId: string;
  familyCode: InventoryFamilyCode;
  stockUnit: StockUnit;
  reserveCaseCount: number;
  packSize: number;
  shelfQuantity: number;
  onHandQuantity: number;
  anomalies: StockSnapshotAnomaly[];
}

export class InventoryCountValidationError extends Error {
  readonly code = "INVENTORY_COUNT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "InventoryCountValidationError";
  }
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000;
}

export function calculateOnHandQuantity(input: {
  reserveCaseCount: number;
  packSize: number;
  shelfQuantity: number;
}): number {
  return roundQuantity(
    input.reserveCaseCount * input.packSize + input.shelfQuantity,
  );
}

export function hasCountInput(line: InventoryCountLine): boolean {
  return line.reserveCaseCount !== null || line.shelfQuantity !== null;
}

export function isProfileConfigured(
  line: InventoryCountLine,
): line is InventoryCountLine & {
  familyCode: InventoryFamilyCode;
  stockUnit: StockUnit;
  packSize: number;
} {
  return (
    line.familyCode !== null &&
    line.stockUnit !== null &&
    line.packSize !== null
  );
}

export function prepareStockObservations(
  lines: InventoryCountLine[],
): PreparedStockObservation[] {
  const observations: PreparedStockObservation[] = [];

  for (const rawLine of lines) {
    const line = inventoryCountLineSchema.parse(rawLine);
    if (!hasCountInput(line)) continue;

    if (
      line.familyCode === null ||
      line.stockUnit === null ||
      line.packSize === null
    ) {
      throw new InventoryCountValidationError(
        "Chaque article compté doit avoir une famille, une unité et un colisage",
      );
    }
    if (line.reserveCaseCount === null || line.shelfQuantity === null) {
      throw new InventoryCountValidationError(
        "Renseignez le nombre de colis et le reste en rayon, y compris avec 0",
      );
    }

    const onHandQuantity = calculateOnHandQuantity({
      reserveCaseCount: line.reserveCaseCount,
      packSize: line.packSize,
      shelfQuantity: line.shelfQuantity,
    });
    observations.push({
      productId: line.productId,
      familyCode: line.familyCode,
      stockUnit: line.stockUnit,
      reserveCaseCount: line.reserveCaseCount,
      packSize: line.packSize,
      shelfQuantity: line.shelfQuantity,
      onHandQuantity,
      anomalies: onHandQuantity < 0 ? ["negative_on_hand"] : [],
    });
  }

  if (observations.length === 0) {
    throw new InventoryCountValidationError(
      "Renseignez au moins un article avant de valider le comptage",
    );
  }
  return observations;
}

export function calculateObservationAgeHours(
  observedAt: string,
  now: Date,
): number {
  const ageMilliseconds = Math.max(0, now.getTime() - Date.parse(observedAt));
  return Math.round((ageMilliseconds / 3_600_000) * 10) / 10;
}
