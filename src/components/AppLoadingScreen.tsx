import { BrandMark } from './BrandMark';
import { ThemeMode, ThemeToggle } from './ThemeToggle';

export function AppLoadingScreen({
  message = 'Cargando sesión...',
  theme,
  onToggleTheme,
}: {
  message?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--app-surface-2)] px-6 py-10 text-[var(--app-text-1)] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <BrandMark className="shadow-[var(--app-shadow-sm)]" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Caja Chica</h1>
              <p className="text-xs text-[var(--app-text-3)] mt-0.5">Dashboard financiero para operación real.</p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="h-3 w-40 animate-pulse rounded-full bg-neutral-200" />
            <div className="h-10 w-72 max-w-full animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-[var(--app-surface-2)]" />
            <div className="h-4 w-64 max-w-full animate-pulse rounded-full bg-[var(--app-surface-2)]" />
          </div>

          <div className="mt-8 flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--app-border-strong)] border-t-[var(--app-strong-surface)]" />
            <div>
              <div className="text-sm font-medium text-[var(--app-text-1)]">{message}</div>
              <div className="text-xs text-[var(--app-text-3)]">Preparamos tu acceso antes de mostrar datos.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
