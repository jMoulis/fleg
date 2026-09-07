import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

import {
  enumerateBusinessDates,
  isoWeekKeyFromBusinessDate,
  parseBusinessDate,
  periodKeyFromBusinessDate,
} from "@/domain/imports/daily-dates";
import {
  dailyMercalysPreviewSchema,
  normalizedDailyMercalysRowSchema,
  type DailyImportWarning,
  type DailyMercalysColumn,
  type DailyMercalysPreview,
  type NormalizedDailyMercalysRow,
} from "@/domain/imports/daily-schemas";
import {
  normalizeExternalKey,
  normalizeHeader,
  normalizeText,
  parseFrenchNumber,
  parseMoneyCents,
  parseRatio,
} from "@/domain/imports/normalization";
import { buildMercalysProductIdentity } from "@/domain/imports/product-identity";
import { unlabeledMercalysRowLabel } from "@/domain/imports/schemas";

type RawRow = unknown[];

const headerAliases: Record<DailyMercalysColumn, ReadonlySet<string>> = {
  itm8: new Set(["itm8", "itm8prio", "codeitm8"]),
  ean: new Set(["ean", "eanprio", "codeean", "codebarres"]),
  label: new Set(["libelle", "produit", "libelleproduit"]),
  businessDate: new Set(["date", "jour", "datevente", "datejournee"]),
  quantity: new Set(["quantite", "qte", "quantitevendue"]),
  purchase: new Set(["valeurprixachat", "prixachat", "valachat"]),
  rce: new Set(["valeurrce", "rce"]),
  revenue: new Set(["valeurprixvente", "cavente", "chiffredaffaires", "ca"]),
  vat: new Set(["valeurtva", "tva"]),
  margin: new Set(["valmarge", "valeurmarge", "margeeur", "marge€"]),
  marginRatio: new Set(["%marge", "pourcentagemarge", "tauxmarge"]),
};

interface HeaderMapping {
  headerRowIndex: number;
  indexes: Record<DailyMercalysColumn, number | undefined>;
  labels: Record<DailyMercalysColumn, string>;
}

interface SourceMetadata {
  sourceStoreCode: string | null;
  startDate: string | null;
  endDate: string | null;
}

function emptyColumnRecord<T>(value: T): Record<DailyMercalysColumn, T> {
  return {
    itm8: value,
    ean: value,
    label: value,
    businessDate: value,
    quantity: value,
    purchase: value,
    rce: value,
    revenue: value,
    vat: value,
    margin: value,
    marginRatio: value,
  };
}

function findHeaderMapping(rows: RawRow[]): HeaderMapping {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const indexes = emptyColumnRecord<number | undefined>(undefined);
    const labels = emptyColumnRecord("");

    rows[rowIndex]?.forEach((rawCell, columnIndex) => {
      const header = normalizeHeader(rawCell);
      for (const column of Object.keys(headerAliases) as DailyMercalysColumn[]) {
        if (indexes[column] === undefined && headerAliases[column].has(header)) {
          indexes[column] = columnIndex;
          labels[column] = normalizeText(String(rawCell ?? ""));
        }
      }
    });

    const hasIdentityColumn =
      indexes.label !== undefined ||
      indexes.itm8 !== undefined ||
      indexes.ean !== undefined;
    const hasRequiredMetrics = ["quantity", "revenue", "margin"].every(
      (column) => indexes[column as DailyMercalysColumn] !== undefined,
    );

    if (hasIdentityColumn && hasRequiredMetrics) {
      return { headerRowIndex: rowIndex, indexes, labels };
    }
  }

  throw new Error("Colonnes journalières Mercalys requises introuvables");
}

