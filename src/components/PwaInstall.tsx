import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const DISMISS_KEY = "pwa_install_dismissed_at";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true;
}
function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const standalone = isStandalone();
  const ios = isIOS();

  useEffect(() => {
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [standalone]);

  useEffect(() => {
    if (standalone) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const fresh = Date.now() - dismissedAt > DISMISS_DAYS * 86_400_000;
    if (!fresh) return;
    // Android: cuando haya prompt nativo. iOS: siempre (no hay prompt).
    if (deferred || ios) {
      const t = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(t);
    }
  }, [deferred, ios, standalone]);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowBanner(false);
  }, []);

  const promptInstall = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setShowBanner(false);
    } else {
      // iOS o cualquier plataforma sin prompt nativo: mostrar instrucciones manuales
      setShowBanner(false);
      setShowIos(true);
    }
  }, [deferred]);

  return { available: !standalone && (!!deferred || ios), standalone, showBanner, dismissBanner, promptInstall, showIos, setShowIos, ios };
}

export function PwaInstallBanner({ pwa }: { pwa: ReturnType<typeof usePwaInstall> }) {
  return (
    <>
      {pwa.showBanner && (
        <div className="anim-fade-in-down fixed bottom-4 left-1/2 z-30 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] p-4 shadow-[var(--app-shadow-md)] glass-chrome sm:bottom-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
              <Download className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[var(--app-text-1)]">Instalá Caja Chica</div>
              <div className="text-xs text-[var(--app-text-3)]">Accedé más rápido desde tu pantalla de inicio.</div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void pwa.promptInstall()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
                >
                  Instalar app
                </button>
                <button
                  type="button"
                  onClick={pwa.dismissBanner}
                  className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
                >
                  Ahora no
                </button>
              </div>
            </div>
            <button type="button" onClick={pwa.dismissBanner} aria-label="Cerrar" className="text-[var(--app-text-3)] hover:text-[var(--app-text-1)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {pwa.showIos && createPortal(
        <div
          className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
          style={{ backgroundColor: "color-mix(in srgb, var(--app-text-1) 42%, transparent)" }}
          onClick={() => pwa.setShowIos(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="anim-scale-in w-full max-w-[400px] rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] p-6 shadow-[var(--app-shadow-md)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-[var(--app-text-1)]">Instalar en el celular</h2>
            <ol className="mt-3 space-y-2 text-sm text-[var(--app-text-2)]">
              <li className="flex items-start gap-2"><Share className="h-4 w-4 mt-0.5 shrink-0 text-[var(--app-text-3)]" /><span><strong>iPhone/iPad:</strong> tocá <strong>Compartir</strong> en Safari, luego <strong>"Agregar a inicio"</strong>.</span></li>
              <li>2. <strong>Android:</strong> tocá los 3 puntos del menú en Chrome, luego <strong>"Agregar a pantalla de inicio"</strong>.</li>
              <li>3. Confirmá y listo — aparece como app en tu pantalla.</li>
            </ol>
            <button
              type="button"
              onClick={() => pwa.setShowIos(false)}
              className="mt-5 w-full rounded-md bg-[var(--app-strong-surface)] px-4 py-2.5 text-sm font-bold text-[var(--app-strong-text)]"
            >
              Entendido
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
