import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { initialsFromEmail } from '../../services/labels';

/**
 * Header C avatar + dropdown. Concentrates email + identity + sign-out
 * behind an avatar so the header bar stays compact (no always-visible red button).
 * Click-outside + Escape close; ARIA menu semantics.
 */
export function HeaderUserMenu({
  email,
  identityLabel,
  onSignOut,
}: {
  email: string;
  identityLabel: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] text-xs font-bold active:scale-[0.94] transition"
      >
        {initialsFromEmail(email)}
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
            onClick={() => { setOpen(false); onSignOut(); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--chart-expense)] hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
