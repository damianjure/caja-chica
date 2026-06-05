import type { Movimiento } from '../services/api';

export interface CurrencyTotals {
  ingreso: number;
  egreso: number;
  neto: number;
}

export interface CompanySummary {
  name: string;
  ingresosArs: number;
  gastosArs: number;
  saldoArs: number;
  ingresosUsd: number;
  gastosUsd: number;
  saldoUsd: number;
  movimientos: number;
}

export interface CategorySummary {
  name: string;
  egresoArs: number;
  egresoUsd: number;
  movimientos: number;
}

export interface IncomeSummary {
  name: string;
  ars: number;
  usd: number;
  movimientos: number;
}

export interface IncomeTagSummary {
  label: string;
  ars: number;
  usd: number;
  movimientos: number;
}

export interface MonthlySummary {
  period: string;
  ingresosArs: number;
  gastosArs: number;
  netoArs: number;
  ingresosUsd: number;
  gastosUsd: number;
  netoUsd: number;
}

export interface RecentExpenseItem {
  id: string;
  created_at: string;
  empresa_nombre: string;
  categoria: string;
  descripcion: string;
  monto: number;
  moneda: 'ARS' | 'USD';
}

export interface RecentIncomeItem {
  id: string;
  created_at: string;
  empresa_nombre: string;
  categoria: string;
  descripcion: string;
  monto: number;
  moneda: 'ARS' | 'USD';
}

export interface MovementFilters {
  company?: string;
  tipo?: 'all' | 'ingreso' | 'egreso';
  moneda?: 'all' | 'ARS' | 'USD';
  /** Category name, or 'all'/undefined for no filter. */
  category?: string;
  /** Inclusive date bounds 'YYYY-MM-DD' (client-side date filter). */
  from?: string;
  to?: string;
}

export type DatePeriod = 'hoy' | 'semana' | 'mes' | 'anio' | 'rango' | 'all';

/**
 * Resolve a date period to inclusive {from,to} 'YYYY-MM-DD' bounds (UTC).
 * Returns null for 'all'/'rango' (no implicit range — 'rango' is user-provided).
 */
export function periodToRange(period: DatePeriod, today: Date): { from: string; to: string } | null {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'hoy') return { from: iso(today), to: iso(today) };
  if (period === 'semana') {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: iso(start), to: iso(today) };
  }
  if (period === 'mes') {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0));
    return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: iso(last) };
  }
  if (period === 'anio') {
    const y = today.getUTCFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return null;
}

export const INCOME_TAG_LIBRARY = [
  { label: 'Venta mostrador', keywords: ['mostrador', 'local', 'caja'] },
  { label: 'Venta online', keywords: ['online', 'mercadolibre', 'mercado libre', 'tienda', 'web'] },
  { label: 'Cobro de cliente', keywords: ['cobro', 'cliente', 'factura'] },
  { label: 'Servicio técnico', keywords: ['servicio tecnico', 'servicio técnico', 'reparacion', 'reparación'] },
  { label: 'Mantenimiento', keywords: ['mantenimiento', 'abono', 'soporte'] },
  { label: 'Suscripción', keywords: ['suscripcion', 'suscripción', 'mensualidad', 'plan'] },
  { label: 'Transferencia recibida', keywords: ['transferencia', 'deposito', 'depósito', 'banco'] },
  { label: 'Comisión', keywords: ['comision', 'comisión', 'fee'] },
  { label: 'Honorarios', keywords: ['honorarios', 'consulta', 'asesoria', 'asesoría'] },
  { label: 'Reembolso', keywords: ['reembolso', 'devolucion', 'devolución', 'reintegro'] },
] as const;

export function formatCurrency(amount: number, currency: 'ARS' | 'USD') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getCurrentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrencyTotals(history: Movimiento[], currency: 'ARS' | 'USD'): CurrencyTotals {
  return history.reduce<CurrencyTotals>((acc, item) => {
    if (item.moneda !== currency) return acc;
    const amount = Number(item.monto || 0);

    if (item.tipo === 'ingreso') {
      acc.ingreso += amount;
      acc.neto += amount;
    } else {
      acc.egreso += amount;
      acc.neto -= amount;
    }

    return acc;
  }, { ingreso: 0, egreso: 0, neto: 0 });
}

