import { useState, useMemo } from "react";
import { Check, Copy, Loader2, MessageCircle, Settings, Smartphone, UserMinus, UserPlus, Users, X, XCircle, LogOut, HardDrive } from "lucide-react";
import {
  api,
  type AppViewer,
  type DashboardInvitationRole,
  type DashboardMembersResponse,
  type MemberPermissions,
  type TelegramLink,
} from "../../../services/api";

interface ConfiguracionTabProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  canConnectDrive: boolean;
  onSignOut: () => Promise<void> | void;
  onDisconnectDrive?: () => Promise<void>;
}

export default function ConfiguracionTab({
  viewer,
  data,
  loading,
  onRefresh,
  canConnectDrive,
  onSignOut,
  onDisconnectDrive,
}: ConfiguracionTabProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DashboardInvitationRole>("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingPermissions, setUpdatingPermissions] = useState<string | null>(null);
  const [revokingMember, setRevokingMember] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; email: string } | null>(null);
  const [leavingDashboard, setLeavingDashboard] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generatingTokenFor, setGeneratingTokenFor] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{ userId: string; token: string; expiresAt: string } | null>(null);

  const selfMembership = useMemo(
    () => data?.members.find((m) => m.user_id === viewer.id) ?? null,
    [data, viewer.id],
  );

  const canManage =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    selfMembership?.role === "owner";

  const isNonOwnerMember = selfMembership !== null && selfMembership.role !== "owner";

  const loadTelegramLinks = () => {
    if (!canManage) return;
    setLoadingLinks(true);
    api.getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error)
      .finally(() => setLoadingLinks(false));
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.inviteDashboardMember(email.trim(), role);
      setEmail("");
      setRole("viewer");
      showNotice(`Invitación enviada a ${email.trim()}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo invitar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    try {
      await api.revokeDashboardInvitation(invitationId);
      showNotice("Invitación revocada");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    }
  };

  const handleTogglePermission = async (memberId: string, current: MemberPermissions, key: keyof MemberPermissions) => {
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

  const handleRevokeMember = async (memberId: string) => {
    setRevokingMember(memberId);
    setRevokeConfirm(null);
    setError(null);
    try {
      await api.revokeMember(memberId);
      showNotice("Acceso revocado");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el acceso.");
    } finally {
      setRevokingMember(null);
    }
  };

  const handleLeaveDashboard = async () => {
    setLeavingDashboard(true);
    setShowLeaveConfirm(false);
    try {
      await api.leaveDashboard();
      showNotice("Abandonaste el dashboard. Cerrando sesión...");
      setTimeout(() => void onSignOut(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abandonar el dashboard.");
      setLeavingDashboard(false);
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

  const PERMISSION_LABELS: { key: keyof MemberPermissions; label: string; description: string }[] = [
    { key: "delete_any", label: "Borrar ajenos", description: "Puede borrar movimientos de otros miembros" },
    { key: "export_drive", label: "Drive", description: "Puede exportar informes a Google Drive" },
    { key: "invite_telegram", label: "Invitar Telegram", description: "Puede generar invitaciones de Telegram" },
    { key: "manage_backups", label: "Gestionar backups", description: "Puede crear y gestionar backups" },
    { key: "restore_backups", label: "Restaurar backups", description: "Puede restaurar desde backups" },
  ];

  const linkStatusBadge = (status: TelegramLink["status"]) => {
    if (status === "active") return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Activo</span>;
    if (status === "pending_owner_confirm") return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>;
    return <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Revocado</span>;
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: "bg-neutral-900 text-white",
      editor: "bg-blue-100 text-blue-700",
      viewer: "bg-neutral-100 text-neutral-600",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] ?? "bg-neutral-100 text-neutral-500"}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Feedback */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      )}

      {/* Card: Miembros */}
      <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-neutral-900 text-white">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Miembros</h2>
            <p className="text-sm text-neutral-500">Gestioná accesos, permisos e invitaciones al dashboard.</p>
          </div>
        </div>

        {selfMembership && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 flex items-center gap-2">
            Tu acceso: {roleBadge(selfMembership.role)}
          </div>
        )}

        {/* Invitar */}
        {canManage && (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colaborador@empresa.com"
              className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DashboardInvitationRole)}
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
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Invitando...</> : <><UserPlus className="w-4 h-4" /> Invitar</>}
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-8 flex items-center justify-center text-neutral-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Lista de miembros */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Miembros activos</h3>
              <div className="space-y-3">
                {data?.members.map((member) => {
                  const perms: MemberPermissions = member.permissions ?? {};
                  const isUpdating = updatingPermissions === member.id;
                  const activeToken = generatedToken?.userId === member.user_id ? generatedToken : null;
                  const isRevoking = revokingMember === member.id;
                  const canRevoke = canManage && member.role !== "owner" && member.user_id !== viewer.id;

                  return (
                    <div key={member.id} className="border border-neutral-200 rounded-2xl px-4 py-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">
                            {member.email ?? member.user_id}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {roleBadge(member.role)}
                            <span className="text-xs text-neutral-400">{member.status}</span>
                          </div>
                        </div>
                        {canRevoke && (
                          <button
                            onClick={() => setRevokeConfirm({ id: member.id, email: member.email ?? member.user_id })}
                            disabled={isRevoking}
                            className="p-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 shrink-0"
                            title="Revocar acceso"
                          >
                            {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Permission toggles — editors only */}
                      {canManage && member.role === "editor" && (
                        <div className="flex flex-wrap gap-2">
                          {PERMISSION_LABELS.map(({ key, label }) => {
                            const active = !!perms[key];
                            return (
                              <button
                                key={key}
                                disabled={isUpdating}
                                onClick={() => void handleTogglePermission(member.id, perms, key)}
                                title={PERMISSION_LABELS.find(p => p.key === key)?.description}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 self-center" />}
                        </div>
                      )}

                      {/* Telegram invite */}
                      {canManage && member.status === "active" && (
                        <div className="space-y-2">
                          <button
                            disabled={generatingTokenFor === member.user_id}
                            onClick={() => void handleGenerateToken(member.user_id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          >
                            {generatingTokenFor === member.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                            Invitar a Telegram
                          </button>
                          {activeToken && (
                            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <code className="text-xs font-mono text-neutral-800 break-all">/start {activeToken.token}</code>
                                <button onClick={() => void handleCopyToken(activeToken.token)} className="shrink-0 p-1 rounded-lg hover:bg-neutral-200" title="Copiar">
                                  <Copy className="w-3 h-3 text-neutral-600" />
                                </button>
                              </div>
                              <p className="text-xs text-neutral-500">Válido 30 min.</p>
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

            {/* Invitaciones */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Invitaciones</h3>
              <div className="space-y-3">
                {data?.invitations.map((inv) => (
                  <div key={inv.id} className="border border-neutral-200 rounded-2xl px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{inv.email}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {roleBadge(inv.role)}
                          <span className="text-xs text-neutral-400">{inv.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => void navigator.clipboard.writeText(inv.invite_url).then(() => showNotice("Link copiado"))} className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50" title="Copiar link">
                          <Copy className="w-4 h-4" />
                        </button>
                        {canManage && inv.status === "pending" && (
                          <button onClick={() => void handleRevoke(inv.id)} className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50" title="Revocar">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-neutral-400" />
              <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Vínculos Telegram</h3>
              <button onClick={loadTelegramLinks} className="ml-auto text-xs text-neutral-400 hover:text-neutral-700">Actualizar</button>
            </div>
            {loadingLinks ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>
            ) : telegramLinks.length === 0 ? (
              <p className="text-sm text-neutral-500">No hay vínculos registrados.</p>
            ) : (
              <div className="space-y-2">
                {telegramLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-medium text-neutral-900 text-sm">
                        {link.telegram_username ? `@${link.telegram_username}` : `ID ${link.telegram_user_id}`}
                      </div>
                      <div className="flex items-center gap-2">{linkStatusBadge(link.status)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {link.status === "pending_owner_confirm" && (
                        <button onClick={() => void handleConfirmLink(link.id)} className="p-1.5 rounded-xl border border-green-200 text-green-600 hover:bg-green-50" title="Confirmar">
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      {link.status !== "revoked" && (
                        <button onClick={() => void handleRevokeLink(link.id)} className="p-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50" title="Revocar">
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

      {/* Card: Cuenta y desconexión */}
      <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-neutral-900 text-white">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cuenta</h2>
            <p className="text-sm text-neutral-500">Sesión, integraciones y acceso al dashboard.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-1">
          <div className="text-sm font-medium text-neutral-900">{viewer.email}</div>
          <div className="text-xs text-neutral-500">Rol de app: <span className="font-medium">{viewer.role}</span></div>
        </div>

        <div className="space-y-3">
          {canConnectDrive && onDisconnectDrive && (
            <button
              onClick={() => void onDisconnectDrive()}
              className="w-full flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <HardDrive className="w-4 h-4 text-neutral-400" />
              Desconectar Google Drive
            </button>
          )}

          {isNonOwnerMember && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              disabled={leavingDashboard}
              className="w-full flex items-center gap-3 rounded-2xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {leavingDashboard ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              Abandonar este dashboard
            </button>
          )}

          <button
            onClick={() => void onSignOut()}
            className="w-full flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-neutral-400" />
            Cerrar sesión
          </button>
        </div>
      </section>

      {/* Modal: Confirmar revocar miembro */}
      {revokeConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6 space-y-4">
            <h3 className="text-lg font-bold text-neutral-900">Revocar acceso</h3>
            <p className="text-sm text-neutral-600">
              Vas a revocar el acceso de <span className="font-medium">{revokeConfirm.email}</span>. No podrá ver ni editar el dashboard.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRevokeConfirm(null)}
                className="flex-1 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleRevokeMember(revokeConfirm.id)}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700"
              >
                Revocar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar abandonar dashboard */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6 space-y-4">
            <h3 className="text-lg font-bold text-neutral-900">Abandonar dashboard</h3>
            <p className="text-sm text-neutral-600">
              Vas a salir de este dashboard compartido. Se revocará tu acceso y se cerrará tu sesión.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleLeaveDashboard()}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700"
              >
                Abandonar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
