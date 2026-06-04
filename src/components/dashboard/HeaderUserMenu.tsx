import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, HelpCircle, Compass, Download, Sun, Moon } from 'lucide-react';
import { initialsFromEmail } from '../../services/labels';
import type { ThemeMode } from '../ThemeToggle';

/**
 * Header C avatar + dropdown. Concentrates email + identity + sign-out
 * behind an avatar so the header bar stays compact (no always-visible red button).
 * Click-outside + Escape close; ARIA menu semantics.
 */
export function HeaderUserMenu({
  email,
  identityLabel,
  photoUrl,
  theme,
  onToggleTheme,
  onSignOut,
  onOpenHelp,
  onReplayTour,
  onInstallApp,
}: {
  email: string;
  identityLabel: string;
  photoUrl?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onOpenHelp?: () => void;
  onReplayTour?: () => void;
  onInstallApp?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showInstallConfirm, setShowInstallConfirm] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cuenta: ${email}`}
        title={email}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] text-[var(--app-text-1)] text-xs font-bold active:scale-[0.94] transition"
      >
        {photoUrl && !imgError ? (
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          initialsFromEmail(email)
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menú de cuenta"
          className="anim-fade-in-down absolute right-0 top-11 z-50 w-64 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-2 shadow-[var(--app-shadow-md)]"
        >
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-[var(--app-text-1)] truncate">{email}</div>
            <div className="text-xs text-[var(--app-text-3)] truncate">{identityLabel}</div>
          </div>
          <div className="my-1 h-px bg-[var(--app-border)]" />
          <button
            role="menuitem"
            onClick={() => { onToggleTheme(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)] transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          </button>
          {onOpenHelp && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onOpenHelp(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)] transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
              Ayuda y comandos
            </button>
          )}
          {onReplayTour && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onReplayTour(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)] transition-colors"
            >
              <Compass className="h-4 w-4" />
              Ver recorrido de nuevo
            </button>
          )}
          {onInstallApp && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); setShowInstallConfirm(true); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)] transition-colors"
            >
              <Download className="h-4 w-4" />
              Instalar app
            </button>
          )}
          <div className="my-1 h-px bg-[var(--app-border)]" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--chart-expense)] hover:bg-[var(--app-red-surface)] dark:hover:bg-[var(--app-red-surface)]0/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}

      {showInstallConfirm && onInstallApp && createPortal(
        <div
          className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
          style={{ backgroundColor: 'color-mix(in srgb, var(--app-text-1) 42%, transparent)' }}
          onClick={() => setShowInstallConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="anim-scale-in w-full max-w-[400px] rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] p-6 shadow-[var(--app-shadow-md)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
                <Download className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-[var(--app-text-1)]">Instalar Caja Chica</h2>
            </div>
            <p className="mt-3 text-sm text-[var(--app-text-2)] leading-relaxed">
              Se agrega a tu pantalla de inicio y entrás más rápido, como cualquier app. En Android se
              instala sola; en iPhone te muestro los pasos.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => { setShowInstallConfirm(false); onInstallApp(); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] px-4 py-2.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
              >
                <Download className="h-4 w-4" />
                Instalar app
              </button>
              <button
                type="button"
                onClick={() => setShowInstallConfirm(false)}
                className="rounded-md border border-[var(--app-border)] px-4 py-2.5 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
