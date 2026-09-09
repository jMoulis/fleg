import type { PreparedStockObservation } from "@/domain/inventory/calculations";

export interface ActiveStockSnapshotValue extends PreparedStockObservation {
  id: string;
  version: number;
}

export interface PlannedStockSnapshotVersion {
  observation: PreparedStockObservation;
  version: number;
  supersedesSnapshotId: string | null;
}

function hasSameObservedValues(
  current: ActiveStockSnapshotValue,
  next: PreparedStockObservation,
): boolean {
  return (
    current.familyCode === next.familyCode &&
    current.stockUnit === next.stockUnit &&
    current.reserveCaseCount === next.reserveCaseCount &&
    current.packSize === next.packSize &&
    current.shelfQuantity === next.shelfQuantity &&
    current.onHandQuantity === next.onHandQuantity
  );
}

export function planStockSnapshotVersions(input: {
  observations: PreparedStockObservation[];
  activeSnapshots: ActiveStockSnapshotValue[];
}): {
  changed: PlannedStockSnapshotVersion[];
  unchangedCount: number;
} {
  const activeByProductId = new Map(
    input.activeSnapshots.map((snapshot) => [snapshot.productId, snapshot]),
  );
  const changed: PlannedStockSnapshotVersion[] = [];
  let unchangedCount = 0;

  for (const observation of input.observations) {
    const current = activeByProductId.get(observation.productId);
    if (current && hasSameObservedValues(current, observation)) {
      unchangedCount += 1;
      continue;
    }
    changed.push({
      observation,
      version: (current?.version ?? 0) + 1,
      supersedesSnapshotId: current?.id ?? null,
    });
  }

  return { changed, unchangedCount };
}
