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
      sort: "label_asc",
    });
  });
});
