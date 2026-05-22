import { useState } from 'react';
import { motion } from 'motion/react';
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md relative"
      >
        {/* Skip button */}
        <button
          onClick={finish}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 active:scale-[0.9] transition-transform duration-100"
          aria-label="Cerrar bienvenida"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <div className="p-8 flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
              <Users className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                Te sumaron a un dashboard compartido
              </h2>
              <p className="text-neutral-500 text-sm leading-relaxed">
                {viewer.email && (
                  <>Hola <strong className="text-neutral-700 dark:text-neutral-300">{viewer.email}</strong>. </>
                )}
                Te sumaron al dashboard de otra persona. Compartís los mismos movimientos. Sin datos de ejemplo: vas directo a los datos reales.
              </p>
            </div>
            {telegramDeepLink ? (
              <button
                onClick={() => setStep('telegram')}
                className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.97] text-white font-medium py-3 px-6 rounded-md transition duration-150"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={finishing}
                className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.97] text-white font-medium py-3 px-6 rounded-md transition duration-150 disabled:opacity-50"
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
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white">Sumar Telegram</h3>
                <p className="text-sm text-neutral-500">
                  Te sumaron también al bot. Podés activarlo ahora o más tarde.
                </p>
              </div>
            </div>

            {telegramDeepLink && (
              <a
                href={telegramDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 active:scale-[0.97] text-white font-medium py-3 px-6 rounded-md transition duration-150 text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Abrir bot en Telegram
              </a>
            )}

            <button
              onClick={finish}
              disabled={finishing}
              className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 active:scale-[0.97] text-white font-medium py-3 px-4 rounded-md transition duration-150 text-sm disabled:opacity-50"
            >
              {finishing ? 'Cargando...' : 'Ir al dashboard'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