export function getCompanySummaries(history: Movimiento[], extraCompanies: string[] = []) {
  const map = new Map<string, CompanySummary>();

  const blank = (name: string): CompanySummary => ({
    name,
    ingresosArs: 0,
    gastosArs: 0,
    saldoArs: 0,
    ingresosUsd: 0,
    gastosUsd: 0,
    saldoUsd: 0,
    movimientos: 0,
  });

  // Empresas sin movimientos también deben aparecer (recién creadas).
  extraCompanies.forEach((name) => {
    if (name && !map.has(name)) map.set(name, blank(name));
  });

  history.forEach((item) => {
    const name = item.empresa_nombre || 'Personal';
    const summary = map.get(name) ?? {
      name,
      ingresosArs: 0,
      gastosArs: 0,
      saldoArs: 0,
      ingresosUsd: 0,
      gastosUsd: 0,
      saldoUsd: 0,
      movimientos: 0,
    };
    const amount = Number(item.monto || 0);
    const isIncome = item.tipo === 'ingreso';
    const sign = isIncome ? 1 : -1;

    if (item.moneda === 'ARS') {
      if (isIncome) summary.ingresosArs += amount;
      else summary.gastosArs += amount;
      summary.saldoArs += amount * sign;
    }

    if (item.moneda === 'USD') {
      if (isIncome) summary.ingresosUsd += amount;
      else summary.gastosUsd += amount;
      summary.saldoUsd += amount * sign;
    }

    summary.movimientos += 1;
    map.set(name, summary);
  });

  return [...map.values()].sort((a, b) => (b.saldoArs + b.saldoUsd) - (a.saldoArs + a.saldoUsd));
}

export function getCategorySummaries(history: Movimiento[], companyName?: string) {
  const map = new Map<string, CategorySummary>();

  history
    .filter((item) => item.tipo === 'egreso')
    .filter((item) => !companyName || item.empresa_nombre === companyName)
    .forEach((item) => {
      const name = item.categoria || 'Otros';
      const summary = map.get(name) ?? { name, egresoArs: 0, egresoUsd: 0, movimientos: 0 };
      const amount = Number(item.monto || 0);

      if (item.moneda === 'ARS') summary.egresoArs += amount;
      if (item.moneda === 'USD') summary.egresoUsd += amount;
      summary.movimientos += 1;
      map.set(name, summary);
    });

  return [...map.values()].sort((a, b) => b.egresoArs - a.egresoArs || b.egresoUsd - a.egresoUsd);
}

export function getIncomeSummaries(history: Movimiento[]) {
  const map = new Map<string, IncomeSummary>();

  history
    .filter((item) => item.tipo === 'ingreso')
    .forEach((item) => {
      const name = item.empresa_nombre || item.descripcion || 'Sin clasificar';
      const summary = map.get(name) ?? { name, ars: 0, usd: 0, movimientos: 0 };
      const amount = Number(item.monto || 0);

      if (item.moneda === 'ARS') summary.ars += amount;
      if (item.moneda === 'USD') summary.usd += amount;
      summary.movimientos += 1;
      map.set(name, summary);
    });

  return [...map.values()].sort((a, b) => b.ars - a.ars || b.usd - a.usd);
}

export function getIncomeTagSummaries(history: Movimiento[]) {
  const map = new Map<string, IncomeTagSummary>();

  history
    .filter((item) => item.tipo === 'ingreso')
    .forEach((item) => {
      const haystack = [item.descripcion, item.categoria, item.empresa_nombre]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchedTags = INCOME_TAG_LIBRARY.filter((tag) =>
        tag.keywords.some((keyword) => haystack.includes(keyword)),
      );
      const tags = matchedTags.length > 0 ? matchedTags : [{ label: 'Cobro de cliente' } as const];

      tags.forEach((tag) => {
        const summary = map.get(tag.label) ?? { label: tag.label, ars: 0, usd: 0, movimientos: 0 };
        const amount = Number(item.monto || 0);

        if (item.moneda === 'ARS') summary.ars += amount;
        if (item.moneda === 'USD') summary.usd += amount;
        summary.movimientos += 1;
        map.set(tag.label, summary);
      });
    });

  return [...map.values()].sort((a, b) => b.ars - a.ars || b.usd - a.usd || b.movimientos - a.movimientos);
}

