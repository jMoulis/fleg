const DAY_MILLISECONDS = 86_400_000;

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, amount: number): string {
  const date = parseDateOnly(value);
  date.setTime(date.getTime() + amount * DAY_MILLISECONDS);
  return toDateOnly(date);
}

export function startOfIsoWeek(value: string): string {
  const date = parseDateOnly(value);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(value, -daysSinceMonday);
}

export function getIsoWeekDays(value: string): string[] {
  const monday = startOfIsoWeek(value);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function eventCoversDate(
  event: { startsOn: string; endsOn: string },
  date: string,
): boolean {
  return event.startsOn <= date && event.endsOn >= date;
}

export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    ...options,
  }).format(parseDateOnly(value));
}
