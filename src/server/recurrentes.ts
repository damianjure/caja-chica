export type Frecuencia = "diario" | "semanal" | "quincenal" | "mensual" | "anual";

export const FRECUENCIA_WHITELIST: Frecuencia[] = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
  "anual",
];

/**
 * Returns the last day of a given UTC month/year.
 */
function lastDayOfMonth(year: number, month: number): number {
  // month is 0-indexed (JS Date style)
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Add one month to a UTC date, clamping to the last day of the target month
 * if the source day doesn't exist there (e.g. Jan 31 → Feb 28).
 */
export function addMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonth = (month + 1) % 12;
  const targetYear = month === 11 ? year + 1 : year;
  const maxDay = lastDayOfMonth(targetYear, targetMonth);
  const targetDay = Math.min(day, maxDay);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

/**
 * Add one year to a UTC date, clamping Feb 29 → Feb 28 in non-leap years.
 */
function addYear(date: Date): Date {
  const year = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const maxDay = lastDayOfMonth(year, month);
  return new Date(Date.UTC(year, month, Math.min(day, maxDay)));
}

/**
 * Compute when a recurrente will next run, given its last_processed date.
 * Returns null when last_processed is null (caller renders "se activa esta noche").
 * All math is in UTC — no DST drift.
 */
export function computeNextRun(
  frecuencia: Frecuencia,
  lastProcessed: Date | null,
): Date | null {
  if (lastProcessed === null) return null;

  switch (frecuencia) {
    case "diario":
      return new Date(lastProcessed.getTime() + 1 * 24 * 3600 * 1000);
    case "semanal":
      return new Date(lastProcessed.getTime() + 7 * 24 * 3600 * 1000);
    case "quincenal":
      return new Date(lastProcessed.getTime() + 14 * 24 * 3600 * 1000);
    case "mensual":
      return addMonth(lastProcessed);
    case "anual":
      return addYear(lastProcessed);
  }
}

/**
 * Returns a human-readable relative label for a next-run date.
 * `now` defaults to the current time; injectable for tests.
 */
export function relativeRunLabel(nextRun: Date | null, now: Date = new Date()): string {
  if (nextRun === null) return "se activa esta noche";

  const diffMs = nextRun.getTime() - now.getTime();
  const d = diffMs / (1000 * 3600 * 24);

  if (d < 1) return "hoy";
  if (d < 2) return "mañana";
  if (d < 7) return `en ${Math.floor(d)} días`;
  if (d < 14) return "en 1 semana";
  if (d < 30) return `en ${Math.round(d / 7)} semanas`;
  if (d < 60) return "en 1 mes";
  if (d < 365) return `en ${Math.round(d / 30)} meses`;
  if (d < 730) return "en 1 año";
  return `en ${Math.round(d / 365)} años`;
}
