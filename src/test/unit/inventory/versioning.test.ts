import { describe, expect, it } from "vitest";

import { planStockSnapshotVersions } from "@/domain/inventory/versioning";

const observation = {
  productId: "66d000000000000000000101",
  familyCode: "3400" as const,
  stockUnit: "kg" as const,
  reserveCaseCount: 2,
  packSize: 18.5,
  shelfQuantity: 3,
  onHandQuantity: 40,
  anomalies: [],
};

describe("stock snapshot versioning", () => {
  it("does not version an unchanged manual observation", () => {
    expect(
      planStockSnapshotVersions({
        observations: [observation],
        activeSnapshots: [
          {
            ...observation,
            id: "66d000000000000000000201",
            version: 2,
          },
        ],
      }),
    ).toEqual({ changed: [], unchangedCount: 1 });
  });

  it("versions a changed packaging without rewriting history", () => {
    expect(
      planStockSnapshotVersions({
        observations: [{ ...observation, packSize: 20, onHandQuantity: 43 }],
        activeSnapshots: [
          {
            ...observation,
            id: "66d000000000000000000201",
            version: 2,
          },
        ],
      }).changed[0],
    ).toMatchObject({
      version: 3,
      supersedesSnapshotId: "66d000000000000000000201",
      observation: { packSize: 20, onHandQuantity: 43 },
    });
  });
});
