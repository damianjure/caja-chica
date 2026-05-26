import React, { useState } from "react";
import {
  Check,
  Download,
  HardDrive,
  Loader2,
  LogOut,
  Monitor,
  Settings,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import {
  api,
  type AppViewer,
  type DashboardMember,
  type OnboardingState,
  type UserSession,
} from "../../../../services/api";
import { ConfirmModal } from "../../../ui/ConfirmModal";

interface SessionRowProps {
  key?: React.Key;
  s: UserSession;
  isCurrent: boolean;
  revoking: boolean;
  onRevoke: (id: string) => void;
}

function SessionRow({ s, isCurrent, revoking, onRevoke }: SessionRowProps) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${isCurrent ? "border-neutral-400 bg-neutral-50" : "border-neutral-200"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-medium text-neutral-700 truncate">{s.user_agent ?? "Dispositivo desconocido"}</div>
          {isCurrent && (
            <span className="inline-flex items-center rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-white shrink-0">
              Esta sesión
            </span>
          )}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">
          Iniciada {new Date(s.created_at).toLocaleString("es-AR")}
          {s.not_after && ` · Expira ${new Date(s.not_after).toLocaleString("es-AR")}`}
        </div>
      </div>
      <button
        onClick={() => onRevoke(s.id)}
        disabled={revoking || isCurrent}
        aria-label={isCurrent ? "No se puede cerrar la sesión activa" : "Cerrar esta sesión"}
        title={isCurrent ? "Usá Cerrar sesión para salir" : "Cerrar sesión"}
        className="p-1.5 rounded-xl border border-red-200 text-red-500 hover:border-red-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
      </button>
    </div>
  );
}

function statusDot(status: string) {
  if (status === "active") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />;
  if (status === "pending") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />;
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300" />;
}

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    owner: "bg-neutral-900 text-white",
    editor: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    viewer: "bg-neutral-100 text-neutral-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[role] ?? "bg-neutral-100 text-neutral-500"}`}>
      {role}
    </span>
  );
}

interface CuentaSectionProps {
  viewer: AppViewer;
  selfMembership: DashboardMember | null;
  isNonOwnerMember: boolean;
  canConnectDrive: boolean;
  onSignOut: () => Promise<void> | void;
  onDisconnectDrive?: () => Promise<void>;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function CuentaSection({
  viewer,
  selfMembership,
  isNonOwnerMember,
  canConnectDrive,
  onSignOut,
  onDisconnectDrive,
  showNotice,
  setError,
}: CuentaSectionProps) {
  const [displayName, setDisplayName] = useState(viewer.display_name ?? "");
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  const [onboardingState, setOnboardingState] = useState<OnboardingState>(viewer.onboarding_state ?? 'completed');
  const [purgingDemo, setPurgingDemo] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leavingDashboard, setLeavingDashboard] = useState(false);

