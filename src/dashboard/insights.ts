/**
 * Pure insights function that compares current vs previous period
 * and emits at most 3 calm, factual insight strings.
 *
 * Deterministic: inputs in, strings out. No side effects.
 */

import type { MonthlySummary, CategorySummary } from './summary';

export interface InsightInput {
  monthlySummaries: MonthlySummary[];
  categorySummaries: CategorySummary[];
  prevCategorySummaries?: CategorySummary[];
  currentPeriod: string;
}

/** Minimum absolute ARS amount to consider for insights (avoids noise on tiny amounts). */
const MIN_ABSOLUTE_ARS = 1000;
/** Minimum % change to emit an insight (avoids noise on tiny fluctuations). */
const CHANGE_THRESHOLD = 0.10;
/** Maximum number of insights to emit. */
const MAX_INSIGHTS = 3;

function pctChange(current: number, prev: number): number {
  if (prev === 0) return 0;
  return (current - prev) / prev;
}

function formatPct(ratio: number): string {
  return `${Math.round(Math.abs(ratio) * 100)}%`;
}

/**
 * Compare current vs previous period from summaries and emit calm insight strings.
 * Uses the two most recent periods in monthlySummaries (already sorted desc by getMonthlySummaries).
 */
export function generateInsights(input: InsightInput): string[] {
  const { monthlySummaries, categorySummaries, prevCategorySummaries, currentPeriod } = input;

  if (monthlySummaries.length < 2) return [];

  // monthlySummaries is sorted descending (most recent first)
  const current = monthlySummaries[0]!;
  const prev = monthlySummaries[1]!;

  // Make sure current is actually the currentPeriod (defensive)
  if (current.period !== currentPeriod) return [];

  const insights: string[] = [];

  // 1. Income change
  if (current.ingresosArs > 0 || prev.ingresosArs > 0) {
    const ratio = pctChange(current.ingresosArs, prev.ingresosArs);
    if (Math.abs(ratio) >= CHANGE_THRESHOLD && prev.ingresosArs >= MIN_ABSOLUTE_ARS) {
      if (ratio > 0) {
        insights.push(`Tus ingresos subieron ${formatPct(ratio)} respecto al mes pasado.`);
      } else {
        insights.push(`Tus ingresos bajaron ${formatPct(ratio)} vs el mes pasado.`);
      }
    }
  }

  if (insights.length >= MAX_INSIGHTS) return insights;

  // 2. Expense change
  if (current.gastosArs > 0 || prev.gastosArs > 0) {
    const ratio = pctChange(current.gastosArs, prev.gastosArs);
    if (Math.abs(ratio) >= CHANGE_THRESHOLD && prev.gastosArs >= MIN_ABSOLUTE_ARS) {
      if (ratio > 0) {
        insights.push(`Gastaste ${formatPct(ratio)} más que el mes pasado.`);
      } else {
        insights.push(`Tus gastos bajaron ${formatPct(ratio)} respecto al mes pasado.`);
      }
    }
  }

  if (insights.length >= MAX_INSIGHTS) return insights;

  // 3. Top category change (compare categorySummaries vs prevCategorySummaries)
  const prevCats = prevCategorySummaries ?? [];
  if (prevCats.length > 0 && categorySummaries.length > 0) {
    const topCurrent = categorySummaries[0]!;
    const matchPrev = prevCats.find((c) => c.name === topCurrent.name);
    if (matchPrev && topCurrent.egresoArs >= MIN_ABSOLUTE_ARS) {
      const ratio = pctChange(topCurrent.egresoArs, matchPrev.egresoArs);
      if (Math.abs(ratio) >= CHANGE_THRESHOLD && matchPrev.egresoArs >= MIN_ABSOLUTE_ARS) {
        if (ratio > 0) {
          insights.push(`Gastaste ${formatPct(ratio)} más en ${topCurrent.name} que el mes pasado.`);
        } else {
          insights.push(`Bajaste ${formatPct(ratio)} en ${topCurrent.name} respecto al mes pasado.`);
        }
      }
    }
  }

  return insights.slice(0, MAX_INSIGHTS);
}
