import { useState, useMemo } from "react";
import {
  Check,
  Copy,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  Settings,
  Smartphone,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  api,
  type AppViewer,
  type DashboardInvitationRole,
  type DashboardMembersResponse,
  type MemberPermissions,
  type TelegramLink,
} from "../../../services/api";
import { ConfirmModal } from "../../ui/ConfirmModal";

interface ConfiguracionTabProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  canConnectDrive: boolean;
  onSignOut: () => Promise<void> | void;
  onDisconnectDrive?: () => Promise<void>;
}

interface PermCol {
  key: keyof MemberPermissions;
  label: string;
  description: string;
  defaultOn: boolean;
}

const PERM_COLS: PermCol[] = [
  { key: "invite_telegram", label: "Telegram", description: "Puede generar invitaciones de Telegram para otros miembros", defaultOn: false },
  { key: "export_drive", label: "Drive", description: "Puede exportar informes a Google Drive (usa token del owner)", defaultOn: false },
  { key: "export_local", label: "Exportar", description: "Puede descargar archivos CSV y PDF", defaultOn: true },
  { key: "edit_any", label: "Editar", description: "Puede editar movimientos de otros miembros", defaultOn: false },
  { key: "delete_any", label: "Eliminar", description: "Puede eliminar movimientos de otros miembros", defaultOn: false },
  { key: "manage_empresas", label: "Empresas", description: "Puede crear, editar y eliminar empresas", defaultOn: true },
  { key: "manage_categorias", label: "Categ.", description: "Puede crear y eliminar categorías", defaultOn: true },
  { key: "manage_backups", label: "Backups", description: "Puede gestionar backups del dashboard", defaultOn: false },
  { key: "restore_backups", label: "Restaurar", description: "Puede restaurar datos desde un backup", defaultOn: false },
];

