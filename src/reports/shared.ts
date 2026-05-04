export interface ReportMovimientoLike {
  created_at: string;
  empresa_nombre: string;
  tipo: string;
  moneda: string;
}

export type ReportExportFormat = "csv" | "pdf";
export type ReportPeriod = "day" | "week" | "month" | "range";
export type ReportMovementType = "all" | "ingreso" | "egreso";
export type ReportCurrency = "all" | "ARS" | "USD";

export interface ReportFilters {
  company: string;
  tipo: ReportMovementType;
  moneda: ReportCurrency;
}

export interface ReportExportRequest extends ReportFilters {
  format: ReportExportFormat;
  period: ReportPeriod;
  anchorDate?: string;
  month?: string;
  from?: string;
  to?: string;
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

export function filterMovementsForReport(
  history: ReportMovimientoLike[],
  filters: ReportFilters,
  range: ReportDateRange,
) {
  return history.filter((item) => {
    const createdAt = new Date(item.created_at);
    if (createdAt < range.start || createdAt > range.end) return false;
    if (filters.company !== "all" && item.empresa_nombre !== filters.company) return false;
    if (filters.tipo !== "all" && item.tipo !== filters.tipo) return false;
    if (filters.moneda !== "all" && item.moneda !== filters.moneda) return false;
    return true;
  });
}
