import { expandOccurrences, type RecurrenteForForecast } from './forecast';
import type { Frecuencia } from '../services/api';

export type HeatLevel = 'none' | 'low' | 'med' | 'high';

export interface RecurrentesSummary {
  activos: number;
  /** Impacto mensual neto en ARS (ingreso +, egreso −), normalizado por frecuencia. */
  impactoMensualArs: number;
  /** Próxima fecha de impacto (ISO 'YYYY-MM-DD') entre los activos, o null. */
  proximaFechaIso: string | null;
  /** Suma neta ARS de las ocurrencias en los próximos 30 días. */
  proyeccion30dArs: number;
  /** 30 celdas (hoy + 29) con el total absoluto ARS del día y su nivel. */
  dias: Array<{ date: string; total: number; level: HeatLevel }>;
}

/** Veces por mes que pega cada frecuencia (aprox). */
const MONTHLY_FACTOR: Record<Frecuencia, number> = {
  diario: 30,
  semanal: 30 / 7,
  quincenal: 2,
  mensual: 1,
  anual: 1 / 12,
};

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function buildRecurrentesSummary(
  recurrentes: RecurrenteForForecast[],
  today: Date = new Date(),
): RecurrentesSummary {
  const active = recurrentes.filter((r) => r.is_active && r.deleted_at === null);

  const impactoMensualArs = active
    .filter((r) => r.moneda === 'ARS')
    .reduce((s, r) => {
      const factor = MONTHLY_FACTOR[r.frecuencia] ?? 1;
      const signed = r.tipo === 'ingreso' ? r.monto : -r.monto;
      return s + signed * factor;
    }, 0);

  const occurrences = expandOccurrences(active, today);

  // Próxima fecha: la primera ocurrencia (ya vienen ordenadas por fecha).
  const proximaFechaIso = occurrences.length > 0 ? occurrences[0].date : null;

  const proyeccion30dArs = occurrences
    .filter((o) => o.moneda === 'ARS')
    .reduce((s, o) => s + o.signedAmount, 0);

  // Heatmap: total absoluto ARS por día, 30 celdas desde hoy.
  const byDay = new Map<string, number>();
  for (const o of occurrences) {
    if (o.moneda !== 'ARS') continue;
    byDay.set(o.date, (byDay.get(o.date) || 0) + Math.abs(o.signedAmount));
  }
  const max = Math.max(0, ...byDay.values());
  const dias: RecurrentesSummary['dias'] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    const date = iso(d);
    const total = byDay.get(date) || 0;
    let level: HeatLevel = 'none';
    if (total > 0 && max > 0) {
      const r = total / max;
      level = r > 0.66 ? 'high' : r > 0.33 ? 'med' : 'low';
    }
    dias.push({ date, total, level });
  }

  return { activos: active.length, impactoMensualArs, proximaFechaIso, proyeccion30dArs, dias };
}
