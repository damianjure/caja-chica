import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  Pause,
  Shield,
  ShieldCheck,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";

import {
  api,
  AdminUserDetail,
  AppInvitation,
  AppRole,
  AppUser,
  AppUserStatus,
  AppViewer,
} from "../services/api";

interface AdminPanelProps {
  viewer: AppViewer;
}

type ActionableStatus = Exclude<AppUserStatus, "suspended">;

const statusBadge: Record<AppUserStatus, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-green-100 text-green-700 border-green-200" },
  paused: { label: "Pausado", className: "bg-amber-100 text-amber-700 border-amber-200" },
  blocked: { label: "Bloqueado", className: "bg-red-100 text-red-700 border-red-200" },
  suspended: { label: "Suspendido (legacy)", className: "bg-neutral-200 text-neutral-700 border-neutral-300" },
};

export function AdminPanel({ viewer }: AdminPanelProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<AppInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const isSuperadmin = viewer.role === "superadmin";

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedUsers, loadedInvitations] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminInvitations(),
      ]);
      setUsers(loadedUsers);
      setInvitations(loadedInvitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos de admin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .getAdminUserDetail(selectedUserId)
      .then(setDetail)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "No se pudo cargar el detalle."),
      )
      .finally(() => setDetailLoading(false));
  }, [selectedUserId]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const invitation = await api.inviteUser(email.trim(), role);
      setInvitations((prev) => [invitation, ...prev.filter((item) => item.id !== invitation.id)]);
      setEmail("");
      setRole("member");
      showNotice(`Invitación creada para ${invitation.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (invitation: AppInvitation) => {
    await navigator.clipboard.writeText(invitation.invite_url);
    showNotice(`Link copiado para ${invitation.email}`);
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      await api.revokeInvitation(invitationId);
      setInvitations((prev) =>
        prev.map((item) =>
          item.id === invitationId ? { ...item, status: "revoked" } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar la invitación.");
    }
  };

  const handleStatusChange = async (newStatus: ActionableStatus) => {
    if (!detail) return;
    const targetEmail = detail.user.email;
    const verb =
      newStatus === "paused"
        ? "pausar"
        : newStatus === "blocked"
          ? "bloquear"
          : "activar";
    if (!window.confirm(`¿Seguro que querés ${verb} a ${targetEmail}?`)) return;
    let reason: string | undefined;
    if (newStatus !== "active") {
      const r = window.prompt(`Motivo (opcional) para ${verb} a ${targetEmail}:`, "");
      reason = r?.trim() || undefined;
    }
    setActing(true);
    try {
      await api.setUserStatus(detail.user.user_id, newStatus, reason);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === detail.user.user_id ? { ...u, status: newStatus } : u)),
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                status: newStatus,
                status_reason: reason ?? null,
                status_changed_at: new Date().toISOString(),
              },
            }
          : prev,
      );
      showNotice(`${targetEmail} → ${newStatus}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
    } finally {
      setActing(false);
    }
  };

  const handleForceLogout = async () => {
    if (!detail) return;
    if (!window.confirm(`¿Cerrar todas las sesiones activas de ${detail.user.email}?`)) return;
    setActing(true);
    try {
      await api.forceLogoutUser(detail.user.user_id);
      showNotice("Sesiones cerradas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo forzar logout.");
    } finally {
      setActing(false);
    }
  };

  const handleRoleChange = async (newRole: AppRole) => {
    if (!detail) return;
    if (!window.confirm(`Cambiar rol de ${detail.user.email} a ${newRole}?`)) return;
    setActing(true);
    try {
      await api.setUserRole(detail.user.user_id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === detail.user.user_id ? { ...u, role: newRole } : u)),
      );
      setDetail((prev) =>
        prev ? { ...prev, user: { ...prev.user, role: newRole } } : prev,
      );
      showNotice(`Rol actualizado → ${newRole}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar rol.");
    } finally {
      setActing(false);
    }
  };

  const handleRevokeTelegramLink = async (linkId: string) => {
    if (!detail) return;
    if (!window.confirm("¿Revocar este vínculo de Telegram?")) return;
    setActing(true);
    try {
      await api.adminRevokeTelegramLink(linkId);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              telegramLinks: prev.telegramLinks.map((l) =>
                l.id === linkId ? { ...l, status: "revoked" } : l,
              ),
            }
          : prev,
      );
      showNotice("Vínculo revocado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    } finally {
      setActing(false);
    }
  };

  return (
    <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-neutral-900 text-white">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Administración</h2>
          <p className="text-sm text-neutral-500">
            Gestioná usuarios autorizados e invitaciones activas.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
          {isSuperadmin && <option value="superadmin">superadmin</option>}
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

      {loading ? (
        <div className="py-8 flex items-center justify-center text-neutral-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Usuarios
            </h3>
            <div className="space-y-3">
              {users.map((user) => {
                const badge = statusBadge[user.status] ?? statusBadge.active;
                const isSelf = user.user_id === viewer.id;
                return (
                  <button
                    key={user.user_id}
                    onClick={() => isSuperadmin && !isSelf && setSelectedUserId(user.user_id)}
                    disabled={!isSuperadmin || isSelf}
                    className={`w-full text-left border border-neutral-200 rounded-2xl px-4 py-3 min-w-0 transition ${
                      isSuperadmin && !isSelf ? "hover:border-neutral-400 hover:bg-neutral-50 cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className="min-w-0 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">
                          {user.email}
                          {isSelf && <span className="ml-2 text-xs text-neutral-400">(vos)</span>}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span>{user.role}</span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {users.length === 0 && (
                <p className="text-sm text-neutral-500">Todavía no hay usuarios activos.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Invitaciones
            </h3>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border border-neutral-200 rounded-2xl px-4 py-3 space-y-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">
                        {invitation.email}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {invitation.role} · {invitation.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void handleCopy(invitation)}
                        className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50"
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {invitation.status === "pending" && (
                        <button
                          onClick={() => void handleRevokeInvitation(invitation.id)}
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
              {invitations.length === 0 && (
                <p className="text-sm text-neutral-500">Todavía no hay invitaciones.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedUserId && (
        <UserDetailDrawer
          loading={detailLoading}
          detail={detail}
          acting={acting}
          isSuperadmin={isSuperadmin}
          onClose={() => setSelectedUserId(null)}
          onStatusChange={handleStatusChange}
          onForceLogout={handleForceLogout}
          onRoleChange={handleRoleChange}
          onRevokeTelegramLink={handleRevokeTelegramLink}
        />
      )}
    </section>
  );
}

interface UserDetailDrawerProps {
  loading: boolean;
  detail: AdminUserDetail | null;
  acting: boolean;
  isSuperadmin: boolean;
  onClose: () => void;
  onStatusChange: (status: ActionableStatus) => void;
  onForceLogout: () => void;
  onRoleChange: (role: AppRole) => void;
  onRevokeTelegramLink: (linkId: string) => void;
}

interface StatProps {
  label: string;
  value: number;
}

function UserDetailDrawer({
  loading,
  detail,
  acting,
  isSuperadmin,
  onClose,
  onStatusChange,
  onForceLogout,
  onRoleChange,
  onRevokeTelegramLink,
}: UserDetailDrawerProps) {
  if (!isSuperadmin) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative ml-auto h-full w-full sm:max-w-xl bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="font-bold text-neutral-900">Detalle de usuario</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading || !detail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          ) : (
            <>
              <header className="space-y-1">
                <div className="font-bold text-neutral-900 [overflow-wrap:anywhere]">
                  {detail.user.email}
                </div>
                <div className="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
                  <span>{detail.user.role}</span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${
                      statusBadge[detail.user.status]?.className ?? ""
                    }`}
                  >
                    {statusBadge[detail.user.status]?.label ?? detail.user.status}
                  </span>
                </div>
                {detail.user.status_reason && (
                  <p className="text-xs text-neutral-500 italic">Motivo: {detail.user.status_reason}</p>
                )}
                {detail.user.status_changed_at && (
                  <p className="text-xs text-neutral-400">
                    Último cambio: {new Date(detail.user.status_changed_at).toLocaleString()}
                  </p>
                )}
              </header>

              <section className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Movimientos" value={detail.stats.movimientos} />
                <Stat label="Dashboards" value={detail.dashboards.length} />
                <Stat label="Telegram" value={detail.telegramLinks.length} />
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                  Estado
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <ActionButton
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    label="Activar"
                    onClick={() => onStatusChange("active")}
                    disabled={acting || detail.user.status === "active"}
                    tone="green"
                  />
                  <ActionButton
                    icon={<Pause className="w-4 h-4" />}
                    label="Pausar"
                    onClick={() => onStatusChange("paused")}
                    disabled={acting || detail.user.status === "paused"}
                    tone="amber"
                  />
                  <ActionButton
                    icon={<Ban className="w-4 h-4" />}
                    label="Bloquear"
                    onClick={() => onStatusChange("blocked")}
                    disabled={acting || detail.user.status === "blocked"}
                    tone="red"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                  Sesión
                </h4>
                <ActionButton
                  icon={<LogOut className="w-4 h-4" />}
                  label="Forzar logout (cerrar sesiones)"
                  onClick={onForceLogout}
                  disabled={acting}
                  tone="neutral"
                  full
                />
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                  Rol global
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {(["member", "admin", "superadmin"] as AppRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => onRoleChange(r)}
                      disabled={acting || detail.user.role === r}
                      className={`px-3 py-2 rounded-xl border text-sm transition ${
                        detail.user.role === r
                          ? "bg-neutral-900 text-white border-neutral-900 cursor-default"
                          : "bg-white border-neutral-200 hover:border-neutral-400 disabled:opacity-50"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {r}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {detail.telegramLinks.length > 0 && (
                <section className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                    Vínculos de Telegram
                  </h4>
                  <div className="space-y-2">
                    {detail.telegramLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-3 border border-neutral-200 rounded-xl px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs text-neutral-700">chat {link.chat_id ?? "—"}</div>
                          <div className="text-xs text-neutral-500">{link.status}</div>
                        </div>
                        {link.status === "active" && (
                          <button
                            onClick={() => onRevokeTelegramLink(link.id)}
                            disabled={acting}
                            className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            title="Revocar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="border border-neutral-200 rounded-2xl py-3 px-2">
      <div className="text-2xl font-bold text-neutral-900">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-400 mt-0.5">{label}</div>
    </div>
  );
}

interface ActionButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "green" | "amber" | "red" | "neutral";
  full?: boolean;
}

function ActionButton({ icon, label, onClick, disabled, tone, full }: ActionButtonProps) {
  const toneClass = {
    green: "border-green-200 text-green-700 hover:bg-green-50",
    amber: "border-amber-200 text-amber-700 hover:bg-amber-50",
    red: "border-red-200 text-red-700 hover:bg-red-50",
    neutral: "border-neutral-200 text-neutral-700 hover:bg-neutral-50",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${toneClass} ${
        full ? "w-full" : ""
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
