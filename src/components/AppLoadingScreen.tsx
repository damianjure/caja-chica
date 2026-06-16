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
        <div className="text-sm text-[var(--app-text-2)]">
          {message}
        </div>
      </div>
    </div>
  );
}
