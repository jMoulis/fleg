import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMercalysFile } from "@/domain/imports/mercalys-parser";

const fixtures = [
  { fileName: "10_2025.xlsx", periodKey: "2025-10" },
  { fileName: "11_2025.xlsx", periodKey: "2025-11" },
  { fileName: "12_2025.xlsx", periodKey: "2025-12" },
] as const;

describe("supplied Mercalys workbooks", () => {
  for (const fixture of fixtures) {
    it(`reconciles ${fixture.fileName} without aggregate double-counting`, async () => {
      const bytes = await readFile(
        join(
          process.cwd(),
          "assets",
          "import_excel_files_examples",
          fixture.fileName,
        ),
      );
      const preview = await parseMercalysFile(fixture.fileName, bytes);
      const includedRows = preview.rows.filter((row) => !row.excluded);
      const reconciled = includedRows.reduce(
        (totals, row) => ({
          quantity: totals.quantity + row.quantity,
          revenueCents: totals.revenueCents + row.revenueCents,
          marginCents: totals.marginCents + row.marginCents,
        }),
        { quantity: 0, revenueCents: 0, marginCents: 0 },
      );

      expect(preview.periodKey).toBe(fixture.periodKey);
      expect(preview.includedRowCount).toBeGreaterThan(0);
      expect(preview.excludedRowCount).toBeGreaterThan(0);
      expect(preview.totals).toEqual(reconciled);
    });
  }
});
