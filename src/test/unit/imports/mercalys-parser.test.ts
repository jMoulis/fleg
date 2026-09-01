import { describe, expect, it } from "vitest";

import { parseMercalysFile, parseMercalysRows } from "@/domain/imports/mercalys-parser";

const headers = [
  "Libellé",
  "Année/Mois",
  "Quantité",
  "Valeur prix vente",
  "Val Marge",
  "% Marge",
];

describe("Mercalys parser", () => {
  it("maps French columns, cents and decimal ratios", () => {
    const preview = parseMercalysRows([
      headers,
      ["Banane vrac", "Août 2026", "10,5", "1 234,56 €", "321,00", "26%"],
    ]);

    expect(preview.rows[0]).toMatchObject({
      sourceLabel: "Banane vrac",
      periodKey: "2026-08",
      quantity: 10.5,
      revenueCents: 123456,
      marginCents: 32100,
      sourceMarginRatio: 0.26,
    });
  });

  it("excludes a numeric aggregate row when it reconciles detail totals", () => {
    const preview = parseMercalysRows([
      headers,
      ["Banane", "2026-08", 10, 100, 30, 0.3],
      ["Pomme", "2026-08", 20, 200, 50, 0.25],
      ["6", "2026-08", 30, 300, 80, 0.2667],
    ]);

    expect(preview.includedRowCount).toBe(2);
    expect(preview.excludedRowCount).toBe(1);
    expect(preview.totals).toEqual({
      quantity: 30,
      revenueCents: 30000,
      marginCents: 8000,
    });
    expect(preview.warnings[0]?.code).toBe("AGGREGATE_ROW_EXCLUDED");
  });

  it("infers the period and excludes an unlabeled aggregate row", () => {
    const preview = parseMercalysRows([
      headers,
      ["Banane", "2026-08", 10, 100, 30, 0.3],
      ["Pomme", "2026-08", 20, 200, 50, 0.25],
      [null, null, 30, 300, 80, 0.2667],
    ]);

    expect(preview.periodKey).toBe("2026-08");
    expect(preview.includedRowCount).toBe(2);
    expect(preview.excludedRowCount).toBe(1);
    expect(preview.rows.at(-1)).toMatchObject({
      sourceLabel: "Ligne sans libellé",
      excluded: true,
    });
  });

  it("does not exclude an ordinary numeric product code without reconciliation", () => {
    const preview = parseMercalysRows([
      headers,
      ["42", "2026-08", 3, 15, 4, 0.2667],
      ["Pomme", "2026-08", 20, 200, 50, 0.25],
    ]);

    expect(preview.includedRowCount).toBe(2);
    expect(preview.excludedRowCount).toBe(0);
  });

  it("parses semicolon-delimited CSV uploads", async () => {
    const csv = `${headers.join(";")}\nBanane;2026-08;10;100,00;30,00;30%`;
    const preview = await parseMercalysFile(
      "mercalys.csv",
      new TextEncoder().encode(csv),
    );

    expect(preview.totals.revenueCents).toBe(10000);
  });
});
