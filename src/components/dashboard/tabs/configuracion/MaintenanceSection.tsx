import { useState } from "react";
import { Loader2, Wrench, Calendar, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type MaintenanceStatus } from "../../../../services/api";

interface MaintenanceSectionProps {
  currentStatus: MaintenanceStatus | undefined;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

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

export function MaintenanceSection({ currentStatus, showNotice, setError }: MaintenanceSectionProps) {
  const queryClient = useQueryClient();

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
      await api.activateMaintenance({
        message: activateMessage.trim() || undefined,
        estimatedEnd: activateEstimated.trim() || undefined,
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
      await api.scheduleMaintenance({
        scheduledAt: new Date(scheduleAt).toISOString(),
        message: scheduleMessage.trim() || undefined,
        estimatedEnd: scheduleEstimated.trim() || undefined,
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
    <section className="bg-white border border-neutral-200 rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-6">
        <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Mantenimiento del sistema</h2>
        <p className="text-sm text-neutral-500 mt-1.5 leading-relaxed max-w-prose">
          Activá o programá el modo mantenimiento para pausar escrituras y notificar a los usuarios.
        </p>
      </header>

      {/* Current status */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-neutral-700">Estado actual:</span>
        <StatusChip status={status} />
        {status === "grace" && currentStatus?.grace_ends_at && (
          <span className="text-xs text-neutral-500">
            Activo a las {new Date(currentStatus.grace_ends_at).toLocaleString("es-AR")}
          </span>
        )}
        {status === "scheduled" && currentStatus?.scheduled_at && (
          <span className="text-xs text-neutral-500">
            Programado para {new Date(currentStatus.scheduled_at).toLocaleString("es-AR")}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Immediate activation */}
        <div className="rounded-xl border border-neutral-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-neutral-500" />
            Activar mantenimiento inmediato
          </h3>
          {status === "grace" && (
            <p className="text-sm text-[var(--app-amber-text)] bg-[var(--app-amber-surface)] border border-[var(--app-amber-border)] rounded-lg px-3 py-2">
              Sistema en período de gracia — se activará pronto.
            </p>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Mensaje para usuarios</label>
              <input
                type="text"
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Ej: Actualizando la base de datos"
                value={activateMessage}
                onChange={(e) => setActivateMessage(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Duración estimada</label>
              <input
                type="text"
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Ej: 2 horas"
                value={activateEstimated}
                onChange={(e) => setActivateEstimated(e.target.value)}
                disabled={isLive}
              />
            </div>
          </div>

          {!showActivateConfirm ? (
            <button
              onClick={() => setShowActivateConfirm(true)}
              disabled={isLive || activating}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Wrench className="w-4 h-4" />
              Activar mantenimiento inmediato
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-700">¿Confirmar activación?</span>
              <button
                onClick={() => void handleActivate()}
                disabled={activating}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40 transition"
              >
                {activating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Sí, activar
              </button>
              <button
                onClick={() => setShowActivateConfirm(false)}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 hover:border-neutral-400 transition"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Scheduled maintenance */}
        <div className="rounded-xl border border-neutral-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-neutral-500" />
            Programar mantenimiento
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Fecha y hora de inicio</label>
              <input
                type="datetime-local"
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Mensaje para usuarios</label>
              <input
                type="text"
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Ej: Actualizando la base de datos"
                value={scheduleMessage}
                onChange={(e) => setScheduleMessage(e.target.value)}
                disabled={isLive}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Duración estimada</label>
              <input
                type="text"
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Ej: 2 horas"
                value={scheduleEstimated}
                onChange={(e) => setScheduleEstimated(e.target.value)}
                disabled={isLive}
              />
            </div>
          </div>
          <button
            onClick={() => void handleSchedule()}
            disabled={isLive || scheduling}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Programar mantenimiento
          </button>
        </div>

        {/* End maintenance */}
        {isLive && (
          <div className="rounded-xl border border-[var(--app-red-border)] bg-[var(--app-red-surface)] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--app-red-text)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Finalizar mantenimiento
            </h3>
            {!showEndConfirm ? (
              <button
                onClick={() => setShowEndConfirm(true)}
                disabled={ending}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--app-red-text)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar mantenimiento
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--app-red-text)]">¿Finalizar y volver a modo normal?</span>
                <button
                  onClick={() => void handleEnd()}
                  disabled={ending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--app-red-text)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition"
                >
                  {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Sí, finalizar
                </button>
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 hover:border-neutral-400 transition"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
