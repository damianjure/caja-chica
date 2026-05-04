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
    <div className="min-h-screen bg-neutral-50 px-6 py-10 text-neutral-900">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm md:p-10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-neutral-900 p-3 text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Boteado</h1>
                <p className="text-sm text-neutral-500">Dashboard financiero para operación real.</p>
              </div>
              </div>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            </div>

            <div className="mt-8 space-y-4">
              <div className="h-3 w-40 animate-pulse rounded-full bg-neutral-200" />
              <div className="h-10 w-72 max-w-full animate-pulse rounded-2xl bg-neutral-200" />
              <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-neutral-100" />
              <div className="h-4 w-64 max-w-full animate-pulse rounded-full bg-neutral-100" />
            </div>

            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
              <div>
                <div className="text-sm font-medium text-neutral-900">{message}</div>
                <div className="text-xs text-neutral-500">Preparamos tu acceso y limpiamos el estado antes de mostrar datos.</div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm md:p-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-3xl border border-neutral-100 bg-neutral-50 p-5">
                  <div className="h-3 w-20 animate-pulse rounded-full bg-neutral-200" />
                  <div className="mt-4 h-8 w-28 animate-pulse rounded-2xl bg-neutral-200" />
                  <div className="mt-6 h-24 animate-pulse rounded-2xl bg-neutral-100" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
