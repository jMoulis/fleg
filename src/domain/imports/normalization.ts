const monthNames: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeExternalKey(label: string): string {
  return normalizeText(label).toLocaleLowerCase("fr-FR");
}

export function normalizeHeader(value: unknown): string {
  return normalizeText(String(value ?? ""))
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9%]/g, "");
}

export function parseFrenchNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error("Valeur numérique manquante");
  }

  const normalized = value
    .trim()
    .replace(/[€%]/g, "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(",", ".");
  const number = Number(normalized);

  if (!Number.isFinite(number)) {
    throw new Error(`Valeur numérique invalide: ${value}`);
  }

  return number;
}

export function parseMoneyCents(value: unknown): number {
  const cents = Math.round(parseFrenchNumber(value) * 100);

  if (!Number.isSafeInteger(cents)) {
    throw new Error("Montant hors limites");
  }

  return cents;
}

export function parseRatio(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = parseFrenchNumber(value);
  const ratio =
    typeof value === "string" && value.includes("%")
      ? number / 100
      : Math.abs(number) > 1
        ? number / 100
        : number;

  return ratio;
}

export function parsePeriodKey(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const normalized = normalizeText(String(value ?? "")).toLocaleLowerCase("fr-FR");
  const yearMonth = normalized.match(/^(\d{4})[-/.](\d{1,2})$/);

  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      return `${yearMonth[1]}-${String(month).padStart(2, "0")}`;
    }
  }

  const monthYear = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const month = monthNames[monthYear[1]];
    if (month) {
      return `${monthYear[2]}-${String(month).padStart(2, "0")}`;
    }
  }

  throw new Error(`Période Mercalys invalide: ${String(value ?? "")}`);
}
