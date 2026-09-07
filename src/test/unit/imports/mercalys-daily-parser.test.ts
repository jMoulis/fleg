import { describe, expect, it } from "vitest";

import { parseDailyMercalysRows } from "@/domain/imports/mercalys-daily-parser";

const dailyHeaders = [
  "ITM8 Prio",
  "EAN Prio",
  "Libellé",
  "Quantité",
  "Valeur prix achat",
  "Valeur RCE",
  "Valeur prix vente",
  "Valeur TVA",
  "Val Marge",
  "% Marge",
];

describe("daily Mercalys parser", () => {
  it("extracts metadata, keeps stable identifiers and excludes the reconciled total", () => {
    const preview = parseDailyMercalysRows([
      ["PDV: 09083 - INTERMARCHE ASNIERES Date : 07/09/2026"],
      ["Statistique : Entrées / Sorties"],
      [],
      ["Sélection de données : Du 04/09/2026 Au 04/09/2026"],
      [],
      [],
      [],
      dailyHeaders,
      ["0000087003017", "0000000003017", "Poire conférence", 2.75, 6.24, 0, 11.54, 0.6, 4.7, 40.69],
      ["0000087003024", "2800146000000", "Poire Rocha", 1.67, 4, 0, 6.17, 0.32, 1.85, 30.02],
      ["", "", "", 4.42, 10.24, 0, 17.71, 0.92, 6.55, 36.98],
      [],
      ["Nombre de Lignes : 2"],
    ]);

    expect(preview).toMatchObject({
      source: "mercalys_daily",
      sourceStoreCode: "09083",
      startDate: "2026-09-04",
      endDate: "2026-09-04",
      observedDates: ["2026-09-04"],
      periodKeys: ["2026-09"],
      includedRowCount: 2,
      excludedRowCount: 1,
      coverage: {
        status: "complete",
        missingDates: [],
      },
      totals: {
        quantity: 4.42,
        revenueCents: 1771,
        marginCents: 655,
      },
    });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 9,
      externalKey: "itm8:0000087003017",
      aliasKeys: [
        "itm8:0000087003017",
        "ean:0000000003017",
        "poire conference",
      ],
      purchaseCents: 624,
      vatCents: 60,
      businessDate: "2026-09-04",
      isoWeekKey: "2026-W36",
    });
    expect(preview.rows[2]).toMatchObject({
      excluded: true,
      exclusionReason: "La ligne réconcilie les agrégats des articles de la journée",
    });
  });

  it("rejects a non-detailed multi-day export without a date column", () => {
    expect(() =>
      parseDailyMercalysRows([
        ["PDV: 09083 - Magasin"],
        ["Sélection de données : Du 04/09/2026 Au 05/09/2026"],
        dailyHeaders,
        ["1", "2", "Banane", 1, 1, 0, 2, 0.1, 0.9, 45],
      ]),
    ).toThrow("colonne de date par ligne");
  });

  it("reports missing observed dates instead of filling them with zero", () => {
    const headersWithDate = [...dailyHeaders.slice(0, 3), "Date", ...dailyHeaders.slice(3)];
    const preview = parseDailyMercalysRows([
      ["PDV: 09083 - Magasin"],
      ["Sélection de données : Du 04/09/2026 Au 06/09/2026"],
      headersWithDate,
      ["1", "10", "Banane", "04/09/2026", 1, 1, 0, 2, 0.1, 0.9, 45],
      ["1", "10", "Banane", "06/09/2026", 2, 2, 0, 4, 0.2, 1.8, 45],
    ]);

    expect(preview.coverage).toMatchObject({
      status: "partial",
      observedDates: ["2026-09-04", "2026-09-06"],
      missingDates: ["2026-09-05"],
    });
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: "PARTIAL_COVERAGE" }),
    );
  });

  it("accepts a compatible CSV-style table whose date is present on every row", () => {
    const preview = parseDailyMercalysRows([
      ["ITM8", "EAN", "Libellé", "Date", "Quantité", "Valeur prix vente", "Val Marge"],
      ["1", "10", "Banane", "04/09/2026", 1, 2, 0.9],
    ]);

    expect(preview).toMatchObject({
      sourceStoreCode: null,
      startDate: "2026-09-04",
      endDate: "2026-09-04",
      coverage: { status: "complete" },
    });
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: "SOURCE_STORE_CODE_MISSING" }),
    );
  });
});