function findSourceMetadata(rows: RawRow[], headerRowIndex: number): SourceMetadata {
  let sourceStoreCode: string | null = null;
  let dateRange: { startDate: string; endDate: string } | null = null;

  for (const row of rows.slice(0, headerRowIndex)) {
    for (const rawCell of row) {
      if (rawCell === null || rawCell === undefined || rawCell === "") {
        continue;
      }

      const text = normalizeText(String(rawCell));
      const storeMatch = text.match(/\bPDV\s*:\s*([^\s-]+)/i);
      if (!sourceStoreCode && storeMatch) {
        sourceStoreCode = storeMatch[1] ?? null;
      }

      const dateMatch = text.match(
        /\bDu\s+(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})\s+Au\s+(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i,
      );
      if (!dateRange && dateMatch) {
        dateRange = {
          startDate: parseBusinessDate(dateMatch[1]),
          endDate: parseBusinessDate(dateMatch[2]),
        };
      }
    }
  }

  if (dateRange) {
    enumerateBusinessDates(dateRange.startDate, dateRange.endDate);
  }
  return {
    sourceStoreCode,
    startDate: dateRange?.startDate ?? null,
    endDate: dateRange?.endDate ?? null,
  };
}

function cell(row: RawRow, index: number | undefined): unknown {
  return index === undefined ? null : row[index];
}

function parseOptionalMoney(value: unknown): number | null {
  return value === null || value === undefined || value === ""
    ? null
    : parseMoneyCents(value);
}

function normalizeDailyRow(input: {
  row: RawRow;
  rowNumber: number;
  mapping: HeaderMapping;
  fallbackBusinessDate: string | null;
}): NormalizedDailyMercalysRow | null {
  const { row, rowNumber, mapping, fallbackBusinessDate } = input;
  const rawLabel = cell(row, mapping.indexes.label);
  const rawItm8 = cell(row, mapping.indexes.itm8);
  const rawEan = cell(row, mapping.indexes.ean);
  const hasIdentity = [rawLabel, rawItm8, rawEan].some(
    (value) => value !== null && value !== undefined && String(value).trim() !== "",
  );
  const hasBusinessValues = [
    mapping.indexes.quantity,
    mapping.indexes.revenue,
    mapping.indexes.margin,
  ].some((index) => {
    const value = cell(row, index);
    return value !== null && value !== undefined && value !== "";
  });

  if (!hasIdentity && !hasBusinessValues) {
    return null;
  }

  if (!hasBusinessValues) {
    return null;
  }

  const sourceLabel =
    rawLabel !== null && rawLabel !== undefined && String(rawLabel).trim() !== ""
      ? normalizeText(String(rawLabel))
      : rawItm8 !== null && rawItm8 !== undefined && String(rawItm8).trim() !== ""
        ? `Article ${normalizeText(String(rawItm8))}`
        : rawEan !== null && rawEan !== undefined && String(rawEan).trim() !== ""
          ? `Article ${normalizeText(String(rawEan))}`
          : unlabeledMercalysRowLabel;
  const identity = buildMercalysProductIdentity({
    sourceLabel,
    rawItm8,
    rawEan,
  });
  const rawBusinessDate = cell(row, mapping.indexes.businessDate);
  const businessDate =
    rawBusinessDate === null || rawBusinessDate === undefined || rawBusinessDate === ""
      ? fallbackBusinessDate
      : parseBusinessDate(rawBusinessDate);

  if (!businessDate) {
    throw new Error(`Date métier manquante à la ligne ${rowNumber}`);
  }

  return normalizedDailyMercalysRowSchema.parse({
    rowNumber,
    sourceLabel,
    ...identity,
    businessDate,
    periodKey: periodKeyFromBusinessDate(businessDate),
    isoWeekKey: isoWeekKeyFromBusinessDate(businessDate),
    quantity: parseFrenchNumber(cell(row, mapping.indexes.quantity)),
    revenueCents: parseMoneyCents(cell(row, mapping.indexes.revenue)),
    marginCents: parseMoneyCents(cell(row, mapping.indexes.margin)),
    purchaseCents: parseOptionalMoney(cell(row, mapping.indexes.purchase)),
    rceCents: parseOptionalMoney(cell(row, mapping.indexes.rce)),
    vatCents: parseOptionalMoney(cell(row, mapping.indexes.vat)),
    sourceMarginRatio: parseRatio(cell(row, mapping.indexes.marginRatio)),
    excluded: false,
    exclusionReason: null,
  });
}

