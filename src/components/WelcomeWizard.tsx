import { useEffect, useRef, useState } from 'react';
import { Sparkles, TrendingDown, MessageCircle, Download, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface WelcomeWizardProps {
  onFinish: () => void;
  /** True when the app can still be installed (not standalone, and Android prompt or iOS). */
  canInstall?: boolean;
  /** Triggers the install flow (native prompt on Android, manual instructions on iOS). */
  onInstall?: () => void;
}

type Step = 'hero' | 'linked';

// Activation-first onboarding: linking Telegram is the product's "aha" moment
// (load by talking to a bot), so it leads the screen instead of being an
// optional last step after a demo-data tour. Exploring with sample data is the
// secondary path, not the default.
export default function WelcomeWizard({ onFinish, canInstall = false, onInstall }: WelcomeWizardProps) {
  const [step, setStep] = useState<Step>('hero');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [finishing, setFinishing] = useState(false);
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
      // non-fatal — the user can retry or explore with sample data
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
      // non-fatal — wizard closes regardless
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
        aria-labelledby="wizard-title"
        tabIndex={-1}
        className="anim-scale-in bg-white dark:bg-[var(--app-strong-surface)] rounded-2xl shadow-2xl w-full max-w-md relative outline-none"
      >
        <button
          onClick={() => finish()}
          className="absolute top-4 right-4 z-10 text-[var(--app-text-3)] hover:text-[var(--app-text-2)] active:scale-[0.9] transition-transform duration-100"
          aria-label="Saltear bienvenida"
        >
          <X className="w-5 h-5" />
        </button>

        {step === 'hero' && (
          <div className="p-7 flex flex-col items-center text-center gap-5">
            <h2 id="wizard-title" className="text-2xl font-bold text-[var(--app-text-1)] dark:text-white">
              Cargá como hablás
            </h2>
            <p className="-mt-3 text-sm leading-relaxed text-[var(--app-text-3)]">
              Sin formularios. Le escribís (o mandás foto/audio) a un bot de Telegram y la IA lo registra.
            </p>

            {/* The "aha" moment: natural-language message → saved, categorized movement. */}
            <div className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
              <div className="mb-2.5 flex justify-end">
                <span className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--app-strong-surface)] px-3.5 py-2 text-sm text-[var(--app-strong-text)]">
                  gasté 5 lucas en nafta
                </span>
              </div>
              <div className="mb-2.5 flex items-center justify-center gap-1.5 text-xs text-[var(--app-text-3)]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> lo registró solo
              </div>
              <div className="flex items-center gap-2.5 rounded-md border border-[var(--app-border)] px-3 py-2.5 text-left">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-red-surface)] text-[var(--chart-expense)]">
                  <TrendingDown className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--app-text-1)]">Combustible</div>
                  <div className="text-xs text-[var(--app-text-3)]">Nafta · hoy</div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-[var(--chart-expense)]">−5.000</span>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2">
              <button
                onClick={() => void handleVincular()}
                disabled={loadingLink}
                className="w-full flex items-center justify-center gap-2 bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-strong-text)] font-bold py-3 px-6 rounded-md transition duration-150 disabled:opacity-50"
              >
                {loadingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Vincular Telegram
              </button>
              <button
                onClick={() => finish()}
                disabled={finishing}
                className="w-full py-2.5 px-4 rounded-md text-sm font-medium text-[var(--app-text-3)] hover:text-[var(--app-text-1)] transition disabled:opacity-50"
              >
                Explorar con datos de ejemplo
              </button>
            </div>

            <div className="w-full flex gap-2 pt-4 border-t border-[var(--app-border)] text-[var(--app-text-3)]">
              {([['Vinculás', MessageCircle], ['Escribís', Sparkles], ['Lo ves acá', TrendingDown]] as const).map(([label, Icon], i) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-[10px] leading-tight">{i + 1}. {label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'linked' && (
          <div className="p-7 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-sky-600 dark:text-sky-300" />
              </div>
              <div>
                <h2 id="wizard-title" className="font-bold text-[var(--app-text-1)] dark:text-white">Abrí Telegram y tocá Start</h2>
                <p className="text-sm text-[var(--app-text-3)]">Apenas lo hagas, ya podés cargar gastos por chat, foto o audio.</p>
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

            {canInstall && onInstall && (
              <button
                onClick={onInstall}
                disabled={finishing}
                className="w-full flex items-center justify-center gap-2 border border-[var(--app-border)] hover:border-[var(--app-text-2)] active:scale-[0.97] text-[var(--app-text-2)] font-medium py-3 px-4 rounded-md transition duration-150 text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Instalar como app
              </button>
            )}

            <button
              onClick={() => finish()}
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
