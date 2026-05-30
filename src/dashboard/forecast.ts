/**
 * Pure forecast functions for projecting saldo 30 days forward
 * based on active recurrentes.
 *
 * All functions are deterministic: they take `today` as a parameter,
 * never call Date.now() internally.
 */

import type { Frecuencia } from '../services/api';

export interface RecurrenteForForecast {
  id: string;
  monto: number;
  tipo: 'egreso' | 'ingreso';
  moneda: 'ARS' | 'USD';
  frecuencia: Frecuencia;
  descripcion?: string;
  is_active: boolean;
  deleted_at: string | null;
  next_run_at: string;
}

export interface ForecastOccurrence {
  date: string;          // ISO date 'YYYY-MM-DD'
  descripcion: string;
  signedAmount: number;  // positive = ingreso, negative = egreso
  moneda: 'ARS' | 'USD';
}

export interface ForecastInput {
  saldoArs: number;
  saldoUsd: number;
  recurrentes: RecurrenteForForecast[];
}

export interface ForecastResult {
  projectedArs: number;
  projectedUsd: number;
  occurrences: ForecastOccurrence[];
}

/** Advance a date by one frecuencia step. Returns a new Date (UTC). */
function addStep(d: Date, frecuencia: Frecuencia): Date {
  const next = new Date(d);
  switch (frecuencia) {
    case 'diario':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'semanal':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'quincenal':
      next.setUTCDate(next.getUTCDate() + 15);
      break;
    case 'mensual': {
      const originalDay = d.getUTCDate();
      next.setUTCMonth(next.getUTCMonth() + 1);
      // Clamp: if the resulting month is shorter (e.g. Jan 31 → Feb 28)
      if (next.getUTCDate() !== originalDay) {
        next.setUTCDate(0); // last day of the intended month
      }
      break;
    }
    case 'anual': {
      const originalDay = d.getUTCDate();
      const originalMonth = d.getUTCMonth();
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      // Clamp leap year: Feb 29 → Feb 28 in a non-leap year
      if (next.getUTCDate() !== originalDay || next.getUTCMonth() !== originalMonth) {
        next.setUTCDate(0);
      }
      break;
    }
  }
  return next;
}

/** Convert a Date to 'YYYY-MM-DD' in UTC. */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Expand occurrences for a list of recurrentes within today..today+30 (inclusive).
 * Inactive or deleted recurrentes are skipped.
 */
export function expandOccurrences(
  recurrentes: RecurrenteForForecast[],
  today: Date,
): ForecastOccurrence[] {
  const windowStart = toDateString(today);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 30);
  const windowEnd = toDateString(end);

  const occurrences: ForecastOccurrence[] = [];

  for (const r of recurrentes) {
    if (!r.is_active || r.deleted_at !== null) continue;

    const signedAmount = r.tipo === 'ingreso' ? r.monto : -r.monto;
    const MAX_ITERATIONS = 366; // defensive cap
    let iterations = 0;

    let current = new Date(r.next_run_at);

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const dateStr = toDateString(current);

      if (dateStr > windowEnd) break;

      if (dateStr >= windowStart) {
        occurrences.push({
          date: dateStr,
          descripcion: r.descripcion ?? '',
          signedAmount,
          moneda: r.moneda,
        });
      }

      current = addStep(current, r.frecuencia);
    }
  }

  occurrences.sort((a, b) => a.date.localeCompare(b.date));
  return occurrences;
}

/**
 * Project balance 30 days forward given current saldo per currency
 * and the list of recurrentes.
 */
export function projectBalance(input: ForecastInput, today: Date): ForecastResult {
  const occurrences = expandOccurrences(input.recurrentes, today);

  let projectedArs = input.saldoArs;
  let projectedUsd = input.saldoUsd;

  for (const occ of occurrences) {
    if (occ.moneda === 'ARS') {
      projectedArs += occ.signedAmount;
    } else {
      projectedUsd += occ.signedAmount;
    }
  }

  return { projectedArs, projectedUsd, occurrences };
}