function approximatelyEqual(actual: number, expected: number, tolerance: number) {
  return Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * 0.0001);
}

function detectDailyAggregateRows(
  rows: NormalizedDailyMercalysRow[],
): NormalizedDailyMercalysRow[] {
  return rows.map((candidate, candidateIndex) => {
    const normalizedLabel = normalizeExternalKey(candidate.sourceLabel);
    const explicitAggregate =
      normalizedLabel === "total" ||
      normalizedLabel === "total general" ||
      normalizedLabel.startsWith("total ");
    const lacksProductIdentity =
      candidate.sourceItm8 === null && candidate.sourceEan === null;

    if (!explicitAggregate && !lacksProductIdentity) {
      return candidate;
    }

    const otherRows = rows.filter(
      (row, index) =>
        index !== candidateIndex &&
        row.businessDate === candidate.businessDate &&
        (row.sourceItm8 !== null || row.sourceEan !== null),
    );
    const totals = otherRows.reduce(
      (result, row) => ({
        quantity: result.quantity + row.quantity,
        revenueCents: result.revenueCents + row.revenueCents,
        marginCents: result.marginCents + row.marginCents,
      }),
      { quantity: 0, revenueCents: 0, marginCents: 0 },
    );
    const matchingMetrics = [
      approximatelyEqual(candidate.quantity, totals.quantity, 0.001),
      approximatelyEqual(candidate.revenueCents, totals.revenueCents, 1),
      approximatelyEqual(candidate.marginCents, totals.marginCents, 1),
    ].filter(Boolean).length;

    if (!explicitAggregate && matchingMetrics < 2) {
      return candidate;
    }

    return {
      ...candidate,
      excluded: true,
      exclusionReason: explicitAggregate
        ? "Libellé de total détecté"
        : "La ligne réconcilie les agrégats des articles de la journée",
    };
  });
}

function sumRows(rows: NormalizedDailyMercalysRow[]) {
  return rows.reduce(
    (result, row) => ({
      quantity: result.quantity + row.quantity,
      revenueCents: result.revenueCents + row.revenueCents,
      marginCents: result.marginCents + row.marginCents,
    }),
    { quantity: 0, revenueCents: 0, marginCents: 0 },
  );
}

