import type { Movimiento } from '../services/api';

/** CSV-escape: wrap in quotes if it contains comma/quote/newline; double internal quotes. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADER = ['Fecha', 'Tipo', 'Empresa', 'Categoría', 'Descripción', 'Monto', 'Moneda'];

/**
 * Build a CSV string from the (already filtered) movements shown in the UI.
 * Pure — no I/O. Faithful to what the user sees on screen.
 */
export function buildMovimientosCsv(movimientos: Movimiento[]): string {
  const rows = movimientos.map((m) =>
    [
      (m.created_at ?? '').slice(0, 10),
      m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      m.empresa_nombre ?? '',
      m.categoria ?? '',
      m.descripcion ?? '',
      m.monto ?? 0,
      m.moneda ?? '',
    ].map(csvCell).join(','),
  );
  return [HEADER.map(csvCell).join(','), ...rows].join('\n');
}

/**
 * Share via the native OS sheet (WhatsApp / Drive / contacts) when the Web Share API
 * supports files; otherwise fall back to a plain download. Browser-only (DOM).
 */
export async function shareOrDownloadCsv(filename: string, csv: string): Promise<void> {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

  const file = new File([blob], filename, { type: 'text/csv' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Movimientos — Caja Chica' });
      return;
    } catch {
      // user cancelled the share sheet — do nothing
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
