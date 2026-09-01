import { describe, expect, it } from "vitest";

import {
  AliasResolutionError,
  groupImportFacts,
  validateAliasResolutions,
} from "@/domain/imports/import-commit";
import { normalizedMercalysRowSchema } from "@/domain/imports/schemas";

describe("import commit preparation", () => {
  it("requires exactly one resolution per unresolved alias", () => {
    expect(() =>
      validateAliasResolutions(["banane", "pomme"], [
        { externalKey: "banane", action: "create", canonicalLabel: "Banane" },
      ]),
    ).toThrow(AliasResolutionError);
  });

  it("groups duplicate source rows without reintroducing aggregate rows", () => {
    const base = {
      periodKey: "2026-08",
      sourceMarginRatio: null,
      exclusionReason: null,
    };
    const rows = [
      normalizedMercalysRowSchema.parse({
        ...base,
        rowNumber: 2,
        sourceLabel: "Banane",
        externalKey: "banane",
        quantity: 4,
        revenueCents: 1200,
        marginCents: 300,
        excluded: false,
      }),
      normalizedMercalysRowSchema.parse({
        ...base,
        rowNumber: 3,
        sourceLabel: "Banane",
        externalKey: "banane",
        quantity: 6,
        revenueCents: 1800,
        marginCents: 450,
        excluded: false,
      }),
      normalizedMercalysRowSchema.parse({
        ...base,
        rowNumber: 4,
        sourceLabel: "Total",
        externalKey: "total",
        quantity: 10,
        revenueCents: 3000,
        marginCents: 750,
        excluded: true,
        exclusionReason: "Total détecté",
      }),
    ];

    expect(
      groupImportFacts(
        rows,
        new Map([
          ["banane", "66d000000000000000000010"],
          ["total", null],
        ]),
      ),
    ).toEqual([
      {
        productId: "66d000000000000000000010",
        periodKey: "2026-08",
        quantity: 10,
        revenueCents: 3000,
        marginCents: 750,
      },
    ]);
  });

  it("omits explicitly ignored products", () => {
    const row = normalizedMercalysRowSchema.parse({
      rowNumber: 2,
      sourceLabel: "Divers",
      externalKey: "divers",
      periodKey: "2026-08",
      quantity: 1,
      revenueCents: 100,
      marginCents: 20,
      sourceMarginRatio: 0.2,
      excluded: false,
      exclusionReason: null,
    });

    expect(groupImportFacts([row], new Map([["divers", null]]))).toEqual([]);
  });
});
