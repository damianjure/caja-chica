import type { Movimiento, ReportExportRecord, ReportExportResponse } from '../services/api';
import type { ReportExportRequest } from '../reports/shared';
import { filterMovements } from './summary';

export const EMPTY_EXPORT_MESSAGE = 'No hay movimientos para exportar con estos filtros.';

/**
 * Message to show instead of requesting a report when no movement matches the
 * filters the server will apply (dates, company, type, currency, category).
 * The full history is loaded on the client, so this count is reliable.
 */
export function exportPrecheck(history: Movimiento[], request: ReportExportRequest): string | null {
  const matching = filterMovements(history, {
    company: request.companies?.[0] ?? 'all',
    tipo: (request.tipo ?? 'all') as 'all' | 'ingreso' | 'egreso',
    moneda: (request.moneda ?? 'all') as 'all' | 'ARS' | 'USD',
    category: request.categoria ?? 'all',
    from: request.from,
    to: request.to,
  });
  return matching.length === 0 ? EMPTY_EXPORT_MESSAGE : null;
}

/**
 * Feedback after the server answered the export. null means a local download
 * was started; an answer without the file is reported instead of doing nothing.
 */
export function exportResultFeedback(
  destination: 'local' | 'drive',
  res: Pick<ReportExportResponse, 'contentBase64' | 'driveUrl'>,
): { tone: 'success' | 'warning'; message: string } | null {
  if (destination === 'drive') {
    return res.driveUrl
      ? { tone: 'success', message: 'Informe guardado en Drive.' }
      : { tone: 'warning', message: 'No se pudo guardar en Drive.' };
  }
  return res.contentBase64 ? null : { tone: 'warning', message: 'No se pudo descargar el informe. Probá de nuevo.' };
}

export interface ExportHistoryRow {
  id: string;
  date: string;
  title: string;
  detail: string;
  driveUrl: string | null;
}

/** One readable row of the export history (most recent first, as the API returns it). */
export function describeExportRecord(record: ReportExportRecord): ExportHistoryRow {
  const count = record.total_movements;
  const parts = [
    `${count} movimiento${count !== 1 ? 's' : ''}`,
    record.destination === 'drive' ? 'Guardado en Drive' : 'Descargado',
  ];
  if (record.company && record.company !== 'all') parts.push(record.company);
  return {
    id: record.id,
    date: new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.created_at)),
    title: `${record.format.toUpperCase()} · ${record.period_label}`,
    detail: parts.join(' · '),
    driveUrl: record.destination === 'drive' ? record.drive_url ?? null : null,
  };
}
