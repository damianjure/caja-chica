import { useEffect, useRef, useState } from 'react';
import { Users, MessageCircle, X, Loader2 } from 'lucide-react';
import { api, type AppViewer } from '../services/api';

interface WelcomeJoinedProps {
  viewer: AppViewer;
  onFinish: () => void;
}

type Step = 'welcome' | 'linked';

// Joiners land on real shared data (no demo). Their activation is still linking
// Telegram — to load (editors) or consult (viewers) without opening the
// dashboard — so it leads as the primary action, not a buried "optional" step.
export default function WelcomeJoined({ viewer, onFinish }: WelcomeJoinedProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [finishing, setFinishing] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dialogRef.current?.focus(); }, []);

  const handleVincular = async () => {
    setLoadingLink(true);
    try {
      const res = await api.selfLinkTelegram();
      setDeepLink(res.telegramDeepLink ?? null);
      setManualCode(res.manualStartCode ?? null);
      if (res.telegramDeepLink) window.open(res.telegramDeepLink, '_blank', 'noopener');
    } catch {
      // non-fatal — the user can retry or go straight to the dashboard
    } finally {
      setLoadingLink(false);
      setStep('linked');
    }
  };

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
        <button
          onClick={finish}
          className="absolute top-4 right-4 z-10 text-[var(--app-text-3)] hover:text-[var(--app-text-2)] active:scale-[0.9] transition-transform duration-100"
          aria-label="Cerrar bienvenida"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'welcome' && (
          <div className="p-8 flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--app-strong-surface)] flex items-center justify-center">
              <Users className="w-8 h-8 text-[var(--app-strong-text)]" />
            </div>
            <div>
              <h2 id="joined-title" className="text-2xl font-bold text-[var(--app-text-1)] dark:text-white mb-2">
                Te sumaron a un dashboard compartido
              </h2>
              <p className="text-[var(--app-text-3)] text-sm leading-relaxed">
                {viewer.email && (
                  <>Hola <strong className="text-[var(--app-text-2)] dark:text-neutral-300">{viewer.email}</strong>. </>
                )}
                Compartís los movimientos con tu equipo. Sin datos de ejemplo: ya ves los reales.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => void handleVincular()}
                disabled={loadingLink}
                className="w-full flex items-center justify-center gap-2 bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-strong-text)] font-bold py-3 px-6 rounded-md transition duration-150 disabled:opacity-50"
              >
                {loadingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Vincular Telegram
              </button>
              <p className="text-xs text-[var(--app-text-3)]">Cargá o consultá tus números desde el bot, sin entrar al dashboard.</p>
              <button
                onClick={finish}
                disabled={finishing}
                className="mt-1 w-full py-2.5 px-6 rounded-md text-sm font-medium text-[var(--app-text-3)] hover:text-[var(--app-text-1)] transition disabled:opacity-50"
              >
                {finishing ? 'Cargando...' : 'Ir al dashboard'}
              </button>
            </div>
          </div>
        )}

        {step === 'linked' && (
          <div className="p-8 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-sky-600 dark:text-sky-300" />
              </div>
              <div>
                <h2 id="joined-title" className="font-bold text-[var(--app-text-1)] dark:text-white">Abrí Telegram y tocá Start</h2>
                <p className="text-sm text-[var(--app-text-3)]">Apenas lo hagas, cargás y consultás desde el chat.</p>
              </div>
            </div>

            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-sky-500 border border-sky-500 hover:border-sky-300 active:scale-[0.97] text-white font-medium py-3 px-6 rounded-md transition duration-150 text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Abrir bot en Telegram
              </a>
            )}

            {!deepLink && manualCode && (
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4 text-sm text-[var(--app-text-2)]">
                Enviá <code className="font-mono font-semibold text-[var(--app-text-1)]">/start {manualCode}</code> al bot en Telegram.
              </div>
            )}

            {!deepLink && !manualCode && (
              <p className="text-sm text-[var(--app-text-3)]">
                No pudimos generar el link ahora. Podés vincular Telegram más tarde desde Configuración.
              </p>
            )}

            <button
              onClick={finish}
              disabled={finishing}
              className="w-full flex items-center justify-center gap-2 bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-strong-text)] font-medium py-3 px-4 rounded-md transition duration-150 text-sm disabled:opacity-50"
            >
              {finishing ? 'Cargando...' : 'Listo, ir al dashboard'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