export function parseDailyMercalysRows(rows: RawRow[]): DailyMercalysPreview {
  const mapping = findHeaderMapping(rows);
  const metadata = findSourceMetadata(rows, mapping.headerRowIndex);
  const fallbackBusinessDate =
    mapping.indexes.businessDate === undefined &&
    metadata.startDate !== null &&
    metadata.startDate === metadata.endDate
      ? metadata.startDate
      : null;

  if (mapping.indexes.businessDate === undefined && fallbackBusinessDate === null) {
    throw new Error(
      "Un export couvrant plusieurs jours doit contenir une colonne de date par ligne",
    );
  }

  const normalizedRows = rows
    .slice(mapping.headerRowIndex + 1)
    .map((row, index) =>
      normalizeDailyRow({
        row,
        rowNumber: mapping.headerRowIndex + index + 2,
        mapping,
        fallbackBusinessDate,
      }),
    )
    .filter((row): row is NormalizedDailyMercalysRow => row !== null);

  if (normalizedRows.length === 0) {
    throw new Error("Aucune ligne article journalière Mercalys détectée");
  }

  const detectedRows = detectDailyAggregateRows(normalizedRows);
  const includedRows = detectedRows.filter((row) => !row.excluded);
  if (includedRows.length === 0) {
    throw new Error("Aucune ligne article journalière Mercalys incluse");
  }

  const observedDates = [...new Set(includedRows.map((row) => row.businessDate))].sort();
  const startDate = metadata.startDate ?? observedDates[0]!;
  const endDate = metadata.endDate ?? observedDates.at(-1)!;
  const expectedDates = enumerateBusinessDates(startDate, endDate);
  if (
    observedDates.some(
      (businessDate) => businessDate < startDate || businessDate > endDate,
    )
  ) {
    throw new Error("Une date de ligne est hors de la période Mercalys annoncée");
  }
  const observedDateSet = new Set(observedDates);
  const missingDates = expectedDates.filter((date) => !observedDateSet.has(date));
  const reasons = missingDates.map((date) => `Aucune observation source pour le ${date}`);
  const coverageStatus = missingDates.length === 0 ? "complete" : "partial";
  const warnings: DailyImportWarning[] = detectedRows
    .filter((row) => row.excluded)
    .map((row) => ({
      code: "AGGREGATE_ROW_EXCLUDED" as const,
      message: `${row.sourceLabel} exclu : ${row.exclusionReason ?? "agrégat détecté"}`,
      rowNumber: row.rowNumber,
    }));

  for (const row of includedRows) {
    if (row.sourceMarginRatio === null || row.revenueCents === 0) {
      continue;
    }
    const calculatedRatio = row.marginCents / row.revenueCents;
    if (Math.abs(calculatedRatio - row.sourceMarginRatio) > 0.005) {
      warnings.push({
        code: "MARGIN_RATIO_MISMATCH",
        message: `Le taux de marge source ne correspond pas aux montants à la ligne ${row.rowNumber}`,
        rowNumber: row.rowNumber,
      });
    }
  }

  if (missingDates.length > 0) {
    warnings.push({
      code: "PARTIAL_COVERAGE",
      message: `${missingDates.length} journée(s) de la plage ne contiennent aucune observation`,
    });
  }
  if (!metadata.sourceStoreCode) {
    warnings.push({
      code: "SOURCE_STORE_CODE_MISSING",
      message: "Le code PDV Mercalys n’a pas été trouvé dans les métadonnées",
    });
  }

  const dailyTotals = observedDates.map((businessDate) => ({
    businessDate,
    ...sumRows(includedRows.filter((row) => row.businessDate === businessDate)),
  }));
  const periodKeys = [
    ...new Set(includedRows.map((row) => row.periodKey)),
  ].sort();

  return dailyMercalysPreviewSchema.parse({
    source: "mercalys_daily",
    datasetKind: "daily_sales",
    sourceStoreCode: metadata.sourceStoreCode,
    startDate,
    endDate,
    periodKeys,
    observedDates,
    coverage: {
      status: coverageStatus,
      expectedDates,
      observedDates,
      missingDates,
      reasons,
    },
    coverageKey: `${startDate}:${endDate}:${observedDates.join(",")}`,
    mappedColumns: Object.fromEntries(
      (Object.keys(mapping.labels) as DailyMercalysColumn[])
        .filter((column) => mapping.labels[column] !== "")
        .map((column) => [column, mapping.labels[column]]),
    ),
    rows: detectedRows,
    includedRowCount: includedRows.length,
    excludedRowCount: detectedRows.length - includedRows.length,
    totals: sumRows(includedRows),
    dailyTotals,
    warnings,
  });
}

export async function parseDailyMercalysFile(
  fileName: string,
  bytes: Uint8Array,
): Promise<DailyMercalysPreview> {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase("fr-FR");

  if (extension === "csv") {
    const rows = parse(Buffer.from(bytes), {
      bom: true,
      delimiter: [";", ",", "\t"],
      relax_column_count: true,
      skip_empty_lines: false,
      trim: true,
    }) as unknown[][];
    return parseDailyMercalysRows(rows);
  }

  if (extension === "xlsx") {
    const sheetRows = await readSheet(Buffer.from(bytes), 1);
    return parseDailyMercalysRows(sheetRows);
  }

  throw new Error("Format non pris en charge. Utilisez un fichier XLSX ou CSV.");
}
