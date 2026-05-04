import { Loader2, ShieldCheck } from "lucide-react";
import { ThemeMode, ThemeToggle } from "./ThemeToggle";

interface LoginScreenProps {
  isLoading: boolean;
  error: string | null;
  notice?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  buttonLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => Promise<void> | void;
  onLogin: () => Promise<void> | void;
}

export function LoginScreen({
  isLoading,
  error,
  notice,
  theme,
  onToggleTheme,
  buttonLabel = "Entrar con Google",
  secondaryActionLabel,
  onSecondaryAction,
  onLogin,
}: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-6 md:p-10">
      <div className="mx-auto max-w-5xl pt-10 md:pt-16">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-white border border-neutral-200 rounded-3xl shadow-sm p-8 md:p-10 space-y-6">
            <div className="flex items-start justify-between gap-4 text-neutral-900">
              <div className="flex items-center gap-3">
              <div className="p-3 bg-neutral-900 text-white rounded-2xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Boteado</h1>
                <p className="text-sm text-neutral-500">
                  Acceso privado con Google para usuarios autorizados.
                </p>
              </div>
              </div>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            </div>

            <div className="space-y-3 text-sm text-neutral-600">
              <p>
                Esta aplicación usa autenticación con Google, pero el acceso está
                restringido a usuarios invitados por el administrador.
              </p>
              <p>
                Si tu cuenta todavía no fue autorizada, vas a ver un rechazo
                después del login. Eso es esperado.
              </p>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                {notice}
              </div>
            )}

            <button
              onClick={() => void onLogin()}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-neutral-900 px-5 py-3 text-white font-medium hover:bg-neutral-800 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                <>{buttonLabel}</>
              )}
            </button>

            {secondaryActionLabel && onSecondaryAction && (
              <button
                onClick={() => void onSecondaryAction()}
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-neutral-200 px-5 py-3 text-neutral-700 font-medium hover:bg-neutral-50"
              >
                {secondaryActionLabel}
              </button>
            )}
          </div>

          <div className="bg-white border border-neutral-200 rounded-3xl shadow-sm p-8 md:p-10 space-y-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">Qué podés esperar</span>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">Una entrada clara, sin ruido y con permisos reales</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Resumen rápido",
                  body: "La primera pantalla prioriza caja, alertas y tendencias antes que el detalle fino.",
                },
                {
                  title: "Dashboard compartido",
                  body: "Podés entrar como owner, editor o viewer según el acceso que te hayan dado.",
                },
                {
                  title: "Carga por web y Telegram",
                  body: "La operación diaria se registra desde el dashboard o desde el bot con permisos consistentes.",
                },
                {
                  title: "Trazabilidad",
                  body: "Cambios sensibles quedan con logs y confirmaciones para evitar errores irreversibles.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-5">
                  <div className="font-semibold text-neutral-900">{item.title}</div>
                  <p className="mt-2 text-sm text-neutral-600">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              Consejo: entrá con el mismo mail que usaron para invitarte. Si venís por invitación, la aceptación se sincroniza sola al autenticarte.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
