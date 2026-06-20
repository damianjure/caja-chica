import { useState } from "react";
import { Loader2, Wrench, Calendar, CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type MaintenanceStatus } from "../../../../services/api";
import { ConfirmModal } from "../../../ui/ConfirmModal";

interface MaintenanceSectionProps {
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

// Duration in minutes → computed into an ISO estimated-end timestamp on submit.
const DURATION_OPTIONS = [
  { value: "", label: "Sin estimación" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "480", label: "8 horas" },
];

function StatusChip({ status }: { status: MaintenanceStatus["status"] }) {
  if (status === "none") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--app-green-surface)] border border-[var(--app-green-border)] text-[var(--app-green-text)] px-3 py-1 text-xs font-semibold">
        Ninguno
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--app-amber-surface)] border border-[var(--app-amber-border)] text-[var(--app-amber-text)] px-3 py-1 text-xs font-semibold">
        En mantenimiento
      </span>
    );
  }
  if (status === "grace") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--app-amber-surface)] border border-[var(--app-amber-border)] text-[var(--app-amber-text)] px-3 py-1 text-xs font-semibold">
        Período de gracia
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--app-blue-surface)] border border-[var(--app-blue-border)] text-[var(--app-blue-text)] px-3 py-1 text-xs font-semibold">
        Programado
      </span>
    );
  }
  return null;
}

