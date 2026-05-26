import { useState, useEffect, type ReactElement } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Loader2,
  MessageCircle,
  Smartphone,
  X,
} from "lucide-react";
import { api, type DashboardMembersResponse, type TelegramLink } from "../../../../services/api";

interface TelegramSectionProps {
  data: DashboardMembersResponse | null;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function TelegramSection({ data, showNotice, setError }: TelegramSectionProps) {
  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generatingTokenFor, setGeneratingTokenFor] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{ userId: string; token: string; expiresAt: string } | null>(null);
  const [expandedTelegramMember, setExpandedTelegramMember] = useState<string | null>(null);

  useEffect(() => {
    loadTelegramLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTelegramLinks = () => {
    setLoadingLinks(true);
    api.getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error)
      .finally(() => setLoadingLinks(false));
  };

  const handleGenerateToken = async (userId: string) => {
    setGeneratingTokenFor(userId);
    setError(null);
    try {
      const result = await api.generateTelegramInviteToken(userId);
      setGeneratedToken({ userId, token: result.token, expiresAt: result.expires_at });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el token.");
    } finally {
      setGeneratingTokenFor(null);
    }
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(`/start ${token}`);
    showNotice("Comando copiado");
  };

  const handleConfirmLink = async (linkId: string) => {
    setError(null);
    try {
      await api.confirmTelegramLink(linkId);
      loadTelegramLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el vínculo.");
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setError(null);
    try {
      await api.revokeTelegramLink(linkId);
      loadTelegramLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el vínculo.");
    }
  };

  return (
    <div className="px-6 py-4 border-t border-neutral-200 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-3.5 h-3.5 text-neutral-500" />
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 flex-1">Acceso a Telegram</p>
        <button
          onClick={loadTelegramLinks}
          disabled={loadingLinks}
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
        >
          {loadingLinks ? <Loader2 className="w-3 h-3 animate-spin" /> : "Actualizar"}
        </button>
      </div>

      {(() => {
        const activeMembers = data?.members.filter((m) => m.status === "active") ?? [];
        if (activeMembers.length === 0) {
          return <p className="text-sm text-neutral-500">No hay miembros activos para vincular.</p>;
        }
        return (
          <div className="rounded-xl border border-neutral-200 overflow-hidden">
            {activeMembers.map((member) => {
              const memberLinks = telegramLinks.filter(
                (l) => l.app_user_id === member.user_id && l.status !== "revoked",
              );
              const activeLink = memberLinks.find((l) => l.status === "active") ?? null;
              const pendingLink = memberLinks.find((l) => l.status === "pending_owner_confirm") ?? null;
              const freshToken = generatedToken?.userId === member.user_id ? generatedToken : null;
              const isGenerating = generatingTokenFor === member.user_id;
              const isExpanded = expandedTelegramMember === member.id;

              let pill: ReactElement;
              if (activeLink) {
                pill = <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-200">Vinculado</span>;
              } else if (pendingLink) {
                pill = <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">Falta confirmar</span>;
              } else if (freshToken) {
                pill = <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">Invitación generada</span>;
              } else {
                pill = <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Sin vincular</span>;
              }

              return (
                <div key={member.id} className="border-b border-neutral-200 last:border-0">
                  <button
                    onClick={() => setExpandedTelegramMember(isExpanded ? null : member.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <ChevronRight className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold shrink-0">
                      {(member.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900 truncate">
                      {member.email ?? member.user_id}
                    </span>
                    {pill}
                  </button>

                  {isExpanded && (
                    <div className="pl-12 pr-4 pb-4 space-y-3">
                      {freshToken ? (
                        <p className="text-xs text-neutral-500">
                          Enviale este comando. Lo pega en el chat con el bot. Válido 30 minutos.
                        </p>
                      ) : activeLink ? (
                        <p className="text-xs text-neutral-500">
                          Conectado como{" "}
                          <span className="font-medium text-neutral-700">
                            {activeLink.telegram_username ? `@${activeLink.telegram_username}` : `ID ${activeLink.telegram_user_id}`}
                          </span>
                          . Si cambió de número o quiere volver a entrar, regenerá el vínculo.
                        </p>
                      ) : pendingLink ? (
                        <p className="text-xs text-neutral-500">
                          {pendingLink.telegram_username ? `@${pendingLink.telegram_username}` : `ID ${pendingLink.telegram_user_id}`}
                          {" "}ya inició sesión en el bot. Confirmá el vínculo para darle acceso.
                        </p>
                      ) : (
                        <p className="text-xs text-neutral-500">
                          Generá un vínculo para que esta persona conecte su Telegram al bot.
                        </p>
                      )}

                      {freshToken && (
                        <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
                          <code className="flex-1 text-xs font-mono text-neutral-800 break-all">/start {freshToken.token}</code>
                          <button
                            onClick={() => void handleCopyToken(freshToken.token)}
                            className="shrink-0 p-1.5 rounded-xl border border-transparent hover:border-[var(--app-text-2)]"
                            aria-label="Copiar comando"
                          >
                            <Copy className="w-3.5 h-3.5 text-neutral-600" />
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {activeLink && (
                          <>
                            <button
                              disabled={isGenerating}
                              onClick={() => void handleGenerateToken(member.user_id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[var(--app-text-2)] disabled:opacity-50"
                            >
                              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                              Regenerar vínculo
                            </button>
                            <button
                              onClick={() => void handleRevokeLink(activeLink.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-400"
                            >
                              <X className="w-3 h-3" /> Desvincular
                            </button>
                          </>
                        )}
                        {pendingLink && (
                          <>
                            <button
                              onClick={() => void handleConfirmLink(pendingLink.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-600 hover:border-green-400"
                            >
                              <Check className="w-3 h-3" /> Confirmar vínculo
                            </button>
                            <button
                              onClick={() => void handleRevokeLink(pendingLink.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-400"
                            >
                              <X className="w-3 h-3" /> Rechazar
                            </button>
                          </>
                        )}
                        {!activeLink && !pendingLink && (
                          <button
                            disabled={isGenerating}
                            onClick={() => void handleGenerateToken(member.user_id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 border border-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:border-[var(--app-text-2)] disabled:opacity-50"
                          >
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                            {freshToken ? "Regenerar comando" : "Generar vínculo de Telegram"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