  const handleSaveDisplayName = async () => {
    setSavingDisplayName(true);
    try {
      await api.updateMe({ display_name: displayName.trim() || null });
      showNotice("Nombre guardado");
    } catch {
      setError("No se pudo guardar el nombre.");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleExportData = () => {
    window.open(api.getExportUrl(), "_blank");
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

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await api.revokeMySession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showNotice("Sesión cerrada");
    } catch {
      setError("No se pudo cerrar la sesión.");
    } finally {
      setRevokingSession(null);
    }
  };

  const handleDeleteAccount = async () => {
    await api.deleteMyAccount();
    await onSignOut();
  };

  const handlePurgeDemo = async () => {
    setPurgingDemo(true);
    try {
      await api.deleteDemoData();
      setOnboardingState('cleaned');
      showNotice('Datos de ejemplo eliminados.');
    } catch {
      setError('No se pudo eliminar los datos de ejemplo.');
    } finally {
      setPurgingDemo(false);
    }
  };

  const handleLeaveDashboard = async () => {
    setLeavingDashboard(true);
    setShowLeaveConfirm(false);
    try {
      await api.leaveDashboard();
      showNotice("Abandonaste el dashboard. Cerrando sesión...");
      setTimeout(() => void onSignOut(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abandonar el dashboard.");
      setLeavingDashboard(false);
    }
  };

  return (
    <>
      <section className="bg-white border border-neutral-200 rounded-xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-neutral-900 text-white">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cuenta</h2>
            <p className="text-sm text-neutral-500">Sesión, integraciones y acceso.</p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-1">
          <div className="text-sm font-medium text-neutral-900">{viewer.email}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-500">Rol de app:</span>
            <span className="text-xs font-medium text-neutral-700">{viewer.role}</span>
            {selfMembership && (
              <>
                <span className="text-xs text-neutral-300">·</span>
                <span className="text-xs text-neutral-500">Dashboard:</span>
                {roleBadge(selfMembership.role)}
                {statusDot(selfMembership.status)}
              </>
            )}
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Nombre visible</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={viewer.email}
              maxLength={50}
              aria-label="Nombre visible"
              className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <button
              type="button"
              onClick={() => void handleSaveDisplayName()}
              disabled={savingDisplayName}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 border border-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:border-[var(--app-text-2)] disabled:opacity-50"
            >
              {savingDisplayName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
          <p className="text-xs text-neutral-500">Lo ven otros miembros del dashboard.</p>
        </div>

        <div className="space-y-3">
          {canConnectDrive && onDisconnectDrive && (
            <button
              onClick={() => void onDisconnectDrive()}
              className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:border-[var(--app-text-2)] transition-colors"
            >
              <HardDrive className="w-4 h-4 text-neutral-500" />
              Desconectar Google Drive
            </button>
          )}

          {(onboardingState === 'seeded' || onboardingState === 'pending') && (
            <button
              onClick={() => void handlePurgeDemo()}
              disabled={purgingDemo}
              className="w-full flex items-center gap-3 rounded-xl border border-amber-200 px-4 py-3 text-sm font-medium text-amber-700 hover:border-amber-400 transition-colors disabled:opacity-50"
            >
              {purgingDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Limpiar datos de ejemplo
            </button>
          )}

          <button
            onClick={handleExportData}
            className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:border-[var(--app-text-2)] transition-colors"
          >
            <Download className="w-4 h-4 text-neutral-500" />
            Exportar mis datos (JSON)
          </button>

          {isNonOwnerMember && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              disabled={leavingDashboard}
              className="w-full flex items-center gap-3 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:border-red-400 transition-colors disabled:opacity-50"
            >
              {leavingDashboard ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              Abandonar este dashboard
            </button>
          )}

          <button
            onClick={() => void onSignOut()}
            className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:border-[var(--app-text-2)] transition-colors"
          >
            <LogOut className="w-4 h-4 text-neutral-500" />
            Cerrar sesión
          </button>
        </div>

        {/* Active sessions */}
        <div className="space-y-3 border-t border-neutral-200 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Sesiones activas</p>
            {!sessionsLoaded && (
              <button
                onClick={() => void loadSessions()}
                disabled={loadingSessions}
                className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
              >
                {loadingSessions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Monitor className="w-3 h-3" />}
                Ver sesiones
              </button>
            )}
          </div>
          {sessionsLoaded && (
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-neutral-500">No hay sesiones activas.</p>
              ) : (
                sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    s={s}
                    isCurrent={currentSessionId !== null && s.id === currentSessionId}
                    revoking={revokingSession === s.id}
                    onRevoke={(id) => void handleRevokeSession(id)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Delete account */}
        <div className="border-t border-red-100 pt-4">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:border-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Borrar mi cuenta
          </button>
          <p className="text-xs text-neutral-500 mt-2 px-1">Esta acción es permanente e irreversible. Exportá tus datos antes.</p>
        </div>
      </section>

      {showLeaveConfirm && (
        <ConfirmModal
          title="Abandonar dashboard"
          description="Vas a salir de este dashboard compartido. Se revocará tu acceso y se cerrará tu sesión."
          confirmLabel="Abandonar"
          tone="danger"
          onConfirm={async () => {
            await handleLeaveDashboard();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Borrar mi cuenta"
          description={`Vas a eliminar permanentemente tu cuenta (${viewer.email}). Se borrarán tus datos y no podrás recuperarlos. Escribí tu email para confirmar.`}
          confirmLabel="Borrar cuenta"
          tone="danger"
          requireText={viewer.email}
          onConfirm={async () => {
            setShowDeleteConfirm(false);
            await handleDeleteAccount();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
