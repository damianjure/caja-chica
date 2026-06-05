import { useState } from "react";
import { Loader2, Mic, Camera, Send } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ThemeMode, ThemeToggle } from "./ThemeToggle";

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

interface LoginScreenProps {
  isLoading: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  buttonLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => Promise<void> | void;
  onLogin: () => Promise<void> | void;
  /** When true: user is logged into Google but that account has no app access. */
  blocked?: boolean;
}

export function LoginScreen({
  isLoading,
  theme,
  onToggleTheme,
  buttonLabel = "Continuar con Google",
  secondaryActionLabel,
  onSecondaryAction,
  onLogin,
  blocked = false,
}: LoginScreenProps) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="min-h-screen bg-[var(--app-surface-2)] text-[var(--app-text-1)] font-sans flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
      </div>
      <div className="w-full max-w-md">
        <div className="bg-white border border-[var(--app-border)] rounded-xl shadow-sm p-8 space-y-6">
          <div className="relative">
            <div className="flex flex-col items-center gap-3 text-center">
              <BrandMark
                variant="login"
                className="h-28 w-28 rounded-none drop-shadow-[0_12px_22px_rgba(0,0,0,0.20)]"
              />
              <h1 className="sr-only">Caja Chica</h1>
            </div>
          </div>

          {blocked ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-[var(--app-text-1)]">Esta cuenta de Google no tiene acceso.</p>
              <p className="text-[var(--app-text-2)]">
                La invitación es para otra dirección. Salí y entrá con la cuenta exacta
                con la que te invitaron.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-[var(--app-text-2)] text-center">
              <p>
                Registrá gastos e ingresos hablando normal.
                <br />
                <span className="text-[var(--app-text-3)]">"pagué 4500 de luz" y listo.</span>
              </p>
              <div className="flex items-center justify-center gap-5 text-xs text-[var(--app-text-3)] pointer-events-none select-none" aria-hidden="true">
                <span className="inline-flex items-center gap-1.5 opacity-60"><Send className="h-3.5 w-3.5 shrink-0" /> Telegram</span>
                <span className="inline-flex items-center gap-1.5 opacity-60"><Mic className="h-3.5 w-3.5 shrink-0" /> Voz</span>
                <span className="inline-flex items-center gap-1.5 opacity-60"><Camera className="h-3.5 w-3.5 shrink-0" /> Foto</span>
              </div>
            </div>
          )}

          <button
            onClick={() => void onLogin()}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-3 rounded-md bg-white border border-[var(--app-border-strong)] px-5 py-3 text-[var(--app-text-1)] font-medium hover:border-[var(--app-text-2)] disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ingresando...
              </>
            ) : (
              <>
                <GoogleIcon />
                {buttonLabel}
              </>
            )}
          </button>

          {!blocked && (
            <p className="text-center text-xs text-[var(--app-text-3)]">
              El acceso es solo por invitación.
            </p>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={() => void onSecondaryAction()}
              className="w-full inline-flex items-center justify-center gap-3 rounded-md border border-[var(--app-border)] px-5 py-3 text-[var(--app-text-2)] font-medium hover:border-[var(--app-text-2)] transition-colors"
            >
              {secondaryActionLabel}
            </button>
          )}

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
              className="text-xs text-[var(--app-text-3)] underline underline-offset-2 hover:text-[var(--app-text-1)]"
            >
              ¿Problemas para entrar?
            </button>
            {showHelp && (
              <div className="mt-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 text-left text-xs text-[var(--app-text-2)] leading-relaxed space-y-1.5">
                <p>· Entrá con el <strong>mismo email</strong> con el que te invitaron.</p>
                <p>· ¿No te invitaron todavía? Pedile al dueño del dashboard que te sume desde <em>Equipo</em>.</p>
                <p>· ¿Sigue sin andar? Escribinos a <a href="mailto:hola@damianjure.com" className="underline">hola@damianjure.com</a>.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
