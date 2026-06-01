import { useState } from "react";
import { Bell, Loader2, SlidersHorizontal } from "lucide-react";
import { api, type AppViewer } from "../../../../services/api";
import { ThemeSelector, type ThemePreference } from "../../../ThemeToggle";
import type { Empresa } from "../../../../services/api";

const PREF_CURRENCY_KEY = "caja-chica:default-currency";
const PREF_EMPRESA_KEY = "caja-chica:default-empresa";

interface PreferenciasSectionProps {
  viewer: AppViewer;
  companies: Empresa[];
  themePreference: ThemePreference;
  onSetThemePreference: (p: ThemePreference) => void;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function PreferenciasSection({
  companies,
  themePreference,
  onSetThemePreference,
  showNotice,
  setError,
  viewer,
}: PreferenciasSectionProps) {
  const [defaultCurrency, setDefaultCurrencyState] = useState<"ARS" | "USD">(
    () => (window.localStorage.getItem(PREF_CURRENCY_KEY) === "USD" ? "USD" : "ARS"),
  );
  const [defaultEmpresa, setDefaultEmpresaState] = useState<string>(
    () => window.localStorage.getItem(PREF_EMPRESA_KEY) ?? "",
  );

  const [notifHour, setNotifHour] = useState(viewer.notification_hour ?? 21);
  const [notifMinute, setNotifMinute] = useState(viewer.notification_minute ?? 0);
  const [savingNotifHour, setSavingNotifHour] = useState(false);

  const setDefaultCurrency = (v: "ARS" | "USD") => {
    setDefaultCurrencyState(v);
    window.localStorage.setItem(PREF_CURRENCY_KEY, v);
  };

  const setDefaultEmpresa = (v: string) => {
    setDefaultEmpresaState(v);
    if (v) window.localStorage.setItem(PREF_EMPRESA_KEY, v);
    else window.localStorage.removeItem(PREF_EMPRESA_KEY);
  };

  const handleSaveNotif = async (h: number, m: number) => {
    setNotifHour(h);
    setNotifMinute(m);
    setSavingNotifHour(true);
    try {
      await api.updateMe({ notification_hour: h, notification_minute: m });
    } catch {
      setError("No se pudo guardar la hora.");
    } finally {
      setSavingNotifHour(false);
    }
  };

  return (
    <section className="bg-white dark:bg-[var(--app-strong-surface)] border border-[var(--app-border)] dark:border-neutral-700 rounded-xl p-6 md:p-8 shadow-sm stack-relaxed">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
          <SlidersHorizontal className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight dark:text-neutral-100">Preferencias</h2>
          <p className="text-sm text-[var(--app-text-3)]">Configuración personal del dashboard.</p>
        </div>
      </div>

      <div className="stack-comfort">
        {/* Tema */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Tema</p>
          <ThemeSelector preference={themePreference} onChange={onSetThemePreference} />
        </div>

        {/* Moneda default */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Moneda por defecto</p>
          <div className="flex gap-2" role="group" aria-label="Moneda por defecto">
            {(["ARS", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDefaultCurrency(c)}
                aria-pressed={defaultCurrency === c}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  defaultCurrency === c
                    ? "bg-[var(--app-strong-surface)] border-[var(--app-strong-surface)] text-[var(--app-strong-text)]"
                    : "bg-white border-[var(--app-border-strong)] text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--app-text-3)]">Se usa en el formulario de presupuesto.</p>
        </div>

        {/* Empresa default */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Empresa por defecto</p>
          <select
            value={defaultEmpresa}
            onChange={(e) => setDefaultEmpresa(e.target.value)}
            aria-label="Empresa por defecto"
            className="rounded-xl border border-[var(--app-border-strong)] dark:border-neutral-600 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)] bg-white dark:bg-[var(--app-strong-surface)] dark:text-neutral-100 w-full max-w-xs"
          >
            <option value="">Sin empresa (Personal)</option>
            {companies.filter((c) => !c.deleted_at).map((c) => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
          <p className="text-xs text-[var(--app-text-3)]">Se resalta en el selector de empresa al registrar un ticket.</p>
        </div>

        {/* Notification hour */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Hora del recordatorio</p>
            {savingNotifHour && <Loader2 className="w-3 h-3 animate-spin text-[var(--app-text-3)]" />}
          </div>
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-[var(--app-text-3)] shrink-0" />
            <div className="inline-flex items-center gap-0.5 rounded-md border border-[var(--app-border)] bg-white px-2 py-1.5 hover:border-[var(--app-text-2)] transition-colors">
              <select
                value={notifHour}
                onChange={(e) => void handleSaveNotif(Number(e.target.value), notifMinute)}
                aria-label="Hora del recordatorio"
                className="appearance-none bg-transparent text-center text-base font-mono font-semibold tabular-nums text-[var(--app-text-1)] outline-none cursor-pointer"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
                ))}
              </select>
              <span className="text-base font-mono font-semibold text-[var(--app-text-3)] leading-none">:</span>
              <select
                value={notifMinute}
                onChange={(e) => void handleSaveNotif(notifHour, Number(e.target.value))}
                aria-label="Minutos del recordatorio"
                className="appearance-none bg-transparent text-center text-base font-mono font-semibold tabular-nums text-[var(--app-text-1)] outline-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-[var(--app-text-3)]">hs (UTC)</span>
          </div>
          <p className="text-xs text-[var(--app-text-3)]">El bot te manda el recordatorio a esta hora (UTC). Actualmente el recordatorio llega por Telegram.</p>
        </div>
      </div>
    </section>
  );
}
