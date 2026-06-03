import { Loader2 } from 'lucide-react';
import { BrandMark } from './BrandMark';

export function AppLoadingScreen({
  message = 'Cargando sesión...',
}: {
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--app-surface-2)] text-[var(--app-text-1)] font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-[var(--app-border)] rounded-xl shadow-sm p-8 flex flex-col items-center gap-6 text-center">
          <BrandMark
            variant="login"
            className="h-20 w-20 rounded-xl drop-shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
          />
          <div className="flex items-center gap-2.5 text-sm text-[var(--app-text-2)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--app-strong-surface)]" />
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}
