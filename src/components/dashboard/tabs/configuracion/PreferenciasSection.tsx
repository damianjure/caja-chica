import React, { useEffect, useState, type ReactNode } from "react";
import { Bell, Loader2, Mail, Moon, Send, SlidersHorizontal, Sun } from "lucide-react";
import { api, type AppViewer, type BotConnectionStatus } from "../../../../services/api";
import { type ThemePreference } from "../../../ThemeToggle";
import type { Empresa } from "../../../../services/api";
import { LIGHT_PALETTES, DARK_PALETTES, type PaletteOption } from "../../../../theme/palettes";

const PREF_CURRENCY_KEY = "caja-chica:default-currency";
const PREF_EMPRESA_KEY = "caja-chica:default-empresa";

interface PreferenciasSectionProps {
  viewer: AppViewer;
  companies: Empresa[];
  themePreference: ThemePreference;
  onSetThemePreference: (p: ThemePreference) => void;
  lightPalette: string;
  darkPalette: string;
  onSetLightPalette: (id: string) => void;
  onSetDarkPalette: (id: string) => void;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

function PaletteChip({ option, active, onClick }: { option: PaletteOption; active: boolean; onClick: () => void; key?: string | number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
        active ? "border-[var(--app-strong-surface)] bg-[color-mix(in_srgb,var(--app-strong-surface)_12%,var(--app-surface-1))]"
               : "border-[var(--app-border)] bg-[var(--app-surface-1)] hover:border-[var(--app-border-strong)]"}`}>
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: option.swatch }} />
      <span className="text-sm font-bold text-[var(--app-text-1)]">{option.label}</span>
    </button>
  );
}

function ChannelButton({
  active,
  disabled,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[58px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-[var(--app-strong-surface)] bg-[color-mix(in_srgb,var(--app-strong-surface)_12%,var(--app-surface-1))] text-[var(--app-text-1)]"
          : "border-[var(--app-border)] bg-[var(--app-surface-1)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
      }`}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]" : "bg-[var(--app-surface-2)] text-[var(--app-text-3)]"}`}>{icon}</span>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-[var(--app-text-3)]">{hint}</span>
      </span>
    </button>
  );
}

