import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type EmailLogRow, type EmailLogFilters, type EmailLogType } from "../../../../services/api";

function relativeTimeShort(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hs`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

const TYPE_LABELS: Record<EmailLogType, string> = {
  app_invite: "Invitación app",
  dashboard_invite: "Invitación dashboard",
  test: "Prueba",
  reminder: "Recordatorio",
};

const TYPE_OPTIONS: { value: EmailLogType | "all"; label: string }[] = [
  { value: "all", label: "Todos los tipos" },
  { value: "app_invite", label: "Invitación app" },
  { value: "dashboard_invite", label: "Invitación dashboard" },
  { value: "test", label: "Prueba" },
  { value: "reminder", label: "Recordatorio" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "ok", label: "Enviados" },
  { value: "fail", label: "Fallidos" },
];

export function EmailLogView() {
  const [typeFilter, setTypeFilter] = useState<EmailLogType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "fail">("all");

  const filters: EmailLogFilters = {};
  if (typeFilter !== "all") filters.type = typeFilter;
  if (statusFilter === "ok") filters.ok = true;
  if (statusFilter === "fail") filters.ok = false;

  const { data: rows, isLoading, isError } = useQuery<EmailLogRow[]>({
    queryKey: ["emailLog", typeFilter, statusFilter],
    queryFn: () => api.getEmailLog(filters),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="email-log-type" className="sr-only">Filtrar por tipo</label>
          <select
            id="email-log-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as EmailLogType | "all")}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            aria-label="Filtrar por tipo de email"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="email-log-status" className="sr-only">Filtrar por estado</label>
          <select
            id="email-log-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "ok" | "fail")}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            aria-label="Filtrar por estado de envío"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Triple-state: loading / error / content */}
      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Cargando log de emails">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-[var(--app-surface-2)] animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[var(--app-red-border)] bg-[var(--app-red-surface)] px-4 py-3 text-sm text-[var(--app-red-text)]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          No se pudo cargar el log de emails. Intentá de nuevo.
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-500">
          <p className="font-medium">Sin registros</p>
          <p className="mt-1 text-neutral-400">
            {typeFilter !== "all" || statusFilter !== "all"
              ? "No hay envíos que coincidan con el filtro."
              : "Todavía no hay envíos registrados."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-y-1" role="table">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold uppercase tracking-widest text-neutral-500 pb-2 pr-4">
                  Destinatario
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-widest text-neutral-500 pb-2 pr-4">
                  Tipo
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-widest text-neutral-500 pb-2 pr-4">
                  Estado
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-widest text-neutral-500 pb-2 pr-4">
                  Enviado
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-widest text-neutral-500 pb-2">
                  ID Brevo
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border border-neutral-200 rounded-lg bg-white"
                >
                  <td className="px-3 py-2.5 text-neutral-800 font-medium truncate max-w-[200px] rounded-l-lg">
                    {row.to_email}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-full bg-[var(--app-surface-2)] border border-[var(--app-border)] px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                      {TYPE_LABELS[row.email_type] ?? row.email_type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.ok ? (
                      <span className="inline-flex items-center rounded-full bg-[var(--app-green-surface)] border border-[var(--app-green-border)] text-[var(--app-green-text)] px-2.5 py-0.5 text-xs font-semibold">
                        Enviado
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-full bg-[var(--app-red-surface)] border border-[var(--app-red-border)] text-[var(--app-red-text)] px-2.5 py-0.5 text-xs font-semibold"
                        title={row.error_body ?? undefined}
                      >
                        Falló
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap text-xs">
                    {relativeTimeShort(row.sent_at)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-neutral-400 truncate max-w-[160px] rounded-r-lg">
                    {row.brevo_message_id ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
