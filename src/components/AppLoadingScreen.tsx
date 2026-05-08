import { ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen bg-neutral-50 px-6 py-10 text-neutral-900 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-neutral-900 p-2.5 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Caja Chica</h1>
              <p className="text-xs text-neutral-500 mt-0.5">Dashboard financiero para operación real.</p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="h-3 w-40 animate-pulse rounded-full bg-neutral-200" />
            <div className="h-10 w-72 max-w-full animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-neutral-100" />
            <div className="h-4 w-64 max-w-full animate-pulse rounded-full bg-neutral-100" />
          </div>

          <div className="mt-8 flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
            <div>
              <div className="text-sm font-medium text-neutral-900">{message}</div>
              <div className="text-xs text-neutral-500">Preparamos tu acceso antes de mostrar datos.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