export function PreferenciasSection({
  companies,
  themePreference,
  onSetThemePreference,
  lightPalette,
  darkPalette,
  onSetLightPalette,
  onSetDarkPalette,
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

  const [notifEnabled, setNotifEnabled] = useState(viewer.notification_enabled ?? true);
  const [notifTelegram, setNotifTelegram] = useState(viewer.notification_telegram ?? true);
  const [notifEmail, setNotifEmail] = useState(viewer.notification_email ?? false);
  const [notifHour, setNotifHour] = useState(viewer.notification_hour ?? 21);
  const [notifMinute, setNotifMinute] = useState(viewer.notification_minute ?? 0);
  const [savingNotif, setSavingNotif] = useState(false);
  const [botStatus, setBotStatus] = useState<BotConnectionStatus | null>(null);

  const telegramConnected = botStatus?.connected === true;

  useEffect(() => {
    let mounted = true;
    api.getBotConnection()
      .then((status) => { if (mounted) setBotStatus(status); })
      .catch(() => { if (mounted) setBotStatus(null); });
    return () => { mounted = false; };
  }, []);

  const setDefaultCurrency = (v: "ARS" | "USD") => {
    setDefaultCurrencyState(v);
    window.localStorage.setItem(PREF_CURRENCY_KEY, v);
  };

  const setDefaultEmpresa = (v: string) => {
    setDefaultEmpresaState(v);
    if (v) window.localStorage.setItem(PREF_EMPRESA_KEY, v);
    else window.localStorage.removeItem(PREF_EMPRESA_KEY);
  };

  const saveNotif = async (next: Partial<{ enabled: boolean; telegram: boolean; email: boolean; hour: number; minute: number }>) => {
    const enabled = next.enabled ?? notifEnabled;
    const telegram = next.telegram ?? notifTelegram;
    const email = next.email ?? notifEmail;
    const hour = next.hour ?? notifHour;
    const minute = next.minute ?? notifMinute;

    if (enabled && !telegram && !email) {
      setError("Elegí al menos un canal o desactivá el recordatorio.");
      return;
    }

    setNotifEnabled(enabled);
    setNotifTelegram(telegram);
    setNotifEmail(email);
    setNotifHour(hour);
    setNotifMinute(minute);
    setSavingNotif(true);
    try {
      await api.updateMe({
        notification_enabled: enabled,
        notification_telegram: telegram,
        notification_email: email,
        notification_hour: hour,
        notification_minute: minute,
      });
      showNotice(enabled ? "Recordatorio actualizado." : "Recordatorio desactivado.");
    } catch {
      setError("No se pudo guardar el recordatorio.");
    } finally {
      setSavingNotif(false);
    }
  };

  return (
    <section className="bg-white border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)] stack-relaxed">
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
        {/* Apariencia — pares claro/oscuro por fila */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Apariencia</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0">
            <p className="text-[11px] font-semibold text-[var(--app-text-3)] flex items-center gap-1 mb-1"><Sun className="w-3 h-3" /> Claro</p>
            <p className="text-[11px] font-semibold text-[var(--app-text-3)] flex items-center gap-1 mb-1"><Moon className="w-3 h-3" /> Oscuro</p>
            {LIGHT_PALETTES.map((lp, i) => {
              const dp = DARK_PALETTES[i];
              const rowActive = lightPalette === lp.id || (dp && darkPalette === dp.id);
              return (
                <React.Fragment key={i}>
                  <div className={`mb-2 rounded-xl ${rowActive ? "ring-2 ring-[var(--app-strong-surface)] ring-offset-1" : ""}`}>
                    <PaletteChip option={lp} active={lightPalette === lp.id}
                      onClick={() => { onSetLightPalette(lp.id); onSetThemePreference("light"); }} />
                  </div>
                  {dp && (
                    <div className={`mb-2 rounded-xl ${rowActive ? "ring-2 ring-[var(--app-strong-surface)] ring-offset-1" : ""}`}>
                      <PaletteChip option={dp} active={darkPalette === dp.id}
                        onClick={() => { onSetDarkPalette(dp.id); onSetThemePreference("dark"); }} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <label className="mt-1 flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 cursor-pointer">
            <span className="text-sm text-[var(--app-text-2)]">Seguir el sistema<span className="block text-xs text-[var(--app-text-3)]">Cambia claro/oscuro según tu dispositivo</span></span>
            <input type="checkbox" checked={themePreference === "system"}
              onChange={(e) => onSetThemePreference(e.target.checked ? "system" : (themePreference !== "system" ? themePreference : "light"))} />
          </label>
        </div>

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
        </div>

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
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--app-text-3)] shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Recordatorio diario</p>
                <p className="text-xs text-[var(--app-text-3)]">Elegí si querés recibirlo y por dónde.</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifEnabled}
              onClick={() => void saveNotif({ enabled: !notifEnabled })}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-bold transition ${notifEnabled ? "border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]" : "border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text-3)]"}`}
            >
              {notifEnabled ? "Activado" : "Desactivado"}
            </button>
          </div>

          <div className={notifEnabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-45"} aria-disabled={!notifEnabled}>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChannelButton
                active={notifTelegram}
                disabled={!telegramConnected}
                icon={<Send className="h-4 w-4" />}
                label="Telegram"
                hint={telegramConnected ? "Llega al bot vinculado" : "Vinculá Telegram primero"}
                onClick={() => void saveNotif({ telegram: !notifTelegram })}
              />
              <ChannelButton
                active={notifEmail}
                icon={<Mail className="h-4 w-4" />}
                label="Mail"
                hint={viewer.email}
                onClick={() => void saveNotif({ email: !notifEmail })}
              />
            </div>

            <div className="flex items-center gap-2.5">
              <div className="inline-flex items-center gap-0.5 rounded-md border border-[var(--app-border)] bg-white px-2 py-1.5 hover:border-[var(--app-text-2)] transition-colors">
                <select
                  value={notifHour}
                  onChange={(e) => void saveNotif({ hour: Number(e.target.value) })}
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
                  onChange={(e) => void saveNotif({ minute: Number(e.target.value) })}
                  aria-label="Minutos del recordatorio"
                  className="appearance-none bg-transparent text-center text-base font-mono font-semibold tabular-nums text-[var(--app-text-1)] outline-none cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-[var(--app-text-3)]">hs (UTC)</span>
              {savingNotif && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--app-text-3)]" />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