export function getMonthlySummaries(history: Movimiento[]) {
  const map = new Map<string, MonthlySummary>();

  history.forEach((item) => {
    const date = new Date(item.created_at);
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const summary = map.get(period) ?? {
      period,
      ingresosArs: 0,
      gastosArs: 0,
      netoArs: 0,
      ingresosUsd: 0,
      gastosUsd: 0,
      netoUsd: 0,
    };
    const amount = Number(item.monto || 0);

    if (item.moneda === 'ARS') {
      if (item.tipo === 'ingreso') {
        summary.ingresosArs += amount;
        summary.netoArs += amount;
      } else {
        summary.gastosArs += amount;
        summary.netoArs -= amount;
      }
    }

    if (item.moneda === 'USD') {
      if (item.tipo === 'ingreso') {
        summary.ingresosUsd += amount;
        summary.netoUsd += amount;
      } else {
        summary.gastosUsd += amount;
        summary.netoUsd -= amount;
      }
    }

    map.set(period, summary);
  });

  return [...map.values()].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 6);
}

export interface MonthlyChartPoint {
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface ComparisonRow {
  /** % de cambio vs mes anterior; null si no hay mes anterior o base ~0. */
  deltaPct: number | null;
  /** true cuando hay mes previo pero base ~0 y valor actual > 0: "nuevo". */
  isNew: boolean;
  current: number;
}
export interface MonthlyComparison {
  hasPrev: boolean;
  ingresos: ComparisonRow;
  gastos: ComparisonRow;
  utilidad: ComparisonRow;
}

/**
 * Compara el mes actual contra el anterior (ingresos/gastos/utilidad) en una moneda.
 * `summaries` viene newest-first (getMonthlySummaries). Sin mes previo → deltas null.
 */
export function buildMonthlyComparison(summaries: MonthlySummary[], currency: 'ARS' | 'USD'): MonthlyComparison {
  const cur = summaries[0];
  const prev = summaries[1];
  const pick = (s: MonthlySummary | undefined, k: 'ingresos' | 'gastos' | 'neto') => {
    if (!s) return 0;
    const suffix = currency === 'ARS' ? 'Ars' : 'Usd';
    return (s as unknown as Record<string, number>)[`${k}${suffix}`] ?? 0;
  };
  const row = (k: 'ingresos' | 'gastos' | 'neto'): ComparisonRow => {
    const c = pick(cur, k);
    const p = pick(prev, k);
    const baseZero = !prev || Math.abs(p) < 1;
    const deltaPct = baseZero ? null : Math.round(((c - p) / Math.abs(p)) * 100);
    const isNew = baseZero && !!prev && c > 0;
    return { deltaPct, isNew, current: c };
  };
  return {
    hasPrev: !!prev,
    ingresos: row('ingresos'),
    gastos: row('gastos'),
    utilidad: row('neto'),
  };
}

export interface BridgeSegment {
  label: string;
  kind: 'start' | 'down' | 'end';
  value: number;
  from: number;
  to: number;
}

/**
 * Puente de caja (waterfall) en una moneda, opcionalmente por empresa:
 * Ingresos (start) → resta cada categoría de gasto top (down) → Otros → Saldo (end).
 * Honesto con la data: no inventa "saldo inicial"; arranca en los ingresos del período.
 */
export function buildCashflowBridge(
  history: Movimiento[],
  currency: 'ARS' | 'USD',
  companies?: string[] | null,
  topN = 4,
): BridgeSegment[] {
  const scoped = companies && companies.length > 0
    ? history.filter((m) => companies.includes(m.empresa_nombre || 'Personal'))
    : history;
  const inCur = scoped.filter((m) => m.moneda === currency);
  const ingresos = inCur.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto || 0), 0);

  const byCat = new Map<string, number>();
  for (const m of inCur) {
    if (m.tipo !== 'egreso') continue;
    const cat = m.categoria || 'Sin categoría';
    byCat.set(cat, (byCat.get(cat) || 0) + Number(m.monto || 0));
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  if (ingresos === 0 && cats.length === 0) return [];

  const top = cats.slice(0, topN);
  const otros = cats.slice(topN).reduce((s, [, v]) => s + v, 0);

  const segs: BridgeSegment[] = [];
  let running = ingresos;
  segs.push({ label: 'Ingresos', kind: 'start', value: ingresos, from: 0, to: ingresos });
  for (const [cat, v] of top) {
    segs.push({ label: cat, kind: 'down', value: v, from: running, to: running - v });
    running -= v;
  }
  if (otros > 0) {
    segs.push({ label: 'Otros', kind: 'down', value: otros, from: running, to: running - otros });
    running -= otros;
  }
  segs.push({ label: 'Saldo', kind: 'end', value: running, from: 0, to: running });
  return segs;
}

