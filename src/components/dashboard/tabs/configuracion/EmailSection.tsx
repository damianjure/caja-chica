import { useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type EmailSettings, type EmailSender } from "../../../../services/api";

export function EmailSection() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery<EmailSettings>({
    queryKey: ["emailSettings"],
    queryFn: () => api.getEmailSettings(),
    staleTime: 60_000,
  });

  const { data: senders, isLoading: sendersLoading } = useQuery<EmailSender[]>({
    queryKey: ["emailSenders"],
    queryFn: () => api.getEmailSenders(),
    staleTime: 5 * 60_000,
  });

  const [selectedEmail, setSelectedEmail] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; messageId?: string | null } | null>(null);

  // Sync selectedEmail with loaded settings (first load only)
  const currentFromEmail = settings?.from_email ?? "";
  const effectiveSelected = selectedEmail || currentFromEmail;

  const handleSave = async () => {
    if (!effectiveSelected) return;
    const sender = senders?.find((s) => s.email === effectiveSelected);
    if (!sender) return;
    setSaving(true);
    try {
      await api.updateEmailSettings({ from_email: sender.email, from_name: sender.name });
      await queryClient.invalidateQueries({ queryKey: ["emailSettings"] });
      toast.success("Remitente actualizado");
    } catch (err: any) {
      if (err?.status === 400) {
        toast.error("El remitente elegido no está verificado en Brevo.");
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar el remitente.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!testTo.trim()) return;
    setSending(true);
    setTestResult(null);
    try {
      const result = await api.sendTestEmail(testTo.trim());
      setTestResult({ ok: result.ok, messageId: result.brevo_message_id });
      toast.success("Email de prueba enviado");
    } catch (err: any) {
      if (err?.status === 429) {
        toast.error("Límite alcanzado: podés enviar hasta 3 emails de prueba por día.");
      } else if (err?.status === 400) {
        toast.error("Dirección de email inválida.");
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo enviar el email de prueba.");
      }
      setTestResult({ ok: false });
    } finally {
      setSending(false);
    }
  };

  const isLoading = settingsLoading || sendersLoading;

  return (
    <section className="bg-[var(--app-surface-1)] border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-6">
        <h2 className="text-xl font-bold text-[var(--app-text-1)] tracking-tight">Email del sistema</h2>
        <p className="text-sm text-[var(--app-text-3)] mt-1.5 leading-relaxed max-w-prose">
          Elegí el remitente verificado en Brevo para los emails transaccionales del sistema.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--app-text-3)] py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando configuración...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Sender selector */}
          <div className="rounded-xl border border-[var(--app-border)] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--app-text-1)] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[var(--app-text-3)]" />
              Remitente activo
            </h3>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="email-sender-select"
                  className="text-xs font-medium text-[var(--app-text-2)] block mb-1"
                >
                  Remitente verificado
                </label>
                {senders && senders.length > 0 ? (
                  <select
                    id="email-sender-select"
                    value={effectiveSelected}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                    disabled={saving}
                    aria-label="Seleccionar remitente verificado"
                  >
                    {senders.map((s) => (
                      <option key={s.id} value={s.email}>
                        {s.name} &lt;{s.email}&gt;{!s.active ? " (inactivo)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-[var(--app-text-3)] italic">
                    No hay remitentes verificados en Brevo. Verificá uno en el panel de Brevo primero.
                  </p>
                )}
              </div>

              {/* Amber note — DESIGN.md: semantic color only */}
              <p className="text-sm text-[var(--app-amber-text)] bg-[var(--app-amber-surface)] border border-[var(--app-amber-border)] rounded-lg px-3 py-2">
                Para usar un remitente nuevo, verificalo primero en Brevo. Acá solo aparecen los ya verificados.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !effectiveSelected || !senders || senders.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--app-strong-text)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.97]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Guardar remitente
            </button>
          </div>

          {/* Test send sub-block */}
          <div className="rounded-xl border border-[var(--app-border)] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--app-text-1)] flex items-center gap-2">
              <Send className="w-4 h-4 text-[var(--app-text-3)]" />
              Enviar email de prueba
            </h3>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="email-test-to"
                  className="text-xs font-medium text-[var(--app-text-2)] block mb-1"
                >
                  Destinatario
                </label>
                <input
                  id="email-test-to"
                  type="email"
                  className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
                  placeholder="destinatario@ejemplo.com"
                  value={testTo}
                  onChange={(e) => {
                    setTestTo(e.target.value);
                    setTestResult(null);
                  }}
                  disabled={sending}
                  aria-label="Email del destinatario para la prueba"
                />
              </div>

              {testResult !== null && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`text-sm px-3 py-2 rounded-lg border ${
                    testResult.ok
                      ? "text-[var(--app-green-text)] bg-[var(--app-green-surface)] border-[var(--app-green-border)]"
                      : "text-[var(--app-red-text)] bg-[var(--app-red-surface)] border-[var(--app-red-border)]"
                  }`}
                >
                  {testResult.ok
                    ? testResult.messageId
                      ? `Enviado. ID: ${testResult.messageId}`
                      : "Enviado correctamente."
                    : "No se pudo enviar el email de prueba."}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleTestSend()}
              disabled={sending || !testTo.trim()}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.97]"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar prueba
            </button>

            <p className="text-xs text-[var(--app-text-3)]">
              Límite: 3 emails de prueba por día.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
