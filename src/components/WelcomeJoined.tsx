import { useEffect, useRef, useState } from 'react';
import { Users, MessageCircle, ChevronRight, X } from 'lucide-react';
import { api, type AppViewer } from '../services/api';

interface WelcomeJoinedProps {
  viewer: AppViewer;
  telegramDeepLink?: string;
  onFinish: () => void;
}

type Step = 'welcome' | 'telegram';

export default function WelcomeJoined({ viewer, telegramDeepLink, onFinish }: WelcomeJoinedProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [finishing, setFinishing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  const finish = async () => {
    setFinishing(true);
    try {
      await api.updateMe({ onboarding_state: 'completed' });
    } catch {
      // non-fatal
    } finally {
      onFinish();
    }
  };

  return (
    <div
      className="anim-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onKeyDown={(e) => { if (e.key === 'Escape' && !finishing) void finish(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="joined-title"
        tabIndex={-1}
        className="anim-scale-in bg-white dark:bg-[var(--app-strong-surface)] rounded-2xl shadow-2xl w-full max-w-md relative outline-none"
      >
        {/* Skip button */}
        <button
          onClick={finish}
          className="absolute top-4 right-4 text-[var(--app-text-3)] hover:text-[var(--app-text-2)] active:scale-[0.9] transition-transform duration-100"
          aria-label="Cerrar bienvenida"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="p-8 flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--app-strong-surface)] flex items-center justify-center">
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 id="joined-title" className="text-2xl font-bold text-[var(--app-text-1)] dark:text-white mb-2">
                Te sumaron a un dashboard compartido
              </h2>
              <p className="text-[var(--app-text-3)] text-sm leading-relaxed">
                {viewer.email && (
                  <>Hola <strong className="text-[var(--app-text-2)] dark:text-neutral-300">{viewer.email}</strong>. </>
                )}
                Te sumaron al dashboard de otra persona. Compartís los mismos movimientos. Sin datos de ejemplo: vas directo a los datos reales.
              </p>
            </div>
            {telegramDeepLink ? (
              <button
                onClick={() => setStep('telegram')}
                className="w-full flex items-center justify-center gap-2 bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-strong-text)] font-medium py-3 px-6 rounded-md transition duration-150"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={finishing}
                className="w-full flex items-center justify-center gap-2 bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-strong-text)] font-medium py-3 px-6 rounded-md transition duration-150 disabled:opacity-50"
              >
                {finishing ? 'Cargando...' : 'Ir al dashboard'}
              </button>
            )}
          </div>
        )}

        {/* Step 2: Telegram (only shown when telegramDeepLink present) */}
        {step === 'telegram' && (
          <div className="p-8 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--app-strong-surface)] flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--app-text-1)] dark:text-white">Sumar Telegram</h3>
                <p className="text-sm text-[var(--app-text-3)]">
                  Te sumaron también al bot. Podés activarlo ahora o más tarde.
                </p>
              </div>
            </div>

            {telegramDeepLink && (
              <a
                href={telegramDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-sky-500 border border-sky-500 hover:border-sky-300 active:scale-[0.97] text-white font-medium py-3 px-6 rounded-md transition duration-150 text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Abrir bot en Telegram
              </a>
            )}

            <button
              onClick={finish}
              disabled={finishing}
              className="w-full flex items-center justify-center gap-2 bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-strong-text)] font-medium py-3 px-4 rounded-md transition duration-150 text-sm disabled:opacity-50"
            >
              {finishing ? 'Cargando...' : 'Ir al dashboard'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
