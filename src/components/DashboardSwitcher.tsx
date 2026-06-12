import { useState, useEffect, useRef } from "react";
import { Briefcase, Check, ChevronDown, Loader2, Plus, User } from "lucide-react";
import { api, type UserDashboard } from "../services/api";

/**
 * Header switcher between the user's dashboards (personal vs pyme). Switching
 * persists server-side (active_dashboard_id) then reloads so the whole app
 * re-scopes. Owners can create a pyme inline (name + CUIT). Renders nothing
 * until the user has >1 dashboard or can create one.
 */
export function DashboardSwitcher() {
  const [dashboards, setDashboards] = useState<UserDashboard[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [cuit, setCuit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDashboards().then((r) => setDashboards(r.dashboards)).catch(() => setDashboards([]));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // The active dashboard isn't returned per-row; the backend resolves it, so we
  // just show all and switch on click. Hide the control if there's nothing to switch.
  if (dashboards.length <= 1 && !open) {
    // Still allow opening to create the first pyme.
  }

  const handleSwitch = async (id: string) => {
    setBusy(true);
    try {
      await api.setActiveDashboard(id);
      window.location.reload();
    } catch {
      setBusy(false);
      setError("No pude cambiar de dashboard.");
    }
  };

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const { dashboardId } = await api.createPymeDashboard(name.trim(), cuit.trim());
      await api.setActiveDashboard(dashboardId);
      window.location.reload();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error && /cuit/i.test(err.message) ? "CUIT inválido (11 dígitos)." : "No pude crear la PyME.");
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-1.5 text-sm text-[var(--app-text-1)] hover:border-[var(--app-text-2)]"
        aria-label="Cambiar de dashboard"
      >
        <Briefcase className="h-4 w-4 text-[var(--app-text-3)]" aria-hidden="true" />
        <span className="max-w-[140px] truncate">Dashboards</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--app-text-3)]" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.3)]">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--app-text-3)]">Mis dashboards</p>
          <div className="space-y-0.5">
            {dashboards.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={busy}
                onClick={() => void handleSwitch(d.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--app-text-1)] hover:bg-[var(--app-surface-3)] disabled:opacity-50"
              >
                {d.type === "pyme" ? <Briefcase className="h-4 w-4 text-[var(--app-text-3)]" /> : <User className="h-4 w-4 text-[var(--app-text-3)]" />}
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="shrink-0 rounded-full bg-[var(--app-surface-1)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-text-3)]">
                  {d.type === "pyme" ? "PyME" : "Personal"}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-2 border-t border-[var(--app-border)] pt-2">
            {creating ? (
              <div className="space-y-2 px-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre de la PyME"
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-3)] px-2 py-1.5 text-sm text-[var(--app-text-1)]"
                />
                <input
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                  placeholder="CUIT (11 dígitos)"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-3)] px-2 py-1.5 text-sm text-[var(--app-text-1)]"
                />
                {error && <p className="text-xs text-[var(--chart-expense)]">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !name.trim() || !cuit.trim()}
                    onClick={() => void handleCreate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--app-strong-surface)] px-3 py-1.5 text-xs font-medium text-[var(--app-strong-text)] disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Crear
                  </button>
                  <button type="button" onClick={() => { setCreating(false); setError(null); }} className="rounded-lg px-3 py-1.5 text-xs text-[var(--app-text-3)]">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-[var(--app-text-2)] hover:bg-[var(--app-surface-3)]"
              >
                <Plus className="h-4 w-4" /> Crear dashboard PyME
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
