import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { api, type AppViewer, type DashboardMember } from "../../../../services/api";
import { SectionCard } from "../../primitives";

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    owner: "bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]",
    editor: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    viewer: "bg-[var(--app-surface-2)] text-[var(--app-text-2)]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[role] ?? "bg-[var(--app-surface-2)] text-[var(--app-text-3)]"}`}>
      {role}
    </span>
  );
}

interface CuentaIdentidadSectionProps {
  viewer: AppViewer;
  selfMembership: DashboardMember | null;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function CuentaIdentidadSection({ viewer, selfMembership, showNotice, setError }: CuentaIdentidadSectionProps) {
  const [displayName, setDisplayName] = useState(viewer.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateMe({ display_name: displayName.trim() || null });
      showNotice("Nombre guardado");
    } catch {
      setError("No se pudo guardar el nombre.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Cuenta" description="Identidad y nombre visible en el dashboard.">
      {/* Email + roles */}
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 space-y-1">
        <div className="text-sm font-medium text-[var(--app-text-1)]">{viewer.email}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--app-text-3)]">Rol de app:</span>
          <span className="text-xs font-medium text-[var(--app-text-2)]">{viewer.role}</span>
          {selfMembership && (
            <>
              <span className="text-xs text-neutral-300">·</span>
              <span className="text-xs text-[var(--app-text-3)]">Dashboard:</span>
              {roleBadge(selfMembership.role)}
            </>
          )}
        </div>
      </div>

      {/* Nombre visible */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Nombre visible</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={viewer.email}
            maxLength={50}
            aria-label="Nombre visible"
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
            className="flex-1 rounded-xl border border-[var(--app-border-strong)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-4 py-2.5 text-sm font-medium text-[var(--app-strong-text)] hover:border-[var(--app-text-2)] disabled:opacity-50 w-full sm:w-auto"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar
          </button>
        </div>
        <p className="text-xs text-[var(--app-text-3)]">Lo ven otros miembros del dashboard.</p>
      </div>
    </SectionCard>
  );
}
