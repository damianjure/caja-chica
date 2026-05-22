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

  return (
    <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-neutral-900 text-white">
          <Bot className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Vincular bot de Telegram</h2>
          <p className="text-sm text-neutral-500">
            El bot ahora es multiusuario real: solo procesa chats vinculados a tu cuenta.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-4 text-neutral-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando estado del bot...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 px-4 py-4 flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
              Estado
            </span>
            <span className="font-medium text-neutral-900">
              {status?.connected
                ? `Conectado como @${status.telegramUsername || "usuario"}`
                : "Todavía no vinculaste un chat de Telegram"}
            </span>
            {status?.linkedAt && (
              <span className="text-xs text-neutral-500">
                Vinculado: {new Date(status.linkedAt).toLocaleString("es-AR")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handleCreateToken()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 border border-neutral-900 px-4 py-3 text-white font-medium hover:border-[var(--app-text-2)] disabled:opacity-50"
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

            {status?.telegramDeepLink && (
              <a
                href={status.telegramDeepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-neutral-700 font-medium hover:border-[var(--app-text-2)]"
              >
                Abrir Telegram
              </a>
            )}
          </div>

          {status?.pendingToken && (
            <div className="space-y-3 rounded-2xl border border-neutral-200 px-4 py-4">
              <div className="text-sm text-neutral-600">
                Si el deep link no abre bien, copiá este comando y mandáselo al bot:
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3">
                <code className="text-sm text-neutral-800 break-all">
                  {status.manualStartCode}
                </code>
                <button
                  onClick={() => void copyValue(status.manualStartCode, "Comando copiado.")}
                  className="p-2 rounded-xl border border-neutral-200 hover:border-[var(--app-text-2)]"
                  aria-label="Copiar comando"
                  title="Copiar comando"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {status.pendingTokenExpiresAt && (
                <div className="text-xs text-neutral-500">
                  Expira: {new Date(status.pendingTokenExpiresAt).toLocaleString("es-AR")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
