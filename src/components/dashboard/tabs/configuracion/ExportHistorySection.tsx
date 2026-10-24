import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { api } from "../../../../services/api";
import { describeExportRecord, type ExportHistoryRow } from "../../../../dashboard/exportFeedback";

/** Recent report exports (PDF/CSV, downloaded or saved to Drive). */
export function ExportHistorySection() {
  const [rows, setRows] = useState<ExportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    api.getReportExports()
      .then((records) => { if (active) setRows(records.slice(0, 20).map(describeExportRecord)); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--app-text-3)] py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando exportaciones...
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--chart-expense)]">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>No pudimos cargar el historial de exportaciones.</span>
        <button
          onClick={() => load()}
          className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-xs font-semibold text-[var(--app-text-1)] transition hover:border-[var(--app-border-strong)]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--app-text-3)]">
        Todavía no exportaste informes. Desde Movimientos → Exportar podés descargarlos o guardarlos en Drive.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--app-border)]">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-[var(--app-text-1)]">{row.title}</p>
            <p className="text-xs text-[var(--app-text-3)]">{row.date} · {row.detail}</p>
          </div>
          {row.driveUrl && (
            <a
              href={row.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--app-text-2)] underline underline-offset-2 hover:text-[var(--app-text-1)]"
            >
              Abrir en Drive <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
