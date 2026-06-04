import React, { useState } from "react";
import { Loader2, Monitor, X } from "lucide-react";
import { api, type AppViewer, type UserSession } from "../../../../services/api";
import { SectionCard } from "../../primitives";

interface SessionRowProps {
  s: UserSession;
  isCurrent: boolean;
  revoking: boolean;
  onRevoke: (id: string) => void;
  [key: string]: unknown;
}

function SessionRow({ s, isCurrent, revoking, onRevoke }: SessionRowProps) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${isCurrent ? "border-[var(--app-border-strong)] bg-[var(--app-surface-1)]" : "border-[var(--app-border)]"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-medium text-[var(--app-text-2)] truncate">{s.user_agent ?? "Dispositivo desconocido"}</div>
          {isCurrent && (
            <span className="inline-flex items-center rounded-full bg-[var(--app-strong-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--app-strong-text)] shrink-0">
              Esta sesión
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--app-text-3)] mt-0.5">
          Iniciada {new Date(s.created_at).toLocaleString("es-AR")}
          {s.not_after && ` · Expira ${new Date(s.not_after).toLocaleString("es-AR")}`}
        </div>
      </div>
      <button
        onClick={() => onRevoke(s.id)}
        disabled={revoking || isCurrent}
        aria-label={isCurrent ? "No se puede cerrar la sesión activa" : "Cerrar esta sesión"}
        title={isCurrent ? "Usá Cerrar sesión para salir" : "Cerrar sesión"}
        className="p-1.5 rounded-xl border border-[var(--app-red-border)] text-[var(--chart-expense)] hover:border-red-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
      </button>
    </div>
  );
}

interface SesionesSectionProps {
  viewer: AppViewer;
  setError: (msg: string | null) => void;
  showNotice: (msg: string) => void;
}

export function SesionesSection({ viewer: _viewer, setError, showNotice }: SesionesSectionProps) {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const r = await api.getMySessionsList();
      setSessions(r.sessions);
      setCurrentSessionId(r.currentSessionId);
      setLoaded(true);
    } catch {
      setError("No se pudieron cargar las sesiones.");
    } finally {
      setLoading(false);
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

  const title = `Sesiones activas${loaded ? ` (${sessions.length})` : ""}`;

  return (
    <SectionCard title={title} description="Dispositivos con sesión abierta en tu cuenta.">
      {!loaded ? (
        <button
          onClick={() => void loadSessions()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-[var(--app-text-2)] hover:text-[var(--app-text-1)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
          {loading ? "Cargando..." : "Ver sesiones"}
        </button>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[var(--app-text-3)]">No hay sesiones activas.</p>
      ) : (
        <div className="space-y-2">
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
    </SectionCard>
  );
}
