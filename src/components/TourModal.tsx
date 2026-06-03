import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, BarChart3, Send, Users, HelpCircle } from "lucide-react";

const STEPS = [
  { icon: Plus, title: "Cargá en lenguaje natural", body: 'Escribí o dictá como hablás: "pagué quince mil pesos de combustible, anotalo en la empresa Personal". Lo registra y le asigna la empresa automáticamente.' },
  { icon: Send, title: "Usalo desde Telegram", body: "Vinculá el bot en Configuración → Vinculación y cargá por chat, voz o foto del ticket desde el celular." },
  { icon: BarChart3, title: "Mirá el Resumen", body: "En Resumen ves el pulso del mes, flujo de caja y los gastos que más pesan. Podés registrar en pesos y en dólares, y el resumen los separa automáticamente." },
  { icon: Users, title: "Invitá a tu equipo", body: "Desde Configuración → Equipo podés sumar a otros: como editores para que carguen datos, o como espectadores para que solo miren. También exportás informes y descargás backups cuando quieras." },
  { icon: HelpCircle, title: "¿Tenés dudas?", body: "Tocá tu perfil (el círculo con tus iniciales) en la esquina superior derecha. Desde ahí podés ver este recorrido de nuevo, acceder a la ayuda y los comandos disponibles." },
];

export function TourModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  if (!open) return null;

  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  const close = () => { setStep(0); onClose(); };

  return createPortal(
    <div
      className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: "color-mix(in srgb, var(--app-text-1) 42%, transparent)" }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="anim-scale-in w-full max-w-[420px] rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] p-6 shadow-[var(--app-shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
          <Icon className="h-6 w-6" />
        </div>
        <h2 id="tour-title" className="text-lg font-bold text-[var(--app-text-1)]">{s.title}</h2>
        <p className="mt-1.5 text-sm text-[var(--app-text-2)] leading-relaxed">{s.body}</p>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-[var(--app-strong-surface)]" : "w-1.5 bg-[var(--app-border-strong)]"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium text-[var(--app-text-3)] hover:text-[var(--app-text-1)]">
              {last ? "Cerrar" : "Saltar"}
            </button>
            {!last && (
              <button
                type="button"
                onClick={() => setStep((v) => v + 1)}
                className="rounded-md bg-[var(--app-strong-surface)] px-5 py-2 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
              >
                Siguiente
              </button>
            )}
            {last && (
              <button
                type="button"
                onClick={close}
                className="rounded-md bg-[var(--app-strong-surface)] px-5 py-2 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
              >
                Empezar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
