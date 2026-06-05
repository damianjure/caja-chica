import { useState, useEffect } from "react";
import { Check, Loader2, Monitor, Trash2, X, MessageCircle } from "lucide-react";
import { api, type AppViewer, type DashboardMember, type UserSession } from "../../../../services/api";
import { toast } from "sonner";
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

interface SessionRowProps {
  s: UserSession; isCurrent: boolean; revoking: boolean; onRevoke: (id: string) => void;
  [key: string]: unknown;
}

function SessionRow({ s, isCurrent, revoking, onRevoke }: SessionRowProps) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${isCurrent ? "border-[var(--app-border-strong)] bg-[var(--app-surface-1)]" : "border-[var(--app-border)]"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[var(--app-text-2)] truncate">{s.user_agent ?? "Dispositivo desconocido"}</span>
          {isCurrent && (
            <span className="inline-flex items-center rounded-full bg-[var(--app-strong-surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-strong-text)] shrink-0">
              Esta sesión
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--app-text-3)] mt-0.5">
          Iniciada {new Date(s.created_at).toLocaleString("es-AR")}
        </div>
      </div>
      <button
        onClick={() => onRevoke(s.id)}
        disabled={revoking || isCurrent}
        title={isCurrent ? "Usá Cerrar sesión para salir" : "Cerrar sesión"}
        className="p-1 rounded-lg border border-[var(--app-red-border)] text-[var(--chart-expense)] hover:border-red-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
      </button>
    </div>
  );
}

interface Props {
  viewer: AppViewer;
  selfMembership: DashboardMember | null;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
  onDemoDeleted?: () => void;
}

export function CuentaIdentidadSection({ viewer, selfMembership, showNotice, setError, onDemoDeleted }: Props) {
  const [displayName, setDisplayName] = useState(viewer.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const [deletingDemo, setDeletingDemo] = useState(false);

  const handleDeleteDemo = async () => {
    setDeletingDemo(true);
    try {
      await api.deleteDemoData();
      toast.success("Datos de muestra eliminados.");
      onDemoDeleted?.();
    } catch {
      setError("No se pudieron eliminar los datos de muestra.");
    } finally {
      setDeletingDemo(false);
    }
  };

  const [telegramConnected, setTelegramConnected] = useState<boolean | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [linkingTelegram, setLinkingTelegram] = useState(false);

  useEffect(() => {
    let active = true;
    api.getBotConnection()
      .then((r) => { if (active) { setTelegramConnected(r.connected); setTelegramUsername(r.telegramUsername); } })
      .catch(() => { if (active) setTelegramConnected(false); });
    return () => { active = false; };
  }, []);

  const handleActivateTelegram = async () => {
    setLinkingTelegram(true);
    try {
      const res = await api.selfLinkTelegram();
      if (res.telegramDeepLink) {
        window.open(res.telegramDeepLink, '_blank', 'noopener');
        toast.success("Abrí Telegram y tocá Start.");
      } else {
        toast.success(`Enviá /start ${res.manualStartCode} al bot en Telegram.`);
      }
    } catch {
      toast.error("No se pudo generar el link de activación.");
    } finally {
      setLinkingTelegram(false);
    }
  };

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

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

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const r = await api.getMySessionsList();
      setSessions(r.sessions);
      setCurrentSessionId(r.currentSessionId);
      setSessionsLoaded(true);
    } catch {
      setError("No se pudieron cargar las sesiones.");
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await api.revokeMySession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showNotice("Sesión cerrada");
    } catch {
      setError("No se pudo cerrar la sesión.");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <SectionCard title="Cuenta" description="Identidad y sesiones activas.">
      {/* Email + roles — row compacto */}
      <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-[var(--app-text-1)]">{viewer.email}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-[var(--app-text-3)]">{viewer.role}</span>
          {selfMembership && (
            <>
              <span className="text-xs text-neutral-500">·</span>
              {roleBadge(selfMembership.role)}
            </>
          )}
        </div>
      </div>

      {/* Nombre visible — label inline + input + guardar en una fila */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--app-text-3)] shrink-0 w-24">Nombre visible</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={viewer.email}
          maxLength={50}
          aria-label="Nombre visible"
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
          className="flex-1 rounded-lg border border-[var(--app-border-strong)] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-3 py-1.5 text-sm font-medium text-[var(--app-strong-text)] hover:border-[var(--app-text-2)] disabled:opacity-50 shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Guardar
        </button>
      </div>

      {/* Demo data — solo si no está cleaned */}
      {viewer.onboarding_state !== 'cleaned' && (
        <div className="border-t border-[var(--app-border)] pt-3">
          <button
            type="button"
            onClick={() => void handleDeleteDemo()}
            disabled={deletingDemo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-red-border)] px-3 py-1.5 text-sm font-medium text-[var(--chart-expense)] hover:border-red-400 disabled:opacity-50 transition-colors"
          >
            {deletingDemo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Borrar datos de muestra
          </button>
        </div>
      )}

      {/* Bot de Telegram */}
      <div className="border-t border-[var(--app-border)] pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-[var(--app-text-3)]" />
            <span className="text-xs text-[var(--app-text-3)]">Bot de Telegram</span>
          </div>
          {telegramConnected === null ? (
            <Loader2 className="w-3 h-3 animate-spin text-[var(--app-text-3)]" />
          ) : telegramConnected ? (
            <div className="flex items-center gap-2">
              {telegramUsername && (
                <span className="text-xs font-medium text-[var(--app-text-2)]">@{telegramUsername}</span>
              )}
              <span className="inline-flex items-center rounded-full bg-[var(--app-green-surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-green-text)]">
                Conectado
              </span>
              <button
                type="button"
                onClick={() => void handleActivateTelegram()}
                disabled={linkingTelegram}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2.5 py-1 text-xs font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-50"
              >
                {linkingTelegram ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Reconectar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleActivateTelegram()}
              disabled={linkingTelegram}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 dark:bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 hover:border-sky-500 disabled:opacity-50"
            >
              {linkingTelegram ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
              Activar bot de Telegram
            </button>
          )}
        </div>
        {telegramConnected && (
          <p className="text-[10px] text-[var(--app-text-3)]">¿Cambiaste de teléfono? Reconectá para vincular tu nueva cuenta de Telegram.</p>
        )}
      </div>

      {/* Sesiones — divider + load on demand */}
      <div className="border-t border-[var(--app-border)] pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--app-text-3)]">
            Sesiones activas{sessionsLoaded ? ` (${sessions.length})` : ""}
          </span>
          {!sessionsLoaded && (
            <button
              onClick={() => void loadSessions()}
              disabled={loadingSessions}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--app-text-3)] hover:text-[var(--app-text-2)] disabled:opacity-50"
            >
              {loadingSessions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Monitor className="w-3 h-3" />}
              Ver sesiones
            </button>
          )}
        </div>
        {sessionsLoaded && (
          sessions.length === 0
            ? <p className="text-xs text-[var(--app-text-3)]">No hay sesiones activas.</p>
            : <div className="space-y-1.5">
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    s={s}
                    isCurrent={currentSessionId !== null && s.id === currentSessionId}
                    revoking={revoking === s.id}
                    onRevoke={(id) => void handleRevoke(id)}
                  />
                ))}
              </div>
        )}
      </div>
    </SectionCard>
  );
}
