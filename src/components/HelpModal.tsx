import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, LifeBuoy, Send, Mic, Lightbulb, HelpCircle, BookOpen } from "lucide-react";
import { ModalShell } from "./ui/ModalShell";
import { api } from "../services/api";

const VOICE_EXAMPLES = [
  '"pagué 4500 de luz"',
  '"cobré 5 lucas del taller"',
  '"¿cómo venimos este mes?"',
  '"mandame el informe de mayo"',
  '"creá la empresa Delta"',
  '"borrá el último"',
  '"recurrente: alquiler 250 mil mensual"',
  '"listá las empresas"',
];

const TIPS: Array<{ q: string; a: string }> = [
  { q: "Escribí montos naturales", a: 'Funciona "4500", "5 lucas", "2 palos", "10k". El bot entiende la jerga.' },
  { q: "Mandá foto del ticket", a: "Sacale una foto o mandá el PDF al bot (o subilo desde el botón Cargar) y extrae monto, fecha y empresa solo." },
  { q: "Vinculá Telegram", a: "Desde Configuración → Vinculación generás el vínculo para cargar desde el celular por chat o voz." },
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: "¿Quién puede ver mis datos?", a: "Solo vos y las personas que invites a tu dashboard. Cada cuenta es independiente y no comparte datos con otras." },
  { q: "¿Conectar Google Drive crea archivos?", a: "No. Conectar solo guarda el permiso. Los archivos se crean únicamente cuando exportás un informe o backup con destino Drive." },
  { q: "¿Cómo hago un backup?", a: "Configuración → Tu cuenta → 'Descargar backup'. Genera un ZIP con movimientos, empresas y categorías; podés bajarlo o guardarlo en Drive." },
  { q: "¿Cómo invito a alguien?", a: "Configuración → Equipo. Escribís el email y elegís si puede ver o editar. Le llega una invitación por mail." },
  { q: "¿Se pueden borrar movimientos?", a: "Sí, con confirmación. Se hace borrado seguro (soft delete) con auditoría, no se pierde el rastro." },
  { q: "¿Qué diferencia hay entre Dueño / Puede editar / Puede ver?", a: "Dueño: control total del dashboard. Puede editar: carga y edita movimientos. Puede ver: solo lectura." },
];

const SLANG: Array<{ palabra: string; valor: string }> = [
  { palabra: "mango", valor: "$1" },
  { palabra: "luca", valor: "$1.000" },
  { palabra: "gamba", valor: "$100" },
  { palabra: "palo", valor: "$1.000.000" },
  { palabra: "luca verde", valor: "USD 1.000" },
  { palabra: "palo verde", valor: "USD 1.000.000" },
  { palabra: '"k" (ej. 5k)', valor: "× mil" },
];

function Accordion({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--app-text-1)]"
          >
            {item.q}
            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--app-text-3)] transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <p className="px-4 pb-3 text-sm text-[var(--app-text-2)] leading-relaxed">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Mic; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[var(--app-text-2)]">
      <Icon className="h-4 w-4 text-[var(--app-text-3)]" />
      {children}
    </h3>
  );
}

export function HelpModal({ open, onClose, section }: { open: boolean; onClose: () => void; section?: string }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const sendReport = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    try {
      await api.reportProblem(text, {
        section: section ?? "",
        version: (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION ?? "web",
        userAgent: navigator.userAgent,
      });
      toast.success("Recibido. Lo miramos y te ayudamos.");
      setMessage("");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      toast.error(code.includes("429") ? "Llegaste al límite de reportes por hoy." : "No se pudo enviar el reporte.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell title="Ayuda" description="Cómo usar Caja Chica, comandos del bot y preguntas frecuentes." onClose={onClose} size="lg">
      <div className="space-y-7">
        <section className="space-y-3">
          <SectionTitle icon={Mic}>Hablale al bot (voz o texto)</SectionTitle>
          <p className="text-sm text-[var(--app-text-3)]">Desde Telegram podés decir cosas como:</p>
          <div className="flex flex-wrap gap-2">
            {VOICE_EXAMPLES.map((e) => (
              <span key={e} className="rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-1 text-xs text-[var(--app-text-2)]">{e}</span>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle icon={BookOpen}>Jerga que entiende</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-[var(--app-border)]">
            <table className="w-full text-sm">
              <tbody>
                {SLANG.map((s, i) => (
                  <tr key={s.palabra} className={i % 2 ? "bg-[var(--app-surface-1)]" : ""}>
                    <td className="px-4 py-2 font-medium text-[var(--app-text-1)]">{s.palabra}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--app-text-2)]">{s.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle icon={Lightbulb}>Recomendaciones</SectionTitle>
          <Accordion items={TIPS} />
        </section>

        <section className="space-y-3">
          <SectionTitle icon={HelpCircle}>Preguntas frecuentes</SectionTitle>
          <Accordion items={FAQ} />
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4">
          <SectionTitle icon={LifeBuoy}>Reportar un problema</SectionTitle>
          <p className="text-sm text-[var(--app-text-3)]">Contanos qué pasó y le llega al equipo. Adjuntamos automáticamente tu cuenta y la sección actual.</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ej: no me aparece el botón de exportar en el celular…"
            className="min-h-[90px] w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] p-3 text-sm text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void sendReport()}
              disabled={!message.trim() || sending}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-5 py-2.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97] disabled:opacity-50 transition"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar reporte
            </button>
          </div>
        </section>
      </div>
    </ModalShell>
  );
}
