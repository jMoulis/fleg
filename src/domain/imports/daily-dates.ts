import { normalizeText } from "@/domain/imports/normalization";

function toBusinessDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date métier Mercalys invalide");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseBusinessDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toBusinessDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  const normalized = normalizeText(String(value ?? ""));
  const iso = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return toBusinessDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const french = normalized.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (french) {
    return toBusinessDate(
      Number(french[3]),
      Number(french[2]),
      Number(french[1]),
    );
  }

  throw new Error(`Date métier Mercalys invalide: ${String(value ?? "")}`);
}

export function periodKeyFromBusinessDate(businessDate: string): string {
  return businessDate.slice(0, 7);
}

export function isoWeekKeyFromBusinessDate(businessDate: string): string {
  const [year, month, day] = businessDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function enumerateBusinessDates(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (start.getTime() > end.getTime()) {
    throw new Error("La date de début doit précéder la date de fin");
  }

  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); ) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return dates;
}

export function shiftBusinessDate(
  businessDate: string,
  dayOffset: number,
): string {
  const normalized = parseBusinessDate(businessDate);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export function businessDateRangeLength(from: string, to: string): number {
  return enumerateBusinessDates(from, to).length;
}

export function periodBounds(periodKey: string): {
  startsOn: string;
  endsOn: string;
} {
  const match = periodKey.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    throw new Error("Période mensuelle invalide");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const startsOn = toBusinessDate(year, month, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startsOn,
    endsOn: toBusinessDate(year, month, lastDay),
  };
}

export function isoWeekBounds(isoWeekKey: string): {
  startsOn: string;
  endsOn: string;
} {
  const match = isoWeekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error("Clé de semaine ISO invalide");
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthIsoDay = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthIsoDay + 1 + (week - 1) * 7);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);

  return {
    startsOn: monday.toISOString().slice(0, 10),
    endsOn: sunday.toISOString().slice(0, 10),
  };
}
