import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileSpreadsheet, FolderOpen, HardDriveUpload, Loader2, Unlink } from "lucide-react";

import { filterMovementsForReport, resolveReportDateRange, type ReportExportRequest, type ReportPeriod } from "../../../reports/shared";
import { api, type DriveStatus, type Movimiento, type ReportExportRecord } from "../../../services/api";
import { MetricCard, PlaceholderPanel, SectionCard } from "../primitives";

interface InformesTabProps {
  history: Movimiento[];
  companiesList: string[];
  canWriteData: boolean;
  canUseDrive: boolean;
  canConnectDrive: boolean;
}

function triggerDownload(fileName: string, mimeType: string, contentBase64: string) {
  const binary = atob(contentBase64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function InformesTab({ history, companiesList, canWriteData, canUseDrive, canConnectDrive }: InformesTabProps) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [month, setMonth] = useState(thisMonth);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [company, setCompany] = useState("all");
  const [tipo, setTipo] = useState<ReportExportRequest["tipo"]>("all");
  const [moneda, setMoneda] = useState<ReportExportRequest["moneda"]>("all");
  const [exportsHistory, setExportsHistory] = useState<ReportExportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busyFormat, setBusyFormat] = useState<"csv" | "pdf" | null>(null);
  const [busyDrive, setBusyDrive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus>({ connected: false, enabled: false });
  const [loadingDrive, setLoadingDrive] = useState(true);

  useEffect(() => {
    let active = true;
    void api
      .getReportExports()
      .then((items) => { if (active) setExportsHistory(items); })
      .catch(() => { if (active) setError("No pude cargar el historial de exportaciones."); })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!canUseDrive) { setLoadingDrive(false); return; }
    let active = true;
    void api.getDriveStatus()
      .then((s) => { if (active) setDriveStatus(s); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingDrive(false); });
    return () => { active = false; };
  }, [canUseDrive]);

  // Handle OAuth callback redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("driveConnected") === "true") {
      setDriveStatus({ connected: true, enabled: true });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("driveError")) {
      setError(`Error al conectar Drive: ${params.get("driveError")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const reportRequestBase = useMemo<ReportExportRequest>(
    () => ({ format: "csv", period, anchorDate, month, from, to, companies: company === "all" ? [] : [company], tipo, moneda }),
    [anchorDate, company, from, month, moneda, period, tipo, to],
  );

  const previewRange = resolveReportDateRange(reportRequestBase);
  const previewMovements = previewRange
    ? filterMovementsForReport(history, { companies: company === "all" ? [] : [company], tipo, moneda }, previewRange)
    : [];

  const exportReport = async (format: "csv" | "pdf", destination: "local" | "drive" = "local") => {
    try {
      if (destination === "drive") setBusyDrive(true);
      else setBusyFormat(format);
      setError(null);
      const response = await api.exportReport({ ...reportRequestBase, format, destination });
      if (destination === "local" && response.contentBase64) {
        triggerDownload(response.fileName, response.mimeType, response.contentBase64);
      }
      setExportsHistory((prev) => [
        {
          id: response.record.id ?? `${format}-${response.record.created_at}`,
          created_at: response.record.created_at,
          format,
          period_label: response.record.periodLabel,
          company: response.record.company,
          tipo: response.record.tipo,
          moneda: response.record.moneda,
          total_movements: response.record.totalMovements,
          file_name: response.fileName,
          destination: response.record.destination,
          drive_url: response.record.driveUrl,
        },
        ...prev,
      ]);
    } catch {
      setError(destination === "drive" ? "No se pudo exportar a Drive." : "No se pudo exportar el informe.");
    } finally {
      setBusyFormat(null);
      setBusyDrive(false);
    }
  };

  const connectDrive = async () => {
    try {
      setError(null);
      const { url } = await api.getDriveAuthUrl();
      window.location.href = url;
    } catch {
      setError("No se pudo iniciar la conexión con Drive.");
    }
  };

  const disconnectDrive = async () => {
    try {
      setError(null);
      await api.disconnectDrive();
      setDriveStatus((prev) => ({ ...prev, connected: false }));
    } catch {
      setError("No se pudo desconectar Drive.");
    }
  };

  const lastExport = exportsHistory[0];
  const isBusy = busyFormat !== null || busyDrive;
  const driveReady = canUseDrive && driveStatus.enabled && driveStatus.connected;

  return (
    <div className="stack-relaxed">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Exportaciones" value={String(exportsHistory.length)} tone="neutral" />
        <MetricCard
          label="Última salida"
          value={lastExport ? lastExport.format.toUpperCase() : "Sin historial"}
          tone="neutral"
        />
        <MetricCard
          label="Google Drive"
          value={
            !canUseDrive ? "Sin permiso" :
            loadingDrive ? "Verificando..." :
            !driveStatus.enabled ? "No configurado" :
            driveStatus.connected ? "Conectado" : "Desconectado"
          }
          tone={driveReady ? "success" : "warning"}
        />
      </div>

      {canConnectDrive && !loadingDrive && driveStatus.enabled && (
        <SectionCard
          title="Google Drive"
          description={driveStatus.connected
            ? "Tu cuenta está conectada. Los informes pueden guardarse directamente en Drive."
            : "Conectá tu cuenta de Google para guardar informes directamente en Drive."}
        >
          <div className="flex items-center gap-3">
            {driveStatus.connected ? (
              <button
                onClick={() => void disconnectDrive()}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:border-rose-400"
              >
                <Unlink className="h-4 w-4" />
                Desconectar Drive
              </button>
            ) : (
              <button
                onClick={() => void connectDrive()}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 border border-neutral-900 px-4 py-2 text-sm font-medium text-white hover:border-[var(--app-text-2)]"
              >
                <HardDriveUpload className="h-4 w-4" />
                Conectar Google Drive
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </SectionCard>
      )}

      <SectionCard
        title="Generador de informes"
        description="Los filtros se aplican sobre los movimientos del dashboard. La exportación final sale del backend y queda trazada."
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr,0.8fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-sm text-neutral-600">
                <span className="font-medium text-neutral-800">Período</span>
                <select className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
                  <option value="day">Día</option>
                  <option value="week">Semana</option>
                  <option value="month">Mes</option>
                  <option value="range">Rango puntual</option>
                </select>
              </label>

              {(period === "day" || period === "week") && (
                <label className="space-y-1 text-sm text-neutral-600">
                  <span className="font-medium text-neutral-800">{period === "day" ? "Fecha" : "Fecha ancla"}</span>
                  <input className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
                </label>
              )}

              {period === "month" && (
                <label className="space-y-1 text-sm text-neutral-600">
                  <span className="font-medium text-neutral-800">Mes</span>
                  <input className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                </label>
              )}

              {period === "range" && (
                <>
                  <label className="space-y-1 text-sm text-neutral-600">
                    <span className="font-medium text-neutral-800">Desde</span>
                    <input className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm text-neutral-600">
                    <span className="font-medium text-neutral-800">Hasta</span>
                    <input className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                  </label>
                </>
              )}

              <label className="space-y-1 text-sm text-neutral-600">
                <span className="font-medium text-neutral-800">Empresa</span>
                <select className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" value={company} onChange={(event) => setCompany(event.target.value)}>
                  {companiesList.map((item) => (
                    <option key={item} value={item}>{item === "all" ? "Todas las empresas" : item}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-neutral-600">
                <span className="font-medium text-neutral-800">Tipo</span>
                <select className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" value={tipo} onChange={(event) => setTipo(event.target.value as ReportExportRequest["tipo"])}>
                  <option value="all">Todos</option>
                  <option value="ingreso">Ingresos</option>
                  <option value="egreso">Gastos</option>
                </select>
              </label>

              <label className="space-y-1 text-sm text-neutral-600">
                <span className="font-medium text-neutral-800">Moneda</span>
                <select className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-100 px-3 py-2" value={moneda} onChange={(event) => setMoneda(event.target.value as ReportExportRequest["moneda"])}>
                  <option value="all">Todas</option>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Vista rápida</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-900">
                    {previewRange ? previewRange.label : "Configuración inválida"}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    Sobre los movimientos visibles en el dashboard. La exportación final sale del backend y queda trazada.
                  </p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 text-right shadow-sm">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Movimientos visibles</div>
                  <div className="text-2xl font-semibold text-neutral-900">{previewMovements.length}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                  onClick={() => void exportReport("csv", "local")}
                  disabled={!canWriteData || !previewRange || isBusy}
                >
                  {busyFormat === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Exportar CSV
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-400"
                  onClick={() => void exportReport("pdf", "local")}
                  disabled={!canWriteData || !previewRange || isBusy}
                >
                  {busyFormat === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Exportar PDF
                </button>
                {driveReady && (
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void exportReport("pdf", "drive")}
                    disabled={!canWriteData || !previewRange || isBusy}
                  >
                    {busyDrive ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveUpload className="h-4 w-4" />}
                    Guardar en Drive
                  </button>
                )}
              </div>

              {!canWriteData && (
                <p className="mt-3 text-sm text-amber-700">
                  Tenés rol viewer. Podés consultar, pero no disparar exportaciones.
                </p>
              )}
              {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-neutral-700 shadow-sm">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="text-lg font-semibold text-neutral-900">Historial de exportaciones</div>
            <p className="mt-1 text-sm text-neutral-600">
              Cada exportación queda registrada con su período y filtros.
            </p>

            <div className="mt-4 space-y-3">
              {loadingHistory ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando historial…
                </div>
              ) : exportsHistory.length === 0 ? (
                <p className="text-sm text-neutral-500">Todavía no hay exportaciones registradas.</p>
              ) : (
                exportsHistory.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
                      <div className="font-medium text-neutral-900 truncate min-w-0 flex-1">{item.file_name}</div>
                      <div className="flex items-center gap-1">
                        {item.destination === "drive" && item.drive_url ? (
                          <a
                            href={item.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:border-blue-400"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Drive
                          </a>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold uppercase text-neutral-600">
                            {item.format}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-neutral-600">{item.period_label}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {item.company === "all" ? "Todas las empresas" : item.company} · {item.tipo} · {item.moneda} · {item.total_movements} movimientos
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
