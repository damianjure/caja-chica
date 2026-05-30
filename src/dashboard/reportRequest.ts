import type { ReportExportRequest, ReportExportFormat } from '../reports/shared';
import { periodToRange, type DatePeriod } from './summary';

export interface MovimientosFilterState {
  datePeriod: DatePeriod;
  customFrom: string;
  customTo: string;
  selectedCompany: string;
  movementType: 'all' | 'ingreso' | 'egreso';
  movementCurrency: 'all' | 'ARS' | 'USD';
  selectedCategory: string;
}

// Far-past sentinel for "todo" (no date filter) so the backend range covers all data.
const ALL_FROM = '2000-01-01';

/**
 * Map the Movimientos toolbar filter state to a backend ReportExportRequest
 * (PDF/Drive export). Always emits period='range' with concrete from/to so any
 * date selection maps cleanly. Honors category (C-completo). Pure.
 */
export function buildExportRequest(
  filters: MovimientosFilterState,
  format: ReportExportFormat,
  destination: 'local' | 'drive',
  today: Date,
): ReportExportRequest {
  let from: string;
  let to: string;
  if (filters.datePeriod === 'rango') {
    from = filters.customFrom || ALL_FROM;
    to = filters.customTo || today.toISOString().slice(0, 10);
  } else if (filters.datePeriod === 'all') {
    from = ALL_FROM;
    to = today.toISOString().slice(0, 10);
  } else {
    const r = periodToRange(filters.datePeriod, today);
    from = r?.from ?? ALL_FROM;
    to = r?.to ?? today.toISOString().slice(0, 10);
  }

  return {
    format,
    period: 'range',
    from,
    to,
    companies: filters.selectedCompany === 'all' ? [] : [filters.selectedCompany],
    tipo: filters.movementType,
    moneda: filters.movementCurrency,
    categoria: filters.selectedCategory === 'all' ? undefined : filters.selectedCategory,
    destination,
  };
}
