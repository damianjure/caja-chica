import { Loader2 } from 'lucide-react';
import { BrandMark } from './BrandMark';

export function AppLoadingScreen({
  message = 'Cargando sesión...',
}: {
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--app-surface-2)] text-[var(--app-text-1)] font-sans flex items-center justify-center p-4">
      <div className="anim-fade-in flex flex-col items-center gap-8">
        <BrandMark
          variant="login"
          className="anim-breathe h-24 w-24 rounded-2xl drop-shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
        />
        <div className="flex items-center gap-2.5 text-sm text-[var(--app-text-2)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--app-strong-surface)]" />
          {message}
        </div>
      </div>
    </div>
  );
}
