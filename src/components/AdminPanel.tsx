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
import { ModalShell } from "./ui/ModalShell";
import { ConfirmModal } from "./ui/ConfirmModal";

interface AdminPanelProps {
  viewer: AppViewer;
}

type ActionableStatus = Exclude<AppUserStatus, "suspended">;

interface PendingConfirm {
  title: string;
  description: string;
  details?: ReactNode;
  confirmLabel: string;
  tone: "danger" | "neutral";
  requireText?: string;
  askReason?: boolean;
  run: (reason?: string) => Promise<void>;
}

const statusBadge: Record<
  AppUserStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Activo",
    className: "bg-green-100 text-green-800 border-green-300",
  },
  paused: {
    label: "Pausado",
    className: "bg-amber-100 text-amber-800 border-amber-300",
  },
  blocked: {
    label: "Bloqueado",
    className: "bg-red-100 text-red-800 border-red-300",
  },
  suspended: {
    label: "Suspendido (legacy)",
    className: "bg-neutral-200 text-neutral-700 border-neutral-400",
  },
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
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const isSuperadmin = viewer.role === "superadmin";

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

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
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los datos de admin.",
      );
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
      setInvitations((prev) => [
        invitation,
        ...prev.filter((item) => item.id !== invitation.id),
      ]);
      setEmail("");
      setRole("member");
      setNotice(`Invitación creada para ${invitation.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (invitation: AppInvitation) => {
    await navigator.clipboard.writeText(invitation.invite_url);
    setNotice(`Link copiado para ${invitation.email}`);
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

  const requestStatusChange = (newStatus: ActionableStatus) => {
    if (!detail) return;
    const target = detail.user.email;
    const verb =
      newStatus === "paused"
        ? "pausar"
        : newStatus === "blocked"
          ? "bloquear"
          : "activar";
    const tone = newStatus === "blocked" ? "danger" : "neutral";
    setPendingConfirm({
      title:
        newStatus === "active"
          ? "Activar usuario"
          : newStatus === "paused"
            ? "Pausar usuario"
            : "Bloquear usuario",
      description: `Vas a ${verb} a ${target}.`,
      details:
        newStatus === "blocked" ? (
          <p>
            El usuario se desconecta y no puede volver a entrar hasta que lo actives.
          </p>
        ) : newStatus === "paused" ? (
          <p>El usuario puede consultar datos pero no podrá cargar ni borrar.</p>
        ) : (
          <p>El usuario vuelve a tener acceso completo según su rol.</p>
        ),
      confirmLabel: verb.charAt(0).toUpperCase() + verb.slice(1),
      tone,
      requireText: newStatus === "blocked" ? target : undefined,
      askReason: newStatus !== "active",
      run: async (reason) => {
        setActing(true);
        try {
          await api.setUserStatus(detail.user.user_id, newStatus, reason);
          setUsers((prev) =>
            prev.map((u) =>
              u.user_id === detail.user.user_id ? { ...u, status: newStatus } : u,
            ),
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
          setNotice(`${target} → ${newStatus}`);
          setPendingConfirm(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
        } finally {
          setActing(false);
        }
      },
    });
  };

  const requestForceLogout = () => {
    if (!detail) return;
    const target = detail.user.email;
    setPendingConfirm({
      title: "Cerrar sesiones",
      description: `Vas a cerrar todas las sesiones activas de ${target}.`,
      details: (
        <p>Tendrá que loguearse de nuevo la próxima vez que entre.</p>
      ),
      confirmLabel: "Cerrar sesiones",
      tone: "danger",
      requireText: target,
      run: async () => {
        setActing(true);
        try {
          await api.forceLogoutUser(detail.user.user_id);
          setNotice("Sesiones cerradas");
          setPendingConfirm(null);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "No se pudo forzar logout.",
          );
        } finally {
          setActing(false);
        }
      },
    });
  };

  const requestRoleChange = (newRole: AppRole) => {
    if (!detail) return;
    const target = detail.user.email;
    setPendingConfirm({
      title: "Cambiar rol",
      description: `Vas a cambiar el rol de ${target} a ${newRole}.`,
      confirmLabel: "Cambiar rol",
      tone: newRole === "superadmin" ? "danger" : "neutral",
      requireText: newRole === "superadmin" ? target : undefined,
      run: async () => {
        setActing(true);
        try {
          await api.setUserRole(detail.user.user_id, newRole);
          setUsers((prev) =>
            prev.map((u) =>
              u.user_id === detail.user.user_id ? { ...u, role: newRole } : u,
            ),
          );
          setDetail((prev) =>
            prev ? { ...prev, user: { ...prev.user, role: newRole } } : prev,
          );
          setNotice(`Rol actualizado → ${newRole}`);
          setPendingConfirm(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo cambiar rol.");
        } finally {
          setActing(false);
        }
      },
    });
  };

  const requestRevokeTelegramLink = (linkId: string, chatId: number | null) => {
    if (!detail) return;
    setPendingConfirm({
      title: "Revocar vínculo de Telegram",
      description: `Vas a revocar el vínculo del chat ${chatId ?? "—"}.`,
      details: <p>El bot dejará de aceptar comandos de ese chat hasta que se vincule de nuevo.</p>,
      confirmLabel: "Revocar",
      tone: "danger",
      run: async () => {
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
          setNotice("Vínculo revocado");
          setPendingConfirm(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo revocar.");
        } finally {
          setActing(false);
        }
      },
    });
  };

  return (
    <section className="bg-white border border-neutral-300 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-neutral-900 text-white">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Administración</h2>
          <p className="text-sm text-neutral-600">
            Gestioná usuarios autorizados e invitaciones activas.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Descartar error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          aria-label="Email a invitar"
          className="rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          aria-label="Rol de la invitación"
          className="rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
          {isSuperadmin && <option value="superadmin">superadmin</option>}
        </select>
        <button
          type="button"
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
          <UsersList
            users={users}
            viewerId={viewer.id}
            isSuperadmin={isSuperadmin}
            onSelect={setSelectedUserId}
          />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-600">
              Invitaciones
            </h3>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border border-neutral-300 rounded-2xl px-4 py-3 space-y-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">
                        {invitation.email}
                      </div>
                      <div className="text-xs text-neutral-600">
                        {invitation.role} · {invitation.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleCopy(invitation)}
                        className="p-2 rounded-xl border border-neutral-300 hover:bg-neutral-50"
                        aria-label={`Copiar link de ${invitation.email}`}
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {invitation.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => void handleRevokeInvitation(invitation.id)}
                          className="p-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50"
                          aria-label={`Revocar invitación de ${invitation.email}`}
                          title="Revocar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-600 [overflow-wrap:anywhere] leading-relaxed">
                    {invitation.invite_url}
                  </div>
                </div>
              ))}
              {invitations.length === 0 && (
                <p className="text-sm text-neutral-600">Todavía no hay invitaciones.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedUserId && (
        <UserDetailModal
          loading={detailLoading}
          detail={detail}
          acting={acting}
          onClose={() => setSelectedUserId(null)}
          onStatusChange={requestStatusChange}
          onForceLogout={requestForceLogout}
          onRoleChange={requestRoleChange}
          onRevokeTelegramLink={requestRevokeTelegramLink}
        />
      )}

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          description={pendingConfirm.description}
          details={pendingConfirm.details}
          confirmLabel={pendingConfirm.confirmLabel}
          tone={pendingConfirm.tone}
          requireText={pendingConfirm.requireText}
          askReason={pendingConfirm.askReason}
          onConfirm={pendingConfirm.run}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </section>
  );
}

interface UsersListProps {
  users: AppUser[];
  viewerId: string;
  isSuperadmin: boolean;
  onSelect: (userId: string) => void;
}

function UsersList({ users, viewerId, isSuperadmin, onSelect }: UsersListProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-600">
        Usuarios
      </h3>
      <div className="space-y-3">
        {users.map((user) => {
          const badge = statusBadge[user.status] ?? statusBadge.active;
          const isSelf = user.user_id === viewerId;
          const clickable = isSuperadmin && !isSelf;
          return (
            <div
              key={user.user_id}
              className="border border-neutral-300 rounded-2xl px-4 py-3 min-w-0 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">
                  {user.email}
                  {isSelf && (
                    <span className="ml-2 text-xs text-neutral-500">(vos)</span>
                  )}
                </div>
                <div className="text-xs text-neutral-600 mt-1 flex items-center gap-2 flex-wrap">
                  <span>{user.role}</span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${badge.className}`}
                    aria-label={`Estado: ${badge.label}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect(user.user_id)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 hover:border-neutral-400"
                  aria-label={`Administrar ${user.email}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Administrar
                </button>
              ) : (
                <span
                  className="shrink-0 text-xs text-neutral-500 italic"
                  title="No podés administrar tu propia cuenta"
                >
                  protegido
                </span>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="text-sm text-neutral-600">Todavía no hay usuarios activos.</p>
        )}
      </div>
    </div>
  );
}

