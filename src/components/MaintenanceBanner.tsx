import type { MaintenanceStatus } from "../services/api";

interface MaintenanceBannerProps {
  status: MaintenanceStatus | undefined;
}

export function MaintenanceBanner({ status }: MaintenanceBannerProps) {
  if (!status || status.status === "none") return null;

  const isWarning = status.status === "active" || status.status === "grace";
  const isScheduled = status.status === "scheduled";

  let text: string;
  if (isScheduled && status.scheduled_at) {
    text = `📅 Mantenimiento programado para ${new Date(status.scheduled_at).toLocaleString("es-AR")}`;
  } else if (status.status === "grace") {
    const graceEnd = status.grace_ends_at ? new Date(status.grace_ends_at).toLocaleString("es-AR") : null;
    text = graceEnd
      ? `⚙️ Sistema en mantenimiento — activo a las ${graceEnd}`
      : "⚙️ Sistema en mantenimiento";
  } else {
    text = "⚙️ Sistema en mantenimiento";
  }

  const containerClass = isWarning
    ? "border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] text-[var(--app-amber-text)]"
    : "border-[var(--app-blue-border)] bg-[var(--app-blue-surface)] text-[var(--app-blue-text)]";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`w-full border-b px-4 py-3 text-sm font-medium ${containerClass}`}
    >
      <div className="mx-auto max-w-7xl flex flex-col gap-0.5">
        <span>{text}</span>
        {status.message && (
          <span className="font-normal opacity-80">{status.message}</span>
        )}
        {status.estimated_end_at && (
          <span className="font-normal opacity-70 text-xs">
            Duración estimada: {status.estimated_end_at}
          </span>
        )}
      </div>
    </div>
  );
}
