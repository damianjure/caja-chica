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

export function getCompanySummaries(history: Movimiento[]) {
  const map = new Map<string, CompanySummary>();

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

export function filterMovements(history: Movimiento[], filters: MovementFilters) {
  return history.filter((item) => {
    if (filters.company && filters.company !== 'all' && item.empresa_nombre !== filters.company) return false;
    if (filters.tipo && filters.tipo !== 'all' && item.tipo !== filters.tipo) return false;
    if (filters.moneda && filters.moneda !== 'all' && item.moneda !== filters.moneda) return false;
    return true;
  });
}
