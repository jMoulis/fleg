import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

import { detectAggregateRows } from "@/domain/imports/aggregate-detector";
import {
  normalizeExternalKey,
  normalizeHeader,
  normalizeText,
  parseFrenchNumber,
  parseMoneyCents,
  parsePeriodKey,
  parseRatio,
} from "@/domain/imports/normalization";
import {
  mercalysPreviewSchema,
  normalizedMercalysRowSchema,
  unlabeledMercalysRowLabel,
  type ImportWarning,
  type MercalysColumn,
  type MercalysPreview,
  type NormalizedMercalysRow,
} from "@/domain/imports/schemas";

type RawRow = unknown[];

const headerAliases: Record<MercalysColumn, ReadonlySet<string>> = {
  label: new Set(["libelle", "produit", "libelleproduit"]),
  period: new Set(["anneemois", "periode", "mois"]),
  quantity: new Set(["quantite", "qte", "quantitevendue"]),
  revenue: new Set(["valeurprixvente", "cavente", "chiffredaffaires", "ca"]),
  margin: new Set(["valmarge", "valeurmarge", "margeeur", "marge€"]),
  marginRatio: new Set(["%marge", "pourcentagemarge", "tauxmarge"]),
};

const requiredColumns: MercalysColumn[] = [
  "label",
  "period",
  "quantity",
  "revenue",
  "margin",
];

interface HeaderMapping {
  headerRowIndex: number;
  indexes: Record<MercalysColumn, number | undefined>;
  labels: Record<MercalysColumn, string>;
}

function findHeaderMapping(rows: RawRow[]): HeaderMapping {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const indexes: Record<MercalysColumn, number | undefined> = {
      label: undefined,
      period: undefined,
      quantity: undefined,
      revenue: undefined,
      margin: undefined,
      marginRatio: undefined,
    };
    const labels: Record<MercalysColumn, string> = {
      label: "",
      period: "",
      quantity: "",
      revenue: "",
      margin: "",
      marginRatio: "",
    };

    rows[rowIndex]?.forEach((cell, columnIndex) => {
      const header = normalizeHeader(cell);

      for (const column of Object.keys(headerAliases) as MercalysColumn[]) {
        if (indexes[column] === undefined && headerAliases[column].has(header)) {
          indexes[column] = columnIndex;
          labels[column] = normalizeText(String(cell ?? ""));
        }
      }
    });

    if (requiredColumns.every((column) => indexes[column] !== undefined)) {
      return { headerRowIndex: rowIndex, indexes, labels };
    }
  }

  throw new Error("Colonnes Mercalys requises introuvables");
}

function cell(row: RawRow, index: number | undefined): unknown {
  return index === undefined ? null : row[index];
}

function normalizeRow(
  row: RawRow,
  rowNumber: number,
  mapping: HeaderMapping,
  fallbackPeriodKey: string,
): NormalizedMercalysRow | null {
  const rawLabel = cell(row, mapping.indexes.label);
  const hasLabel =
    rawLabel !== null &&
    rawLabel !== undefined &&
    String(rawLabel).trim() !== "";
  const hasBusinessValues = [
    mapping.indexes.quantity,
    mapping.indexes.revenue,
    mapping.indexes.margin,
  ].some((index) => {
    const value = cell(row, index);
    return value !== null && value !== undefined && value !== "";
  });

  if (!hasLabel && !hasBusinessValues) {
    return null;
  }

  const sourceLabel = hasLabel
    ? normalizeText(String(rawLabel))
    : unlabeledMercalysRowLabel;
  const sourceMarginRatio = parseRatio(cell(row, mapping.indexes.marginRatio));
  const rawPeriod = cell(row, mapping.indexes.period);

  return normalizedMercalysRowSchema.parse({
    rowNumber,
    sourceLabel,
    externalKey: normalizeExternalKey(sourceLabel),
    periodKey:
      rawPeriod === null || rawPeriod === undefined || rawPeriod === ""
        ? fallbackPeriodKey
        : parsePeriodKey(rawPeriod),
    quantity: parseFrenchNumber(cell(row, mapping.indexes.quantity)),
    revenueCents: parseMoneyCents(cell(row, mapping.indexes.revenue)),
    marginCents: parseMoneyCents(cell(row, mapping.indexes.margin)),
    sourceMarginRatio,
    excluded: false,
    exclusionReason: null,
  });
}

export function parseMercalysRows(rows: RawRow[]): MercalysPreview {
  const mapping = findHeaderMapping(rows);
  const dataRows = rows.slice(mapping.headerRowIndex + 1);
  const fallbackPeriodKey = dataRows.reduce<string | null>((period, row) => {
    if (period !== null) {
      return period;
    }

    const value = cell(row, mapping.indexes.period);
    return value === null || value === undefined || value === ""
      ? null
      : parsePeriodKey(value);
  }, null);

  if (fallbackPeriodKey === null) {
    throw new Error("Aucune période Mercalys détectée");
  }

  const normalizedRows = dataRows
    .map((row, index) =>
      normalizeRow(
        row,
        mapping.headerRowIndex + index + 2,
        mapping,
        fallbackPeriodKey,
      ),
    )
    .filter((row): row is NormalizedMercalysRow => row !== null);

  if (normalizedRows.length === 0) {
    throw new Error("Aucune ligne produit Mercalys détectée");
  }

  const detectedRows = detectAggregateRows(normalizedRows);
  const periods = [...new Set(detectedRows.map((row) => row.periodKey))];
  const includedRows = detectedRows.filter((row) => !row.excluded);
  const totals = includedRows.reduce(
    (result, row) => ({
      quantity: result.quantity + row.quantity,
      revenueCents: result.revenueCents + row.revenueCents,
      marginCents: result.marginCents + row.marginCents,
    }),
    { quantity: 0, revenueCents: 0, marginCents: 0 },
  );
  const warnings: ImportWarning[] = detectedRows
    .filter((row) => row.excluded)
    .map((row) => ({
      code: "AGGREGATE_ROW_EXCLUDED" as const,
      message: `${row.sourceLabel} exclu : ${row.exclusionReason ?? "agrégat détecté"}`,
      rowNumber: row.rowNumber,
    }));

  if (periods.length > 1) {
    warnings.push({
      code: "MULTIPLE_PERIODS" as const,
      message: `Plusieurs périodes détectées : ${periods.join(", ")}`,
      rowNumber: undefined,
    });
  }

  return mercalysPreviewSchema.parse({
    source: "mercalys",
    periodKey: periods[0],
    mappedColumns: Object.fromEntries(
      (Object.keys(mapping.labels) as MercalysColumn[])
        .filter((column) => mapping.labels[column] !== "")
        .map((column) => [column, mapping.labels[column]]),
    ),
    rows: detectedRows,
    includedRowCount: includedRows.length,
    excludedRowCount: detectedRows.length - includedRows.length,
    totals,
    warnings,
  });
}

export async function parseMercalysFile(
  fileName: string,
  bytes: Uint8Array,
): Promise<MercalysPreview> {
  const extension = fileName.split(".").pop()?.toLocaleLowerCase("fr-FR");

  if (extension === "csv") {
    const rows = parse(Buffer.from(bytes), {
      bom: true,
      delimiter: [";", ",", "\t"],
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as unknown[][];
    return parseMercalysRows(rows);
  }

  if (extension === "xlsx") {
    const sheetRows = await readSheet(Buffer.from(bytes), 1);
    return parseMercalysRows(sheetRows);
  }

  throw new Error("Format non pris en charge. Utilisez un fichier XLSX ou CSV.");
}
