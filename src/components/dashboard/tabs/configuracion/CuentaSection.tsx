import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isBiometricSupported, isLockEnabled, enableLock, disableLock } from "../../../../lib/biometricLock";
import {
  Check,
  Download,
  Fingerprint,
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

function statusDot(status: string) {
  if (status === "active") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--app-green-surface)]0" />;
  if (status === "pending") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />;
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300" />;
}

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

  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void isBiometricSupported().then((ok) => { if (active) setBioSupported(ok); });
    setBioEnabled(isLockEnabled(viewer.id));
    return () => { active = false; };
  }, [viewer.id]);

  const toggleBiometric = async () => {
    setBioBusy(true);
    try {
      if (bioEnabled) {
        disableLock(viewer.id);
        setBioEnabled(false);
        showNotice("Bloqueo biométrico desactivado.");
      } else {
        const ok = await enableLock(viewer.id, viewer.email);
        if (ok) { setBioEnabled(true); showNotice("Bloqueo biométrico activado en este dispositivo."); }
        else setError("No se pudo activar el bloqueo biométrico.");
      }
    } catch {
      setError("No se pudo activar el bloqueo biométrico.");
    } finally {
      setBioBusy(false);
    }
  };

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

  const handleExportData = async () => {
    try {
      await api.downloadMyExport();
    } catch {
      setError("No se pudo exportar los datos.");
    }
  };

  const [showBackup, setShowBackup] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = () => {
    // Sin Drive disponible → descarga directa, sin preguntar.
    if (canConnectDrive) setShowBackup(true);
    else void runBackup("local");
  };

  const runBackup = async (destination: "local" | "drive") => {
    setBackingUp(true);
    try {
      if (destination === "drive") {
        const { driveUrl } = await api.backupToDrive();
        showNotice("Backup guardado en Drive.");
        if (driveUrl) window.open(driveUrl, "_blank", "noopener");
      } else {
        await api.downloadBackup();
        showNotice("Backup descargado.");
      }
      setShowBackup(false);
    } catch {
      setError("No se pudo generar el backup.");
    } finally {
      setBackingUp(false);
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
      <section className="bg-white border border-[var(--app-border)] rounded-xl p-6 md:p-8 shadow-sm stack-relaxed">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Cuenta</h2>
            <p className="text-sm text-[var(--app-text-3)]">Sesión, integraciones y acceso.</p>
          </div>
        </div>

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
                {statusDot(selfMembership.status)}
              </>
            )}
          </div>
        </div>

        {/* Display name */}
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
              className="flex-1 rounded-xl border border-[var(--app-border-strong)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
            />
            <button
              type="button"
              onClick={() => void handleSaveDisplayName()}
              disabled={savingDisplayName}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-4 py-2.5 text-sm font-medium text-[var(--app-strong-text)] hover:border-[var(--app-text-2)] disabled:opacity-50 w-full sm:w-auto"
            >
              {savingDisplayName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar
            </button>
          </div>
          <p className="text-xs text-[var(--app-text-3)]">Lo ven otros miembros del dashboard.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => bioSupported && void toggleBiometric()}
            disabled={!bioSupported || bioBusy}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            aria-pressed={bioEnabled}
          >
            {bioBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4 text-[var(--app-text-3)]" />}
            <span className="flex-1 text-left">
              Bloqueo biométrico
              <span className="block text-xs text-[var(--app-text-3)]">
                {!bioSupported ? "Tu dispositivo no lo soporta" : bioEnabled ? "Activado en este dispositivo" : "Desbloqueá la app con Face ID / huella"}
              </span>
            </span>
            {bioSupported && (
              <span className={`shrink-0 inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${bioEnabled ? "bg-[var(--app-strong-surface)]" : "bg-[var(--app-surface-3)]"}`}>
                <span className={`h-4 w-4 rounded-full bg-white transition-transform ${bioEnabled ? "translate-x-4" : ""}`} />
              </span>
            )}
          </button>

          {(onboardingState === 'seeded' || onboardingState === 'pending') && (
            <button
              onClick={() => void handlePurgeDemo()}
              disabled={purgingDemo}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-amber-border)] px-4 py-3 text-sm font-medium text-amber-700 hover:border-amber-400 transition-colors disabled:opacity-50"
            >
              {purgingDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Limpiar datos de ejemplo
            </button>
          )}

          <button
            onClick={handleExportData}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm font-medium text-left text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors"
          >
            <Download className="w-4 h-4 shrink-0 text-[var(--app-text-3)]" />
            <span>
              Exportar mis datos (JSON)
              <span className="block text-xs font-normal text-[var(--app-text-3)]">Movimientos, empresas y categorías en formato estructurado.</span>
            </span>
          </button>

          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm font-medium text-left text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors disabled:opacity-50"
          >
            {backingUp ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Download className="w-4 h-4 shrink-0 text-[var(--app-text-3)]" />}
            <span>
              Descargar backup ZIP
              <span className="block text-xs font-normal text-[var(--app-text-3)]">Todos tus datos incluyendo configuración y adjuntos.</span>
            </span>
          </button>

          {isNonOwnerMember && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              disabled={leavingDashboard}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-red-border)] px-4 py-3 text-sm font-medium text-[var(--chart-expense)] hover:border-red-400 transition-colors disabled:opacity-50"
            >
              {leavingDashboard ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              Abandonar este dashboard
            </button>
          )}

          <button
            onClick={() => void onSignOut()}
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-text-2)] transition-colors"
          >
            <LogOut className="w-4 h-4 text-[var(--app-text-3)]" />
            Cerrar sesión
          </button>
        </div>

        {/* Active sessions */}
        <div className="space-y-3 border-t border-[var(--app-border)] pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">
              Sesiones activas{sessionsLoaded ? ` (${sessions.length})` : ""}
            </p>
            {!sessionsLoaded && (
              <button
                onClick={() => void loadSessions()}
                disabled={loadingSessions}
                className="text-xs text-[var(--app-text-3)] hover:text-[var(--app-text-2)] flex items-center gap-1"
              >
                {loadingSessions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Monitor className="w-3 h-3" />}
                Ver sesiones
              </button>
            )}
          </div>
          {sessionsLoaded && (
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-[var(--app-text-3)]">No hay sesiones activas.</p>
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
            className="w-full flex items-center gap-3 rounded-xl border border-[var(--app-red-border)] px-4 py-3 text-sm font-medium text-[var(--chart-expense)] hover:border-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Borrar mi cuenta
          </button>
          <p className="text-xs text-[var(--app-text-3)] mt-2 px-1">Esta acción es permanente e irreversible. Exportá tus datos antes.</p>
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

      {showBackup && createPortal(
        <div
          className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
          style={{ backgroundColor: "color-mix(in srgb, var(--app-text-1) 42%, transparent)" }}
          onClick={() => !backingUp && setShowBackup(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-modal-title"
            className="anim-scale-in w-full max-w-[400px] rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] shadow-[var(--app-shadow-md)] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="backup-modal-title" className="text-base font-bold text-[var(--app-text-1)]">¿Dónde guardás el backup?</h2>
            <p className="text-sm text-[var(--app-text-3)]">Un ZIP con tus movimientos, empresas y categorías.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void runBackup("drive")}
                disabled={backingUp}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-4 py-2.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97] disabled:opacity-50 transition"
              >
                {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Guardar en Drive
              </button>
              <button
                onClick={() => void runBackup("local")}
                disabled={backingUp}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--app-border-strong)] px-4 py-2.5 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-text-1)] disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Descargar al dispositivo
              </button>
              <button
                onClick={() => setShowBackup(false)}
                disabled={backingUp}
                className="text-xs text-[var(--app-text-3)] hover:text-[var(--app-text-1)] mt-1 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
