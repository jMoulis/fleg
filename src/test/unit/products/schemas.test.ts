import { describe, expect, it } from "vitest";

import { productMatrixQuerySchema } from "@/domain/products/schemas";

describe("product matrix query schema", () => {
  it("normalizes the empty ABC form option to no filter", () => {
    expect(
      productMatrixQuerySchema.parse({
        period: "2026-08",
        q: "",
        abc: "",
        sort: "label_asc",
      }),
    ).toEqual({
      period: "2026-08",
      q: "",
      abc: undefined,
      xyz: undefined,
      sort: "label_asc",
    });
  });

  it("accepts XYZ classes and the explicit unclassified state", () => {
    expect(
      productMatrixQuerySchema.parse({ xyz: "unclassified" }).xyz,
    ).toBe("unclassified");
    expect(productMatrixQuerySchema.safeParse({ xyz: "W" }).success).toBe(
      false,
    );
  });
});