export function MaintenanceSection({ showNotice, setError }: MaintenanceSectionProps) {
  const queryClient = useQueryClient();
  const { data: currentStatus } = useQuery<MaintenanceStatus>({
    queryKey: ["maintenanceStatus"],
    queryFn: () => api.getMaintenanceStatus(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Immediate activation fields
  const [activateMessage, setActivateMessage] = useState("");
  const [activateEstimated, setActivateEstimated] = useState("");
  const [activating, setActivating] = useState(false);
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);

  // Schedule fields
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [scheduleEstimated, setScheduleEstimated] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // End maintenance
  const [ending, setEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const status = currentStatus?.status ?? "none";
  const isLive = status === "active" || status === "grace" || status === "scheduled";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["maintenanceStatus"] });
  };

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    try {
      const min = Number(activateEstimated);
      await api.activateMaintenance({
        message: activateMessage.trim() || undefined,
        estimatedEnd: min > 0 ? new Date(Date.now() + min * 60_000).toISOString() : undefined,
      });
      invalidate();
      showNotice("Mantenimiento activado");
      setShowActivateConfirm(false);
      setActivateMessage("");
      setActivateEstimated("");
    } catch {
      setError("No se pudo activar el mantenimiento.");
    } finally {
      setActivating(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleAt) { setError("Elegí una fecha y hora para programar."); return; }
    setScheduling(true);
    setError(null);
    try {
      const min = Number(scheduleEstimated);
      await api.scheduleMaintenance({
        scheduledAt: new Date(scheduleAt).toISOString(),
        message: scheduleMessage.trim() || undefined,
        estimatedEnd: min > 0 ? new Date(new Date(scheduleAt).getTime() + min * 60_000).toISOString() : undefined,
      });
      invalidate();
      showNotice("Mantenimiento programado");
      setScheduleAt("");
      setScheduleMessage("");
      setScheduleEstimated("");
    } catch {
      setError("No se pudo programar el mantenimiento.");
    } finally {
      setScheduling(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    setError(null);
    try {
      await api.endMaintenance();
      invalidate();
      showNotice("Mantenimiento finalizado");
      setShowEndConfirm(false);
    } catch {
      setError("No se pudo finalizar el mantenimiento.");
    } finally {
      setEnding(false);
    }
  };

  return (
    <section className="bg-[var(--app-surface-1)] border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-6">
        <h2 className="text-xl font-bold text-[var(--app-text-1)] tracking-tight">Mantenimiento del sistema</h2>
        <p className="text-sm text-[var(--app-text-3)] mt-1.5 leading-relaxed max-w-prose">
          Activá o programá el modo mantenimiento para pausar escrituras y notificar a los usuarios.
        </p>
      </header>

      {/* Current status */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-[var(--app-text-2)]">Estado actual:</span>
        <StatusChip status={status} />
        {status === "grace" && currentStatus?.grace_ends_at && (
          <span className="text-xs text-[var(--app-text-3)]">
            Activo a las {new Date(currentStatus.grace_ends_at).toLocaleString("es-AR")}
          </span>
        )}
        {status === "scheduled" && currentStatus?.scheduled_at && (
          <span className="text-xs text-[var(--app-text-3)]">
            Programado para {new Date(currentStatus.scheduled_at).toLocaleString("es-AR")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Immediate activation */}
        <div className="rounded-xl border border-[var(--app-border)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--app-text-1)] flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[var(--app-text-3)]" />
            Activar mantenimiento inmediato
          </h3>
          {status === "grace" && (
            <p className="text-sm text-[var(--app-amber-text)] bg-[var(--app-amber-surface)] border border-[var(--app-amber-border)] rounded-lg px-3 py-2">
              Sistema en período de gracia — se activará pronto.
            </p>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[var(--app-text-2)] block mb-1">Mensaje para usuarios</label>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                placeholder="Ej: Actualizando la base de datos"
                value={activateMessage}
                onChange={(e) => setActivateMessage(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--app-text-2)] block mb-1">Duración estimada</label>
              <select
                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                value={activateEstimated}
                onChange={(e) => setActivateEstimated(e.target.value)}
                disabled={isLive}
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => setShowActivateConfirm(true)}
            disabled={isLive || activating}
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Wrench className="w-4 h-4" />
            Activar mantenimiento inmediato
          </button>
          {showActivateConfirm && (
            <ConfirmModal
              title="Activar modo mantenimiento"
              description="Todos los usuarios quedarán sin acceso a escritura. Se enviará notificación por email y Telegram."
              confirmLabel="Activar"
              tone="danger"
              onConfirm={async () => { await handleActivate(); }}
              onCancel={() => setShowActivateConfirm(false)}
            />
          )}
        </div>

        {/* Scheduled maintenance */}
        <div className="rounded-xl border border-[var(--app-border)] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--app-text-1)] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--app-text-3)]" />
            Programar mantenimiento
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[var(--app-text-2)] block mb-1">Fecha y hora de inicio</label>
              <input
                type="datetime-local"
                className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--app-text-2)] block mb-1">Mensaje para usuarios</label>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                placeholder="Ej: Actualizando la base de datos"
                value={scheduleMessage}
                onChange={(e) => setScheduleMessage(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--app-text-2)] block mb-1">Duración estimada</label>
              <select
                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                value={scheduleEstimated}
                onChange={(e) => setScheduleEstimated(e.target.value)}
                disabled={isLive}
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => void handleSchedule()}
            disabled={isLive || scheduling}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-4 py-2 text-sm font-semibold text-[var(--app-strong-text)] hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Programar mantenimiento
          </button>
        </div>

        {/* End maintenance */}
        {isLive && (
          <div className="rounded-xl border border-[var(--app-red-border)] bg-[var(--app-red-surface)] p-5 space-y-3 md:col-span-2">
            <h3 className="text-sm font-semibold text-[var(--app-red-text)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Finalizar mantenimiento
            </h3>
            <button
              onClick={() => setShowEndConfirm(true)}
              disabled={ending}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--app-red-text)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              Finalizar mantenimiento
            </button>
            {showEndConfirm && (
              <ConfirmModal
                title="Finalizar mantenimiento"
                description="El servicio volverá a modo normal y se notificará a los usuarios."
                confirmLabel="Finalizar"
                tone="danger"
                onConfirm={async () => { await handleEnd(); }}
                onCancel={() => setShowEndConfirm(false)}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
