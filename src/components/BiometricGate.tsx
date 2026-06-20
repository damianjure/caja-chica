import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Fingerprint, Loader2, LogOut } from "lucide-react";
import { ThemeMode, ThemeToggle } from "./ThemeToggle";
import { isLockEnabled, needsUnlock, unlock, markActive } from "../lib/biometricLock";

interface BiometricGateProps {
  userId: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
  children: ReactNode;
}

export function BiometricGate({ userId, theme, onToggleTheme, onSignOut, children }: BiometricGateProps) {
  const [locked, setLocked] = useState(() => needsUnlock(userId));
  const [unlocking, setUnlocking] = useState(false);
  const [failed, setFailed] = useState(false);
  const triedAuto = useRef(false);

  const doUnlock = useCallback(async () => {
    setUnlocking(true);
    setFailed(false);
    try {
      const ok = await unlock(userId);
      if (ok) { setLocked(false); markActive(); }
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setUnlocking(false);
    }
  }, [userId]);

  // Auto-intento al quedar bloqueado (cold open / volver del background).
  useEffect(() => {
    if (locked && !triedAuto.current) {
      triedAuto.current = true;
      void doUnlock();
    }
    if (!locked) triedAuto.current = false;
  }, [locked, doUnlock]);

  // Background → guarda hora; volver → re-evalúa gracia.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        markActive();
      } else if (isLockEnabled(userId) && needsUnlock(userId)) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId]);

  if (!locked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[var(--app-surface-2)] text-[var(--app-text-1)] font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--app-surface-1)] border border-[var(--app-border)] rounded-xl shadow-[var(--app-shadow-sm)] p-8 text-center space-y-6">
          <div className="flex justify-end">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
          </div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
            <Fingerprint className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight">Caja Chica está bloqueada</h1>
            <p className="text-sm text-[var(--app-text-3)]">Desbloqueá con tu biometría para continuar.</p>
          </div>
          {failed && (
            <p className="text-sm text-[var(--chart-expense)]">No se pudo verificar. Probá de nuevo.</p>
          )}
          <button
            type="button"
            onClick={() => void doUnlock()}
            disabled={unlocking}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-5 py-3 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97] disabled:opacity-50 transition"
          >
            {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            Desbloquear
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[var(--app-border)] px-5 py-3 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Usar otra forma (cerrar sesión)
          </button>
        </div>
      </div>
    </div>
  );
}