interface UserDetailModalProps {
  loading: boolean;
  detail: AdminUserDetail | null;
  acting: boolean;
  onClose: () => void;
  onStatusChange: (status: ActionableStatus) => void;
  onForceLogout: () => void;
  onRoleChange: (role: AppRole) => void;
  onRevokeTelegramLink: (linkId: string, chatId: number | null) => void;
}

function UserDetailModal({
  loading,
  detail,
  acting,
  onClose,
  onStatusChange,
  onForceLogout,
  onRoleChange,
  onRevokeTelegramLink,
}: UserDetailModalProps) {
  return (
    <ModalShell
      title={detail?.user.email ?? "Detalle de usuario"}
      description={detail ? `${detail.user.role} · ${statusBadge[detail.user.status]?.label ?? detail.user.status}` : undefined}
      onClose={onClose}
      size="lg"
    >
      {loading || !detail ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {detail.user.status_reason && (
            <p className="text-xs text-neutral-600 italic">
              Motivo del último cambio: {detail.user.status_reason}
            </p>
          )}
          {detail.user.status_changed_at && (
            <p className="text-xs text-neutral-500 -mt-4">
              Último cambio: {new Date(detail.user.status_changed_at).toLocaleString()}
            </p>
          )}

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <Stat label="Movimientos" value={detail.stats.movimientos} />
            <Stat label="Dashboards" value={detail.dashboards.length} />
            <Stat label="Telegram" value={detail.telegramLinks.length} />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
              Estado
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <StatusButton
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Activo"
                active={detail.user.status === "active"}
                onClick={() => onStatusChange("active")}
                disabled={acting}
                tone="green"
              />
              <StatusButton
                icon={<Pause className="w-4 h-4" />}
                label="Pausado"
                active={detail.user.status === "paused"}
                onClick={() => onStatusChange("paused")}
                disabled={acting}
                tone="amber"
              />
              <StatusButton
                icon={<Ban className="w-4 h-4" />}
                label="Bloqueado"
                active={detail.user.status === "blocked"}
                onClick={() => onStatusChange("blocked")}
                disabled={acting}
                tone="red"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
              Sesión
            </h3>
            <button
              type="button"
              onClick={onForceLogout}
              disabled={acting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              Forzar logout (cerrar sesiones)
            </button>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
              Rol global
            </h3>
            <div className="flex gap-2 flex-wrap">
              {(["member", "admin", "superadmin"] as AppRole[]).map((r) => {
                const isCurrent = detail.user.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onRoleChange(r)}
                    disabled={acting || isCurrent}
                    aria-pressed={isCurrent}
                    className={`px-3 py-2 rounded-xl border text-sm font-medium transition inline-flex items-center gap-1.5 ${
                      isCurrent
                        ? "bg-neutral-900 text-white border-neutral-900 cursor-default"
                        : "bg-white border-neutral-300 hover:border-neutral-500 disabled:opacity-50"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {r}
                    {isCurrent && (
                      <span className="ml-1 text-[10px] uppercase tracking-widest opacity-80">
                        actual
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {detail.telegramLinks.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
                Vínculos de Telegram
              </h3>
              <div className="space-y-2">
                {detail.telegramLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 border border-neutral-300 rounded-xl px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-neutral-800">
                        chat {link.chat_id ?? "—"}
                      </div>
                      <div className="text-xs text-neutral-600">{link.status}</div>
                    </div>
                    {link.status === "active" && (
                      <button
                        type="button"
                        onClick={() => onRevokeTelegramLink(link.id, link.chat_id)}
                        disabled={acting}
                        className="p-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Revocar vínculo de chat ${link.chat_id ?? "—"}`}
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
        </div>
      )}
    </ModalShell>
  );
}

interface StatProps {
  label: string;
  value: number;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="border border-neutral-300 rounded-2xl py-3 px-2">
      <div className="text-2xl font-bold text-neutral-900">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-600 mt-0.5">
        {label}
      </div>
    </div>
  );
}

interface StatusButtonProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone: "green" | "amber" | "red";
}

function StatusButton({ icon, label, active, onClick, disabled, tone }: StatusButtonProps) {
  const activeClass = {
    green: "bg-green-600 border-green-600 text-white shadow-md ring-2 ring-green-200",
    amber: "bg-amber-500 border-amber-500 text-white shadow-md ring-2 ring-amber-200",
    red: "bg-red-600 border-red-600 text-white shadow-md ring-2 ring-red-200",
  }[tone];
  const inactiveClass = {
    green: "bg-white border-green-300 text-green-800 hover:bg-green-50",
    amber: "bg-white border-amber-300 text-amber-800 hover:bg-amber-50",
    red: "bg-white border-red-300 text-red-800 hover:bg-red-50",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? `${label} (actual)` : `Cambiar estado a ${label}`}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        active ? activeClass : inactiveClass
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && <CheckCircle2 className="w-3.5 h-3.5" />}
    </button>
  );
}