/**
 * Monthly series for AreaTrendChart, in one currency, optionally scoped to a set of company
 * names (`companies` null/empty = todas). Oldest→newest, descarta meses sin movimiento.
 */
export function buildMonthlyChartData(
  history: Movimiento[],
  currency: 'ARS' | 'USD',
  companies?: string[] | null,
): MonthlyChartPoint[] {
  const scoped = companies && companies.length > 0
    ? history.filter((m) => companies.includes(m.empresa_nombre || 'Personal'))
    : history;
  return [...getMonthlySummaries(scoped)]
    .reverse()
    .map((i) =>
      currency === 'ARS'
        ? { label: i.period.slice(5), income: i.ingresosArs, expense: i.gastosArs, net: i.netoArs }
        : { label: i.period.slice(5), income: i.ingresosUsd, expense: i.gastosUsd, net: i.netoUsd },
    )
    .filter((i) => i.income > 0 || i.expense > 0);
}

export function getRecentExpenses(history: Movimiento[], companyName?: string, limit = 5): RecentExpenseItem[] {
  return history
    .filter((item) => item.tipo === 'egreso')
    .filter((item) => !companyName || item.empresa_nombre === companyName)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      created_at: item.created_at,
      empresa_nombre: item.empresa_nombre || 'Personal',
      categoria: item.categoria || 'Otros',
      descripcion: item.descripcion || 'Sin descripción',
      monto: Number(item.monto || 0),
      moneda: (item.moneda === 'USD' ? 'USD' : 'ARS'),
    }));
}

export function getRecentIncomes(history: Movimiento[], limit = 5): RecentIncomeItem[] {
  return history
    .filter((item) => item.tipo === 'ingreso')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      created_at: item.created_at,
      empresa_nombre: item.empresa_nombre || 'Personal',
      categoria: item.categoria || 'Otros',
      descripcion: item.descripcion || 'Sin descripción',
      monto: Number(item.monto || 0),
      moneda: item.moneda === 'USD' ? 'USD' : 'ARS',
    }));
}

export interface TopCategory {
  category: string;
  ars: number;
  usd: number;
}

/**
 * Top N categories by summed amount for a given tipo, optionally scoped to one company.
 * Sorted by ARS desc, then USD desc. Empty/null categoria → 'Otros'. Pure.
 */
export function topCategoriesByType(
  movements: Array<{ empresa_nombre?: string | null; categoria?: string | null; tipo: string; moneda: string; monto: number | string }>,
  company: string,
  tipo: 'ingreso' | 'egreso',
  limit = 3,
): TopCategory[] {
  const map = new Map<string, TopCategory>();
  for (const m of movements) {
    if (m.tipo !== tipo) continue;
    if (company !== 'all' && m.empresa_nombre !== company) continue;
    const cat = m.categoria && String(m.categoria).trim() ? String(m.categoria) : 'Otros';
    const amt = typeof m.monto === 'number' ? m.monto : parseFloat(String(m.monto)) || 0;
    const entry = map.get(cat) ?? { category: cat, ars: 0, usd: 0 };
    if (m.moneda === 'USD') entry.usd += amt;
    else entry.ars += amt;
    map.set(cat, entry);
  }
  return [...map.values()]
    .sort((a, b) => (b.ars - a.ars) || (b.usd - a.usd))
    .slice(0, limit);
}

export function filterMovements(history: Movimiento[], filters: MovementFilters) {
  return history.filter((item) => {
    if (filters.company && filters.company !== 'all' && item.empresa_nombre !== filters.company) return false;
    if (filters.tipo && filters.tipo !== 'all' && item.tipo !== filters.tipo) return false;
    if (filters.moneda && filters.moneda !== 'all' && item.moneda !== filters.moneda) return false;
    if (filters.category && filters.category !== 'all' && item.categoria !== filters.category) return false;
    if (filters.from || filters.to) {
      const day = (item.created_at ?? '').slice(0, 10);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
    }
    return true;
  });
}
