import { describe, expect, it } from "vitest";

import { groupDailyImportFacts } from "@/domain/imports/daily-import-commit";
import { normalizedDailyMercalysRowSchema } from "@/domain/imports/daily-schemas";

describe("daily import commit preparation", () => {
  it("groups duplicate product-date rows and preserves negative corrections", () => {
    const common = {
      sourceLabel: "Banane",
      externalKey: "itm8:1",
      aliasKeys: ["itm8:1", "ean:2", "banane"],
      sourceItm8: "1",
      sourceEan: "2",
      businessDate: "2026-09-04",
      periodKey: "2026-09",
      isoWeekKey: "2026-W36",
      purchaseCents: 100,
      rceCents: 0,
      vatCents: 10,
      sourceMarginRatio: null,
      excluded: false,
      exclusionReason: null,
    };
    const rows = [
      normalizedDailyMercalysRowSchema.parse({
        ...common,
        rowNumber: 9,
        quantity: 3,
        revenueCents: 500,
        marginCents: 150,
      }),
      normalizedDailyMercalysRowSchema.parse({
        ...common,
        rowNumber: 10,
        quantity: -1,
        revenueCents: -100,
        marginCents: -40,
      }),
    ];

    expect(
      groupDailyImportFacts(
        rows,
        new Map([["itm8:1", "66d000000000000000000010"]]),
      ),
    ).toEqual([
      {
        productId: "66d000000000000000000010",
        businessDate: "2026-09-04",
        periodKey: "2026-09",
        isoWeekKey: "2026-W36",
        quantity: 2,
        revenueCents: 400,
        marginCents: 110,
        purchaseCents: 200,
        rceCents: 0,
        vatCents: 20,
      },
    ]);
  });
});
