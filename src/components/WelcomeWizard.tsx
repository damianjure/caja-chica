import { useState } from 'react';
import { Sparkles, BarChart2, Trash2, ChevronRight, MessageCircle, X } from 'lucide-react';
import { api } from '../services/api';

interface WelcomeWizardProps {
  onFinish: (cleanDemo: boolean) => void;
}

type Step = 'welcome' | 'tour' | 'telegram' | 'finish';

export default function WelcomeWizard({ onFinish }: WelcomeWizardProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const loadTelegramLink = async () => {
    if (deepLink) return;
    setLoadingLink(true);
    try {
      const res = await api.getBotConnection();
      setDeepLink(res.telegramDeepLink ?? null);
    } catch {
      // non-fatal — user can skip
    } finally {
      setLoadingLink(false);
    }
  };

  const finish = async (cleanDemo: boolean) => {
    setFinishing(true);
    try {
      if (cleanDemo) await api.deleteDemoData();
      await api.updateMe({ onboarding_state: 'completed' });
    } catch {
      // non-fatal — wizard closes regardless
    } finally {
      onFinish(cleanDemo);
    }
  };

  return (
    <div className="anim-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="anim-scale-in bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md relative">

        {/* Skip button */}
        <button
          onClick={() => finish(false)}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 active:scale-[0.9] transition-transform duration-100"
          aria-label="Saltear bienvenida"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Progress */}
        <div className="absolute top-5 left-6 flex gap-1.5">
          {(['welcome', 'tour', 'telegram'] as Step[]).map((s) => (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all ${s === step ? 'w-5 bg-neutral-900' : 'w-1.5 bg-neutral-200'}`}
            />
          ))}
        </div>

        {/* Welcome */}
        {step === 'welcome' && (
          <div className="p-8 flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                Bienvenido a Caja Chica
              </h2>
              <p className="text-neutral-500 text-sm leading-relaxed">
                Tu cuenta está lista. Cargamos datos de ejemplo para que veas cómo funciona todo antes de empezar con los datos reales.
              </p>
            </div>
            <button
              onClick={() => setStep('tour')}
              className="w-full flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-900 hover:border-[var(--app-text-2)] active:scale-[0.97] text-white font-medium py-3 px-6 rounded-md transition duration-150"
            >
              Ver el tour <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tour */}
        {step === 'tour' && (
          <div className="p-8 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <BarChart2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white">Datos de ejemplo cargados</h3>
                <p className="text-sm text-neutral-500">
                  Empresa Demo SA con 10 movimientos de los últimos 30 días en ARS. Explorá todas las tabs.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200 dark:border-amber-800">
              <Trash2 className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Cuando quieras empezar de verdad, podés borrar los datos de ejemplo con un solo botón en Configuración → Cuenta.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { void loadTelegramLink(); setStep('telegram'); }}
                className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-900 hover:border-[var(--app-text-2)] active:scale-[0.97] text-white font-medium py-3 px-4 rounded-md transition duration-150 text-sm"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Telegram */}
        {step === 'telegram' && (
          <div className="p-8 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white">Conectar Telegram</h3>
                <p className="text-sm text-neutral-500">
                  Cargá movimientos y consultá saldos desde el bot. Opcional, podés hacerlo después.
                </p>
              </div>
            </div>

            {loadingLink && (
              <p className="text-sm text-neutral-400 text-center">Generando link...</p>
            )}

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

            <button
              onClick={() => finish(false)}
              disabled={finishing}
              className="w-full flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-900 hover:border-[var(--app-text-2)] active:scale-[0.97] text-white font-medium py-3 px-4 rounded-md transition duration-150 text-sm disabled:opacity-50"
            >
              {finishing ? 'Cargando...' : 'Ir al dashboard'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