function effectivePerm(perms: MemberPermissions, col: PermCol): boolean {
  const val = perms[col.key];
  return val !== undefined ? !!val : col.defaultOn;
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

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const loadTelegramLinks = () => {
    if (!canManage) return;
    setLoadingLinks(true);
    api.getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error)
      .finally(() => setLoadingLinks(false));
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

  const handleRevokeDashboardInvitation = async (invitationId: string) => {
    try {
      await api.revokeDashboardInvitation(invitationId);
      showNotice("Invitación revocada");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    }
  };

  const handleTogglePermission = async (
    memberId: string,
    current: MemberPermissions,
    col: PermCol,
  ) => {
    setUpdatingPermissions(memberId);
    setError(null);
    try {
      const next = !effectivePerm(current, col);
      await api.updateMemberPermissions(memberId, { ...current, [col.key]: next });
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

  const statusDot = (status: string) => {
    if (status === "active") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />;
    if (status === "pending") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />;
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300" />;
  };

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      owner: "bg-neutral-900 text-white",
      editor: "bg-blue-100 text-blue-700",
      viewer: "bg-neutral-100 text-neutral-600",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? "bg-neutral-100 text-neutral-500"}`}>
        {role}
      </span>
    );
  };

  const linkStatusBadge = (status: TelegramLink["status"]) => {
    if (status === "active") return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Activo</span>;
    if (status === "pending_owner_confirm") return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>;
    return <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Revocado</span>;
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      )}

      {/* ── Miembros (solo owner / admin) ─────────────────────────────────── */}
      {canManage && (
        <section className="bg-white border border-neutral-200 rounded-3xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-neutral-900 text-white">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Miembros</h2>
                <p className="text-sm text-neutral-500">Accesos, permisos e invitaciones.</p>
              </div>
            </div>

            {/* Invite form */}
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
                placeholder="colaborador@empresa.com"
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as DashboardInvitationRole)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                onClick={() => void handleInvite()}
                disabled={submitting || !email.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-sm text-white font-medium hover:bg-neutral-800 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Invitar
              </button>
            </div>
          </div>

          {/* Permissions table */}
          {loading ? (
            <div className="py-10 flex justify-center text-neutral-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-neutral-100">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="sticky left-0 z-10 bg-neutral-50 text-left px-6 py-3 font-semibold text-neutral-700 text-xs uppercase tracking-wide min-w-[180px]">
                      Miembro
                    </th>
                    {PERM_COLS.map((col) => (
                      <th
                        key={col.key}
                        title={col.description}
                        className="px-3 py-3 text-center font-medium text-neutral-500 text-xs whitespace-nowrap cursor-help"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-medium text-neutral-500 text-xs">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.members.map((member) => {
                    const perms: MemberPermissions = member.permissions ?? {};
                    const isUpdating = updatingPermissions === member.id;
                    const isRevoking = revokingMember === member.id;
                    const canRevoke = member.role !== "owner" && member.user_id !== viewer.id;
                    const isOwner = member.role === "owner";
                    const isViewer = member.role === "viewer";

                    return (
                      <tr
                        key={member.id}
                        className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60 transition-colors"
                      >
                        {/* Member info — sticky */}
                        <td className="sticky left-0 z-10 bg-white px-6 py-4 hover:bg-neutral-50/60">
                          <div className="font-medium text-neutral-900 text-sm [overflow-wrap:anywhere] leading-tight">
                            {member.email ?? member.user_id}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {roleBadge(member.role)}
                            {statusDot(member.status)}
                            <span className="text-[11px] text-neutral-400">{member.status}</span>
                          </div>
                        </td>

                        {/* Permission cells */}
                        {PERM_COLS.map((col) => {
                          const active = effectivePerm(perms, col);
                          return (
                            <td key={col.key} className="px-3 py-4 text-center">
                              {isOwner ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-900 mx-auto">
                                  <Check className="w-3 h-3 text-white" />
                                </span>
                              ) : isViewer ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 mx-auto">
                                  <Lock className="w-3.5 h-3.5 text-neutral-300" />
                                </span>
                              ) : (
                                <button
                                  disabled={isUpdating}
                                  onClick={() => void handleTogglePermission(member.id, perms, col)}
                                  title={col.description}
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full mx-auto transition-all disabled:opacity-40 ${
                                    active
                                      ? "bg-neutral-900 text-white hover:bg-neutral-700"
                                      : "border-2 border-neutral-300 text-transparent hover:border-neutral-500"
                                  }`}
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          );
                        })}

                        {/* Actions */}
                        <td className="px-3 py-4 text-center">
                          {isUpdating ? (
                            <Loader2 className="w-4 h-4 animate-spin text-neutral-400 mx-auto" />
                          ) : canRevoke ? (
                            <button
                              onClick={() => setRevokeConfirm({ id: member.id, email: member.email ?? member.user_id })}
                              disabled={isRevoking}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 mx-auto"
                              title="Revocar acceso"
                            >
                              {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <span className="text-xs text-neutral-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!data || data.members.length === 0) && (
                    <tr>
                      <td colSpan={PERM_COLS.length + 2} className="px-6 py-8 text-center text-sm text-neutral-400">
                        Todavía no hay miembros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Telegram invite per member */}
          {!loading && data && data.members.some((m) => m.status === "active") && (
            <div className="px-6 py-4 border-t border-neutral-100 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Invitar a Telegram</p>
              <div className="flex flex-wrap gap-2">
                {data.members.filter((m) => m.status === "active").map((member) => {
                  const activeToken = generatedToken?.userId === member.user_id ? generatedToken : null;
                  return (
                    <div key={member.id} className="space-y-1.5">
                      <button
                        disabled={generatingTokenFor === member.user_id}
                        onClick={() => void handleGenerateToken(member.user_id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {generatingTokenFor === member.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                        {member.email?.split("@")[0] ?? "miembro"}
                      </button>
                      {activeToken && (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <code className="text-xs font-mono text-neutral-800 break-all">/start {activeToken.token}</code>
                            <button onClick={() => void handleCopyToken(activeToken.token)} className="shrink-0 p-1 rounded-lg hover:bg-neutral-200">
                              <Copy className="w-3 h-3 text-neutral-600" />
                            </button>
                          </div>
                          <p className="text-[11px] text-neutral-500">Válido 30 min.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending invitations */}
          {!loading && data && data.invitations.length > 0 && (
            <div className="px-6 py-4 border-t border-neutral-100 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Invitaciones pendientes</p>
              <div className="space-y-2">
                {data.invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 text-sm [overflow-wrap:anywhere]">{inv.email}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {roleBadge(inv.role)}
                        <span className="text-xs text-neutral-400">{inv.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void navigator.clipboard.writeText(inv.invite_url).then(() => showNotice("Link copiado"))}
                        className="p-1.5 rounded-xl border border-neutral-200 hover:bg-neutral-50"
                        title="Copiar link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {inv.status === "pending" && (
                        <button
                          onClick={() => void handleRevokeDashboardInvitation(inv.id)}
                          className="p-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50"
                          title="Revocar"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Telegram links */}
          <div className="px-6 py-4 border-t border-neutral-100 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5 text-neutral-400" />
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 flex-1">Vínculos Telegram</p>
              <button onClick={loadTelegramLinks} className="text-xs text-neutral-400 hover:text-neutral-700">Actualizar</button>
            </div>
            {loadingLinks ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>
            ) : telegramLinks.length === 0 ? (
              <p className="text-sm text-neutral-400">No hay vínculos registrados.</p>
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
                        <button onClick={() => void handleRevokeLink(link.id)} className="p-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50" title="Revocar">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Cuenta ────────────────────────────────────────────────────────── */}
      <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-neutral-900 text-white">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cuenta</h2>
            <p className="text-sm text-neutral-500">Sesión, integraciones y acceso.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-1">
          <div className="text-sm font-medium text-neutral-900">{viewer.email}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-500">Rol de app:</span>
            <span className="text-xs font-medium text-neutral-700">{viewer.role}</span>
            {selfMembership && (
              <>
                <span className="text-xs text-neutral-300">·</span>
                <span className="text-xs text-neutral-500">Dashboard:</span>
                {roleBadge(selfMembership.role)}
                {statusDot(selfMembership.status)}
              </>
            )}
          </div>
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

      {revokeConfirm && (
        <ConfirmModal
          title="Revocar acceso"
          description={`Vas a revocar el acceso de ${revokeConfirm.email}. No podrá ver ni editar el dashboard.`}
          confirmLabel="Revocar"
          tone="danger"
          onConfirm={async () => {
            await handleRevokeMember(revokeConfirm.id);
          }}
          onCancel={() => setRevokeConfirm(null)}
        />
      )}

      {showLeaveConfirm && (
        <ConfirmModal
          title="Abandonar dashboard"
          description="Vas a salir de este dashboard compartido. Se revocará tu acceso y se cerrará tu sesión."
          confirmLabel="Abandonar"
          tone="danger"
          onConfirm={async () => {
            await handleLeaveDashboard();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  );
}
