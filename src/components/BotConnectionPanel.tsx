import { useEffect, useState } from "react";
import { Bot, Copy, Link2, Loader2 } from "lucide-react";

import { api, BotConnectionStatus } from "../services/api";

export function BotConnectionPanel() {
  const [status, setStatus] = useState<BotConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const connection = await api.getBotConnection();
      setStatus(connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el vínculo con Telegram.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleCreateToken = async () => {
    setCreating(true);
    setError(null);
    try {
      const connection = await api.createBotLinkToken();
      setStatus(connection);
      setNotice("Token de conexión generado. Abrí el link o copiá el comando /start.");
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el token.");
    } finally {
      setCreating(false);
    }
  };

  const copyValue = async (value: string | null, message: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  };

  const tokenExpired = status?.pendingTokenExpiresAt
    ? new Date(status.pendingTokenExpiresAt).getTime() < Date.now()
    : false;
  const showDeepLink = Boolean(status?.telegramDeepLink) && !tokenExpired;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
          <Bot className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-base font-bold tracking-tight text-[var(--app-text-1)]">Bot de Telegram</h3>
          <p className="text-sm text-[var(--app-text-3)]">
            El bot solo procesa chats vinculados a tu cuenta.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--app-red-border)] bg-[var(--app-red-surface)] px-4 py-3 text-sm text-[var(--chart-expense)]">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-[var(--app-green-border)] bg-[var(--app-green-surface)] px-4 py-3 text-sm text-[var(--chart-income)]">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-4 text-[var(--app-text-3)] flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando estado del bot...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--app-border)] px-4 py-4 flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-[var(--app-text-3)] font-bold">
              Estado
            </span>
            <span className="font-medium text-[var(--app-text-1)]">
              {status?.connected
                ? `Conectado como @${status.telegramUsername || "usuario"}`
                : "Todavía no vinculaste un chat de Telegram"}
            </span>
            {status?.linkedAt && (
              <span className="text-xs text-[var(--app-text-3)]">
                Vinculado: {new Date(status.linkedAt).toLocaleString("es-AR")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handleCreateToken()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-4 py-3 text-[var(--app-strong-text)] font-medium hover:border-[var(--app-text-2)] disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  {status?.connected ? "Regenerar vínculo" : "Generar vínculo"}
                </>
              )}
            </button>

            {showDeepLink && (
              <a
                href={status!.telegramDeepLink!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)] font-medium hover:border-[var(--app-text-2)]"
              >
                Abrir Telegram
              </a>
            )}
          </div>

          {status?.pendingToken && !tokenExpired && (
            <div className="space-y-3 rounded-xl border border-[var(--app-border)] px-4 py-4">
              <div className="text-sm text-[var(--app-text-2)]">
                Si el deep link no abre bien, copiá este comando y mandáselo al bot:
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--app-surface-2)] px-4 py-3">
                <code className="text-sm text-[var(--app-text-1)] break-all">
                  {status.manualStartCode}
                </code>
                <button
                  onClick={() => void copyValue(status.manualStartCode, "Comando copiado.")}
                  className="p-2 rounded-xl border border-[var(--app-border)] hover:border-[var(--app-text-2)]"
                  aria-label="Copiar comando"
                  title="Copiar comando"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {status.pendingTokenExpiresAt && (
                <div className="text-xs text-[var(--app-text-3)]">
                  Expira: {new Date(status.pendingTokenExpiresAt).toLocaleString("es-AR")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
