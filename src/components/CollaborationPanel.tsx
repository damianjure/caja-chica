import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Smartphone, UserPlus, Users, X, XCircle } from "lucide-react";

import {
  api,
  type AppViewer,
  type DashboardInvitationRole,
  type DashboardMembersResponse,
  type MemberPermissions,
  type TelegramLink,
} from "../services/api";

interface CollaborationPanelProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function CollaborationPanel({
  viewer,
  data,
  loading,
  onRefresh,
}: CollaborationPanelProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DashboardInvitationRole>("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generatingTokenFor, setGeneratingTokenFor] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{
    userId: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [updatingPermissions, setUpdatingPermissions] = useState<string | null>(null);

  const selfMembership = useMemo(
    () => data?.members.find((member) => member.user_id === viewer.id) ?? null,
    [data, viewer.id],
  );

  const canManage =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    selfMembership?.role === "owner";

  const loadTelegramLinks = () => {
    if (!canManage) return;
    setLoadingLinks(true);
    api
      .getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error)
      .finally(() => setLoadingLinks(false));
  };

  useEffect(() => {
    loadTelegramLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.inviteDashboardMember(email.trim(), role);
      setEmail("");
      setRole("viewer");
      setNotice(`Invitación enviada a ${email.trim()}`);
      setTimeout(() => setNotice(null), 2500);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo invitar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (inviteUrl: string, emailValue: string) => {
    await navigator.clipboard.writeText(inviteUrl);
    setNotice(`Link copiado para ${emailValue}`);
    setTimeout(() => setNotice(null), 2500);
  };

  const handleRevoke = async (invitationId: string) => {
    setError(null);
    try {
      await api.revokeDashboardInvitation(invitationId);
      setNotice("Invitación revocada");
      setTimeout(() => setNotice(null), 2500);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    }
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
    setNotice("Comando copiado");
    setTimeout(() => setNotice(null), 2500);
  };

  const handleTogglePermission = async (
    memberId: string,
    current: MemberPermissions,
    key: keyof MemberPermissions,
  ) => {
    setUpdatingPermissions(memberId);
    setError(null);
    try {
      await api.updateMemberPermissions(memberId, { ...current, [key]: !current[key] });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el permiso.");
    } finally {
      setUpdatingPermissions(null);
    }
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

  const formatExpiry = (isoDate: string) => {
    const d = new Date(isoDate);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const linkStatusBadge = (status: TelegramLink["status"]) => {
    if (status === "active") {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Activo
        </span>
      );
    }
    if (status === "pending_owner_confirm") {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          Pendiente
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
        Revocado
      </span>
    );
  };

  return (
    <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-neutral-900 text-white">
          <Users className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Colaboradores</h2>
          <p className="text-sm text-neutral-500">
            Invitá viewers o editors al dashboard compartido.
          </p>
        </div>
      </div>

      {selfMembership && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          Tu acceso actual: <span className="font-semibold text-neutral-900">{selfMembership.role}</span>
        </div>
      )}

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

      {canManage && (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="colaborador@empresa.com"
            className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as DashboardInvitationRole)}
            className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
          <button
            onClick={() => void handleInvite()}
            disabled={submitting || !email.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-white font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Invitando...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Invitar
              </>
            )}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex items-center justify-center text-neutral-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Miembros
            </h3>
            <div className="space-y-3">
              {data?.members.map((member) => {
                const perms: MemberPermissions = member.permissions ?? {};
                const isUpdating = updatingPermissions === member.id;
                const activeToken =
                  generatedToken?.userId === member.user_id ? generatedToken : null;

                return (
                  <div
                    key={member.id}
                    className="border border-neutral-200 rounded-2xl px-4 py-3 min-w-0 space-y-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">
                        {member.email ?? member.user_id}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {member.role} · {member.status}
                      </div>
                    </div>

                    {/* Permission toggles — only for editors, only if canManage */}
                    {canManage && member.role === "editor" && (
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { key: "delete_any", label: "Borrar ajenos" },
                            { key: "export_drive", label: "Drive" },
                            { key: "invite_telegram", label: "Invitar Telegram" },
                          ] as { key: keyof MemberPermissions; label: string }[]
                        ).map(({ key, label }) => {
                          const active = !!perms[key];
                          return (
                            <button
                              key={key}
                              disabled={isUpdating}
                              onClick={() => void handleTogglePermission(member.id, perms, key)}
                              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                active
                                  ? "bg-neutral-900 text-white"
                                  : "bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 self-center" />}
                      </div>
                    )}

                    {/* Telegram invite button */}
                    {canManage && member.status === "active" && (
                      <div className="space-y-2">
                        <button
                          disabled={generatingTokenFor === member.user_id}
                          onClick={() => void handleGenerateToken(member.user_id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                        >
                          {generatingTokenFor === member.user_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Smartphone className="w-3 h-3" />
                          )}
                          Invitar a Telegram
                        </button>

                        {activeToken && (
                          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <code className="text-xs font-mono text-neutral-800 break-all">
                                /start {activeToken.token}
                              </code>
                              <button
                                onClick={() => void handleCopyToken(activeToken.token)}
                                className="shrink-0 p-1 rounded-lg hover:bg-neutral-200"
                                title="Copiar"
                              >
                                <Copy className="w-3 h-3 text-neutral-600" />
                              </button>
                            </div>
                            <p className="text-xs text-neutral-500">
                              Expira a las {formatExpiry(activeToken.expiresAt)}. Válido 30 min.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {(!data || data.members.length === 0) && (
                <p className="text-sm text-neutral-500">Todavía no hay miembros.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Invitaciones
            </h3>
            <div className="space-y-3">
              {data?.invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border border-neutral-200 rounded-2xl px-4 py-3 space-y-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{invitation.email}</div>
                      <div className="text-xs text-neutral-500">
                        {invitation.role} · {invitation.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void handleCopy(invitation.invite_url, invitation.email)}
                        className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50"
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {canManage && invitation.status === "pending" && (
                        <button
                          onClick={() => void handleRevoke(invitation.id)}
                          className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                          title="Revocar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 [overflow-wrap:anywhere] leading-relaxed">
                    {invitation.invite_url}
                  </div>
                </div>
              ))}
              {(!data || data.invitations.length === 0) && (
                <p className="text-sm text-neutral-500">No hay invitaciones pendientes.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vínculos Telegram */}
      {canManage && (
        <div className="space-y-3 pt-2 border-t border-neutral-100">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-neutral-400" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Vínculos Telegram
            </h3>
          </div>

          {loadingLinks ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando vínculos...
            </div>
          ) : telegramLinks.length === 0 ? (
            <p className="text-sm text-neutral-500">No hay vínculos registrados.</p>
          ) : (
            <div className="space-y-2">
              {telegramLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-medium text-neutral-900 text-sm">
                      {link.telegram_username
                        ? `@${link.telegram_username}`
                        : `ID ${link.telegram_user_id}`}
                    </div>
                    <div className="flex items-center gap-2">
                      {linkStatusBadge(link.status)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {link.status === "pending_owner_confirm" && (
                      <button
                        onClick={() => void handleConfirmLink(link.id)}
                        className="p-1.5 rounded-xl border border-green-200 text-green-600 hover:bg-green-50"
                        title="Confirmar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    {link.status !== "revoked" && (
                      <button
                        onClick={() => void handleRevokeLink(link.id)}
                        className="p-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                        title="Revocar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
