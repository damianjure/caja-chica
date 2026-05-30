export interface ReportMovimientoLike {
  created_at: string;
  empresa_nombre: string;
  tipo: string;
  moneda: string;
  categoria?: string;
}

export type ReportExportFormat = "csv" | "pdf";
export type ReportPeriod = "day" | "week" | "month" | "range";
export type ReportMovementType = "all" | "ingreso" | "egreso";
export type ReportCurrency = "all" | "ARS" | "USD";

export type ReportTipo = "ingreso" | "egreso" | "saldos";

export interface ReportFilters {
  companies: string[];
  tipo: ReportMovementType;
  moneda: ReportCurrency;
  /** Category name, or undefined/'all' for no filter (C-completo). */
  categoria?: string;
}

export interface ReportExportRequest extends ReportFilters {
  format: ReportExportFormat;
  period: ReportPeriod;
  anchorDate?: string;
  month?: string;
  from?: string;
  to?: string;
  destination?: "local" | "drive";
}

export interface ReportDateRange {
  start: Date;
  end: Date;
  label: string;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCMilliseconds(next.getUTCMilliseconds() - 1);
  return next;
}

export function resolveReportDateRange(
  request: Pick<ReportExportRequest, "period" | "anchorDate" | "month" | "from" | "to">,
): ReportDateRange | null {
  if (request.period === "day") {
    if (!request.anchorDate) return null;
    const start = parseDateOnly(request.anchorDate);
    return { start, end: endOfDay(start), label: `Día ${request.anchorDate}` };
  }

  if (request.period === "week") {
    if (!request.anchorDate) return null;
    const anchor = parseDateOnly(request.anchorDate);
    const day = anchor.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(anchor);
    start.setUTCDate(anchor.getUTCDate() + diffToMonday);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      start,
      end: endOfDay(end),
      label: `Semana ${start.toISOString().slice(0, 10)} a ${end.toISOString().slice(0, 10)}`,
    };
  }

  if (request.period === "month") {
    if (!request.month || !/^\d{4}-\d{2}$/.test(request.month)) return null;
    const start = new Date(`${request.month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { start, end: endOfDay(end), label: `Mes ${request.month}` };
  }

  if (request.period === "range") {
    if (!request.from || !request.to) return null;
    const start = parseDateOnly(request.from);
    const end = parseDateOnly(request.to);
    if (end.getTime() < start.getTime()) return null;
    return {
      start,
      end: endOfDay(end),
      label: `Rango ${request.from} a ${request.to}`,
    };
  }

  return null;
}

/**
 * Short markdown summary for the chat (export-after-report flow).
 * Counts + ingresos/gastos/neto per currency. Pure.
 */
export function buildReportSummaryText(
  movements: Array<{ tipo: string; moneda: string; monto: number | string }>,
  rangeLabel: string,
): string {
  let ingArs = 0, egrArs = 0, ingUsd = 0, egrUsd = 0;
  for (const m of movements) {
    const amt = typeof m.monto === "number" ? m.monto : parseFloat(String(m.monto)) || 0;
    if (m.moneda === "USD") {
      if (m.tipo === "ingreso") ingUsd += amt; else egrUsd += amt;
    } else {
      if (m.tipo === "ingreso") ingArs += amt; else egrArs += amt;
    }
  }
  const n = movements.length;
  const fmt = (x: number) => x.toLocaleString("es-AR");
  const usd = (ars: string, u: number) => (u ? `${ars} · u$s${fmt(u)}` : ars);
  return [
    `📊 *${rangeLabel}* — ${n} movimiento${n === 1 ? "" : "s"}`,
    `💚 Ingresos: ${usd(`$${fmt(ingArs)}`, ingUsd)}`,
    `🔴 Gastos: ${usd(`$${fmt(egrArs)}`, egrUsd)}`,
    `⚖️ Neto: ${usd(`$${fmt(ingArs - egrArs)}`, ingUsd - egrUsd)}`,
  ].join("\n");
}

export function filterMovementsForReport(
  history: ReportMovimientoLike[],
  filters: ReportFilters,
  range: ReportDateRange,
) {
  return history.filter((item) => {
    const createdAt = new Date(item.created_at);
    if (createdAt < range.start || createdAt > range.end) return false;
    if (
      filters.companies.length > 0 &&
      !filters.companies.includes("all") &&
      !filters.companies.includes(item.empresa_nombre)
    ) return false;
    if (filters.tipo !== "all" && item.tipo !== filters.tipo) return false;
    if (filters.moneda !== "all" && item.moneda !== filters.moneda) return false;
    if (filters.categoria && filters.categoria !== "all" && item.categoria !== filters.categoria) return false;
    return true;
  });
}
