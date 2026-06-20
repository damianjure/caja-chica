import { useEffect, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { api, type AiHealth } from "../services/api";

const STATUS_META: Record<AiHealth["status"], { label: string; cls: string }> = {
  ok: { label: "Saludable", cls: "bg-[var(--app-green-surface)] text-[var(--chart-income)] border-[var(--app-green-border)]" },
  warn: { label: "Atención", cls: "bg-[var(--app-amber-surface)] text-[var(--app-amber-text)] border-[var(--app-amber-border)]" },
  critical: { label: "Crítico", cls: "bg-[var(--app-red-surface)] text-[var(--chart-expense)] border-[var(--app-red-border)]" },
};

/**
 * Superadmin insight: are the Gemini models + fallback hitting their limits?
 * Shows fallback usage (primary key exhausted → fallback took over) and hard
 * failures (both keys exhausted → users saw "IA no disponible") over 24h / 7d.
 */
export function AiHealthCard() {
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getAiHealth().then(setHealth).catch(() => setHealth(null)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const meta = health ? STATUS_META[health.status] : null;

  return (
    <section className="bg-[var(--app-surface-1)] border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-6 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
          <Activity className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[var(--app-text-1)] tracking-tight">Salud IA</h2>
            {meta && <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>}
          </div>
          <p className="text-sm text-[var(--app-text-3)] mt-1.5 leading-relaxed max-w-prose">
            ¿Los modelos de Gemini y el fallback están pegando el límite? Mide cuántas veces la key primaria se agotó (y el fallback la salvó) y cuántas cayeron las dos.
          </p>
        </div>
        <button onClick={load} disabled={loading} aria-label="Actualizar" className="p-2 rounded-lg text-[var(--app-text-3)] hover:text-[var(--app-text-1)] disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </header>

      {!health ? (
        <p className="text-sm text-[var(--app-text-3)]">{loading ? "Cargando…" : "Sin datos (¿migración aplicada?)."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(["last24h", "last7d"] as const).map((period) => (
            <div key={period} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--app-text-3)] mb-2">
                {period === "last24h" ? "Últimas 24h" : "Últimos 7 días"}
              </p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--app-text-2)]">Fallback usado</span>
                <span className="text-lg font-semibold text-[var(--app-text-1)]">{health[period].fallback_used}</span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-sm text-[var(--app-text-2)]">Caídas duras</span>
                <span className={`text-lg font-semibold ${health[period].both_exhausted > 0 ? "text-[var(--chart-expense)]" : "text-[var(--app-text-1)]"}`}>
                  {health[period].both_exhausted}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--app-text-4)] mt-4 leading-snug">
        "Fallback usado" = la key primaria se agotó (429/503) y entró la de respaldo. "Caídas duras" = se agotaron las dos y el usuario vio "IA no disponible". La cuota restante real vive en Google Cloud, no acá.
      </p>
    </section>
  );
}
