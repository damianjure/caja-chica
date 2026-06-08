import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MaintenanceSection } from "./dashboard/tabs/configuracion/MaintenanceSection";
import { EmailSection } from "./dashboard/tabs/configuracion/EmailSection";
import { EmailLogView } from "./dashboard/tabs/configuracion/EmailLogView";
import {
  Ban,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  MailCheck,
  Pause,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  api,
  AdminDashboardsTree,
  AdminDashboardTreeNode,
  AdminUserDetail,
  AppInvitation,
  AppRole,
  AppUser,
  AppUserStatus,
  AppViewer,
} from "../services/api";
import { ModalShell } from "./ui/ModalShell";
import { ConfirmModal } from "./ui/ConfirmModal";
import { APP_ROLE_LABELS, STATUS_LABELS as VOCAB_STATUS } from "../services/labels";

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
    className: "bg-amber-100 text-[var(--app-amber-text)] border-amber-300",
  },
  blocked: {
    label: "Bloqueado",
    className: "bg-red-100 text-red-800 border-red-300",
  },
  suspended: {
    label: "Suspendido (legacy)",
    className: "bg-neutral-200 text-[var(--app-text-2)] border-neutral-400",
  },
};

function relativeTimeShort(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

const INVITATION_STATUS_LABELS: Record<string, string> = {
  all: "Activas",
  pending: "Pendiente",
  accepted: "Aceptada",
  revoked: "Revocada",
  expired: "Vencida",
  deleted: "Eliminada",
};

export function AdminPanel({ viewer }: AdminPanelProps) {
  const [adminTab, setAdminTab] = useState<"usuarios" | "sistema">("usuarios");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tree, setTree] = useState<AdminDashboardsTree | null>(null);
  const [invitations, setInvitations] = useState<AppInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [invitationStatusFilter, setInvitationStatusFilter] = useState<string>("all");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const isSuperadmin = viewer.role === "superadmin";

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [loadedUsers, loadedTree, loadedInvitations] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminDashboardsTree(),
        api.getAdminInvitations(),
      ]);
      setUsers(loadedUsers);
      setTree(loadedTree);
      setInvitations(loadedInvitations);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar los datos de admin.");
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
        toast.error(err instanceof Error ? err.message : "No se pudo cargar el detalle."),
      )
      .finally(() => setDetailLoading(false));
  }, [selectedUserId]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const invitation = await api.inviteUser(email.trim(), role);
      setInvitations((prev) => [
        invitation,
        ...prev.filter((item) => item.id !== invitation.id),
      ]);
      setEmail("");
      setRole("member");
      toast.success(`Invitación creada para ${invitation.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (invitation: AppInvitation) => {
    await navigator.clipboard.writeText(invitation.invite_url);
    toast.success(`Link copiado para ${invitation.email}`);
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
      toast.error(err instanceof Error ? err.message : "No se pudo revocar la invitación.");
    }
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    try {
      await api.deleteInvitation(invitationId);
      setInvitations((prev) => prev.filter((item) => item.id !== invitationId));
      toast.success("Invitación eliminada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar la invitación.");
    }
  };

  const handleResend = async (invitation: AppInvitation) => {
    setResendingId(invitation.id);
    try {
      await api.resendInvitation(invitation.id);
      const now = new Date().toISOString();
      setInvitations((prev) =>
        prev.map((item) =>
          item.id === invitation.id ? { ...item, last_reminder_at: now } : item,
        ),
      );
      toast.success(`Invitación reenviada a ${invitation.email}`);
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error("La invitación ya fue aceptada o fue revocada.");
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo reenviar la invitación.");
      }
    } finally {
      setResendingId(null);
    }
  };

  const requestStatusChange = (
    newStatus: ActionableStatus,
    userId?: string,
    userEmail?: string,
  ) => {
    const targetId = userId ?? detail?.user.user_id;
    const target = userEmail ?? detail?.user.email;
    if (!targetId || !target) return;
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
          <p>El usuario se desconecta y no puede volver a entrar hasta que lo actives.</p>
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
        setActingKey("status");
        try {
          await api.setUserStatus(targetId, newStatus, reason);
          setUsers((prev) =>
            prev.map((u) => (u.user_id === targetId ? { ...u, status: newStatus } : u)),
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
          toast.success(`${target} → ${newStatus}`);
          setPendingConfirm(null);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
        } finally {
          setActingKey(null);
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
        setActingKey("logout");
        try {
          await api.forceLogoutUser(detail.user.user_id);
          toast.success("Sesiones cerradas");
          setPendingConfirm(null);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo forzar logout.");
        } finally {
          setActingKey(null);
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
        setActingKey("role");
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
          toast.success(`Rol actualizado → ${newRole}`);
          setPendingConfirm(null);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo cambiar rol.");
        } finally {
          setActingKey(null);
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
        setActingKey("telegram");
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
          toast.success("Vínculo revocado");
          setPendingConfirm(null);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo revocar.");
        } finally {
          setActingKey(null);
        }
      },
    });
  };

  const requestDeleteAccount = () => {
    if (!detail) return;
    const target = detail.user.email;
    const targetId = detail.user.user_id;
    setPendingConfirm({
      title: "Eliminar cuenta definitivamente",
      description: `Vas a eliminar la cuenta de ${target}. Es irreversible.`,
      details: (
        <p>Se borra el acceso (login y membresías). Los movimientos y empresas que cargó se conservan. El email podrá invitarse de nuevo más adelante.</p>
      ),
      confirmLabel: "Eliminar cuenta",
      tone: "danger",
      requireText: target,
      run: async () => {
        setActingKey("delete");
        try {
          await api.deleteUserAccount(targetId);
          setUsers((prev) => prev.filter((u) => u.user_id !== targetId));
          setSelectedUserId(null);
          setDetail(null);
          toast.success(`Cuenta de ${target} eliminada`);
          setPendingConfirm(null);
        } catch (err: any) {
          const code = err?.body?.error ?? err?.message;
          const msg =
            code === "last_superadmin" ? "No podés eliminar al único superadmin."
            : code === "cannot_delete_self" ? "No podés eliminar tu propia cuenta."
            : "No se pudo eliminar la cuenta.";
          toast.error(msg);
        } finally {
          setActingKey(null);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
    {/* Admin tabs */}
    <div className="flex gap-1 border-b border-[var(--app-border)]">
      {(["usuarios", "sistema"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setAdminTab(tab)}
          className={[
            "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
            adminTab === tab
              ? "border-[var(--app-text-1)] text-[var(--app-text-1)]"
              : "border-transparent text-[var(--app-text-3)] hover:text-[var(--app-text-2)]",
          ].join(" ")}
        >
          {tab === "usuarios" ? "Usuarios" : "Sistema"}
        </button>
      ))}
    </div>

    {adminTab === "usuarios" && (
    <section className="bg-white border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)] space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Super Admin · Cuentas y dashboards</h2>
          <p className="text-sm text-[var(--app-text-2)]">
            Cada invitación crea una cuenta independiente con su propio dashboard. Solo vos ves esta tabla.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(160px,200px)_auto] items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          aria-label="Email a invitar"
          className="rounded-md border border-[var(--app-border-strong)] px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          aria-label="Rol de la invitación"
          className="rounded-md border border-[var(--app-border-strong)] px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--app-text-1)] bg-white"
        >
          <option value="member">{APP_ROLE_LABELS.member}</option>
          <option value="admin">{APP_ROLE_LABELS.admin}</option>
          {isSuperadmin && <option value="superadmin">{APP_ROLE_LABELS.superadmin}</option>}
        </select>
        <button
          type="button"
          onClick={() => void handleInvite()}
          disabled={submitting || !email.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-5 py-3 text-[var(--app-strong-text)] font-medium hover:border-[var(--app-text-2)] disabled:opacity-50"
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
        <div className="py-8 flex items-center justify-center text-[var(--app-text-3)]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DashboardTreeView
            tree={tree}
            viewerId={viewer.id}
            onSelectUser={setSelectedUserId}
          />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
              Invitaciones
            </h3>

            {/* Status filter chips — REQ-S4.3 */}
            <div
              role="group"
              aria-label="Filtrar por estado"
              className="flex flex-wrap gap-2"
            >
              {(["all", "pending", "accepted", "revoked", "expired", "deleted"] as const).map((status) => {
                const isSelected = invitationStatusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setInvitationStatusFilter(status)}
                    className={[
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      isSelected
                        ? "bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border-[var(--app-strong-surface)]"
                        : "bg-white text-[var(--app-text-2)] border-[var(--app-border-strong)] hover:border-neutral-500",
                    ].join(" ")}
                  >
                    {INVITATION_STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {invitations
                .filter((inv) => {
                  if (invitationStatusFilter === "all") return inv.status === "pending";
                  if (invitationStatusFilter === "expired") {
                    return inv.status === "pending" && inv.expires_at != null && inv.expires_at < new Date().toISOString();
                  }
                  if (invitationStatusFilter === "deleted") return inv.user_deleted === true;
                  if (invitationStatusFilter === "accepted") return inv.status === "accepted" && !inv.user_deleted;
                  return inv.status === invitationStatusFilter;
                })
                .map((invitation) => {
                  const canResend = invitation.status !== "accepted" && invitation.status !== "revoked";
                  const isResending = resendingId === invitation.id;
                  const reminderText = relativeTimeShort(invitation.last_reminder_at);
                  return (
                    <div
                      key={invitation.id}
                      className="border border-[var(--app-border-strong)] rounded-xl px-4 py-3 space-y-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[var(--app-text-1)] [overflow-wrap:anywhere]">
                            {invitation.email}
                          </div>
                          <div className="text-xs text-[var(--app-text-2)]">
                            {APP_ROLE_LABELS[invitation.role as AppRole] ?? invitation.role} · {VOCAB_STATUS[invitation.status as keyof typeof VOCAB_STATUS] ?? invitation.status}
                          </div>
                          {reminderText && (
                            <div className="text-xs text-[var(--app-text-3)] mt-0.5">
                              Último recordatorio: {reminderText}
                            </div>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {invitation.invited_by_email && (
                              <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-2 py-0.5 text-[11px] text-[var(--app-text-2)]">
                                Invitada por {invitation.invited_by_email}
                              </span>
                            )}
                            {invitation.membership_of && invitation.membership_of.length > 0 ? (
                              <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-2 py-0.5 text-[11px] text-[var(--app-text-2)]">
                                Miembro de: {invitation.membership_of.join(", ")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-2 py-0.5 text-[11px] text-[var(--app-text-3)]">
                                Cuenta independiente
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Resend button — hidden for accepted invitations */}
                          {invitation.status !== "accepted" && (
                            <button
                              type="button"
                              onClick={() => canResend && !isResending ? void handleResend(invitation) : undefined}
                              disabled={!canResend || isResending}
                              className="w-11 h-11 flex items-center justify-center rounded-md border border-[var(--app-border-strong)] hover:border-[var(--app-text-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label={`Reenviar invitación a ${invitation.email}`}
                              title="Reenviar"
                            >
                              {isResending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <MailCheck className="w-4 h-4" />
                              }
                            </button>
                          )}
                          {invitation.status !== "accepted" && (
                            <button
                              type="button"
                              onClick={() => void handleCopy(invitation)}
                              className="w-11 h-11 flex items-center justify-center rounded-md border border-[var(--app-border-strong)] hover:border-[var(--app-text-2)]"
                              aria-label={`Copiar link de ${invitation.email}`}
                              title="Copiar link"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}
                          {invitation.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => void handleRevokeInvitation(invitation.id)}
                              className="w-11 h-11 flex items-center justify-center rounded-md border border-red-300 text-[var(--chart-expense)] hover:border-red-400"
                              aria-label={`Revocar invitación de ${invitation.email}`}
                              title="Revocar"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {(invitation.status === "revoked" || invitation.status === "expired" || invitation.user_deleted) && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteInvitation(invitation.id)}
                              className="w-11 h-11 flex items-center justify-center rounded-md border border-red-300 text-[var(--chart-expense)] hover:border-red-400"
                              aria-label={`Eliminar invitación de ${invitation.email}`}
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {invitation.status !== "accepted" && (
                        <div className="text-xs text-[var(--app-text-2)] [overflow-wrap:anywhere] leading-relaxed">
                          {invitation.invite_url}
                        </div>
                      )}
                    </div>
                  );
                })}
              {invitations.filter((inv) => {
                if (invitationStatusFilter === "all") return inv.status === "pending";
                if (invitationStatusFilter === "expired") {
                  return inv.status === "pending" && inv.expires_at != null && inv.expires_at < new Date().toISOString();
                }
                if (invitationStatusFilter === "deleted") return inv.user_deleted === true;
                if (invitationStatusFilter === "accepted") return inv.status === "accepted" && !inv.user_deleted;
                return inv.status === invitationStatusFilter;
              }).length === 0 && (
                <p className="text-sm text-[var(--app-text-2)]">
                  {invitationStatusFilter === "all"
                    ? "No hay invitaciones pendientes."
                    : `No hay invitaciones con estado "${INVITATION_STATUS_LABELS[invitationStatusFilter]}".`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedUserId && (
        <UserDetailModal
          loading={detailLoading}
          detail={detail}
          viewerId={viewer.id}
          actingKey={actingKey}
          onClose={() => setSelectedUserId(null)}
          onStatusChange={requestStatusChange}
          onForceLogout={requestForceLogout}
          onRoleChange={requestRoleChange}
          onRevokeTelegramLink={requestRevokeTelegramLink}
          onDeleteAccount={requestDeleteAccount}
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
    )}

    {adminTab === "sistema" && (
      <>
        <MaintenanceSection
          showNotice={(msg) => toast.success(msg)}
          setError={(msg) => { if (msg) toast.error(msg); }}
        />

        {isSuperadmin && (
          <>
            <EmailSection />
            <section className="bg-white border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
              <header className="mb-6">
                <h2 className="text-xl font-bold text-[var(--app-text-1)] tracking-tight">Log de emails</h2>
                <p className="text-sm text-[var(--app-text-3)] mt-1.5 leading-relaxed max-w-prose">
                  Registro de todos los emails transaccionales enviados por el sistema.
                </p>
              </header>
              <EmailLogView />
            </section>
          </>
        )}
      </>
    )}
    </div>
  );
}

interface DashboardTreeViewProps {
  tree: AdminDashboardsTree | null;
  viewerId: string;
  onSelectUser: (userId: string) => void;
}

function DashboardTreeView({ tree, viewerId, onSelectUser }: DashboardTreeViewProps) {
  if (!tree) {
    return (
      <div className="py-8 flex items-center justify-center text-[var(--app-text-3)]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const { dashboards, orphan_users, pending_app_invitations } = tree;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
          Dashboards y miembros
        </h3>
        <span className="text-xs text-[var(--app-text-3)]">{dashboards.length === 1 ? "1 dashboard" : `${dashboards.length} dashboards`}</span>
      </div>

      <ul className="space-y-3">
        {dashboards.map((node) => (
          <DashboardTreeNode
            key={node.dashboard_id}
            node={node}
            viewerId={viewerId}
            onSelectUser={onSelectUser}
          />
        ))}
      </ul>

      {orphan_users.length > 0 && (
        <details className="border border-dashed border-[var(--app-border-strong)] rounded-xl px-4 py-3 bg-[var(--app-surface-1)]">
          <summary className="cursor-pointer text-sm font-medium text-[var(--app-text-2)]">
            Cuentas sin dashboard ({orphan_users.length})
          </summary>
          <ul className="mt-3 space-y-1.5">
            {orphan_users.map((u) => (
              <li key={u.user_id} className="text-sm text-[var(--app-text-2)] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectUser(u.user_id)}
                  className="text-left hover:underline truncate"
                >
                  {u.email}
                </button>
                <span className="text-xs text-[var(--app-text-3)]">{APP_ROLE_LABELS[u.role]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {pending_app_invitations.length > 0 && (
        <details className="border border-dashed border-amber-300 rounded-xl px-4 py-3 bg-[var(--app-amber-surface)]">
          <summary className="cursor-pointer text-sm font-medium text-[var(--app-text-2)]">
            Invitaciones del sistema pendientes ({pending_app_invitations.length})
          </summary>
          <ul className="mt-3 space-y-1.5">
            {pending_app_invitations.map((inv) => (
              <li key={inv.id} className="text-sm text-[var(--app-text-2)] flex items-center justify-between gap-2">
                <span className="truncate">{inv.email}</span>
                <span className="text-xs text-[var(--app-text-3)]">{APP_ROLE_LABELS[inv.role]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface DashboardTreeNodeProps {
  node: AdminDashboardTreeNode;
  viewerId: string;
  onSelectUser: (userId: string) => void;
  key?: string;
}

function DashboardTreeNode({ node, viewerId, onSelectUser }: DashboardTreeNodeProps) {
  const isViewerOwner = node.owner?.user_id === viewerId;
  const totalCount = node.members.length + node.pending_invitations.length;

  return (
    <li className="border border-[var(--app-border)] rounded-xl bg-white shadow-[var(--app-shadow-sm)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {node.owner ? (
            <>
              <button
                type="button"
                onClick={() => onSelectUser(node.owner!.user_id)}
                className="text-sm font-semibold text-[var(--app-text-1)] truncate hover:underline"
                title="Ver detalle"
              >
                {node.owner.email ?? "(sin email)"}
              </button>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
                Dueño
              </span>
              {node.owner.app_role && APP_ROLE_LABELS[node.owner.app_role] !== "Dueño" && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-400 text-[var(--app-text-2)] bg-[var(--app-surface-2)]">
                  {APP_ROLE_LABELS[node.owner.app_role]}
                </span>
              )}
              {isViewerOwner && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-600 text-white">
                  Vos
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-[var(--app-text-3)] italic">Sin dueño</span>
          )}
        </div>
        <div className="mt-1 text-xs text-[var(--app-text-2)] truncate">
          {node.dashboard_name} · {totalCount} {totalCount === 1 ? "miembro" : "miembros"}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="px-4 py-3 text-xs text-[var(--app-text-3)] italic">Sin miembros adicionales.</div>
      ) : (
        <ul className="divide-y divide-neutral-100/20">
          {node.members.map((m) => (
            <li key={`m-${m.user_id}`} className="px-4 py-2 flex items-center gap-2 min-w-0">
              <span className="text-[var(--app-text-3)] text-xs">└─</span>
              <button
                type="button"
                onClick={() => onSelectUser(m.user_id)}
                className="text-sm text-[var(--app-text-1)] truncate hover:underline flex-1 text-left"
              >
                {m.email ?? "(sin email)"}
              </button>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-neutral-400 text-[var(--app-text-1)] bg-[var(--app-surface-2)]">
                {m.dashboard_role === "editor" ? "Puede editar" : "Puede ver"}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  m.membership_status === "active"
                    ? "bg-green-100 text-green-800 border-green-300"
                    : m.membership_status === "revoked"
                      ? "bg-red-100 text-red-800 border-red-300"
                      : "bg-neutral-200 text-[var(--app-text-2)] border-neutral-400"
                }`}
              >
                {m.membership_status === "active"
                  ? "Activo"
                  : m.membership_status === "revoked"
                    ? "Sin acceso"
                    : m.membership_status}
              </span>
            </li>
          ))}
          {node.pending_invitations.map((inv) => (
            <li key={`i-${inv.id}`} className="px-4 py-2 flex items-center gap-2 min-w-0 bg-[var(--app-amber-surface)]/30">
              <span className="text-[var(--app-text-3)] text-xs">└─</span>
              <span className="text-sm text-[var(--app-text-1)] truncate flex-1 italic">{inv.email}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-neutral-400 text-[var(--app-text-1)] bg-white">
                {inv.role === "editor" ? "Puede editar" : "Puede ver"}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-[var(--app-amber-text)] border border-amber-300">
                Invitado
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface UsersListProps {
  users: AppUser[];
  viewerId: string;
  isSuperadmin: boolean;
  actingKey: string | null;
  onSelect: (userId: string) => void;
  onQuickStatus: (userId: string, email: string, newStatus: ActionableStatus) => void;
}

function UsersList({ users, viewerId, isSuperadmin, actingKey, onSelect, onQuickStatus }: UsersListProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
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
              className="border border-[var(--app-border-strong)] rounded-xl px-4 py-3 min-w-0 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--app-text-1)] [overflow-wrap:anywhere]">
                    {user.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-[var(--app-text-3)]">(vos)</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--app-text-2)] mt-1 flex items-center gap-2 flex-wrap">
                    <span>{APP_ROLE_LABELS[user.role as AppRole] ?? user.role}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs border ${badge.className}`}
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
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border-strong)] px-3 py-2 text-sm font-medium hover:border-[var(--app-text-2)]"
                    aria-label={`Administrar ${user.email}`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Administrar
                  </button>
                ) : (
                  <span
                    className="shrink-0 text-xs text-[var(--app-text-3)] italic"
                    title="No podés administrar tu propia cuenta"
                  >
                    protegido
                  </span>
                )}
              </div>
              {clickable && (
                <div className="flex gap-2" role="group" aria-label={`Estado de ${user.email}`}>
                  {([
                    { status: "active" as const, icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Activar", tone: "green" },
                    { status: "paused" as const, icon: <Pause className="w-3.5 h-3.5" />, label: "Pausar", tone: "amber" },
                    { status: "blocked" as const, icon: <Ban className="w-3.5 h-3.5" />, label: "Bloquear", tone: "red" },
                  ] as const).map(({ status, icon, label, tone }) => {
                    const isCurrent = user.status === status;
                    const isActing = actingKey === "status";
                    const activeClass = {
                      green: "bg-green-600 border-green-600 text-white ring-2 ring-green-200",
                      amber: "bg-[var(--app-amber-surface)]0 border-amber-500 text-white ring-2 ring-amber-200",
                      red: "bg-red-600 border-red-600 text-white ring-2 ring-red-200",
                    }[tone];
                    const inactiveClass = {
                      green: "bg-white border-green-300 text-green-800 hover:border-green-400",
                      amber: "bg-white border-amber-300 text-[var(--app-amber-text)] hover:border-amber-400",
                      red: "bg-white border-red-300 text-red-800 hover:border-red-400",
                    }[tone];
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => !isCurrent && onQuickStatus(user.user_id, user.email, status)}
                        disabled={isActing || isCurrent}
                        aria-pressed={isCurrent}
                        aria-label={isCurrent ? `${label} (estado actual)` : `Cambiar a ${label}`}
                        className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60 disabled:cursor-default ${isCurrent ? activeClass : inactiveClass}`}
                      >
                        {isActing && isCurrent ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          icon
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="text-sm text-[var(--app-text-2)]">Todavía no hay usuarios activos.</p>
        )}
      </div>
    </div>
  );
}

interface UserDetailModalProps {
  loading: boolean;
  detail: AdminUserDetail | null;
  viewerId: string;
  actingKey: string | null;
  onClose: () => void;
  onStatusChange: (status: ActionableStatus) => void;
  onForceLogout: () => void;
  onRoleChange: (role: AppRole) => void;
  onRevokeTelegramLink: (linkId: string, chatId: number | null) => void;
  onDeleteAccount: () => void;
}

function UserDetailModal({
  loading,
  detail,
  viewerId,
  actingKey,
  onClose,
  onStatusChange,
  onForceLogout,
  onRoleChange,
  onRevokeTelegramLink,
  onDeleteAccount,
}: UserDetailModalProps) {
  const acting = actingKey !== null;
  // Self-deletion and deleting a superadmin are blocked server-side
  // (cannot_delete_self / last_superadmin). Hide the affordance so the modal
  // can't even be opened for those targets.
  const canDelete = !!detail && detail.user.user_id !== viewerId && detail.user.role !== "superadmin";
  return (
    <ModalShell
      title={detail?.user.email ?? "Detalle de usuario"}
      description={detail ? `${APP_ROLE_LABELS[detail.user.role as AppRole] ?? detail.user.role} · ${statusBadge[detail.user.status]?.label ?? detail.user.status}` : undefined}
      onClose={onClose}
      size="lg"
    >
      {loading || !detail ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--app-text-3)]" />
        </div>
      ) : (
        <div className="space-y-6">
          {detail.user.status_reason && (
            <p className="text-xs text-[var(--app-text-2)] italic">
              Motivo del último cambio: {detail.user.status_reason}
            </p>
          )}
          {detail.user.status_changed_at && (
            <p className="text-xs text-[var(--app-text-3)] -mt-4">
              Último cambio: {new Date(detail.user.status_changed_at).toLocaleString()}
            </p>
          )}

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <Stat label="Movimientos" value={detail.stats.movimientos} />
            <Stat label="Dashboards" value={detail.dashboards.length} />
            <Stat label="Telegram" value={detail.telegramLinks.length} />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
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
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
              Sesión
            </h3>
            <button
              type="button"
              onClick={onForceLogout}
              disabled={acting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--app-border-strong)] px-3 py-2.5 text-sm font-medium text-[var(--app-text-1)] hover:border-[var(--app-text-2)] disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              Forzar logout (cerrar sesiones)
            </button>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
              Rol del sistema
            </h3>
            <div className="flex gap-2 flex-wrap">
              {(["member", "admin", "superadmin"] as AppRole[]).map((r) => {
                const isCurrent = detail.user.role === r;
                const isRoleActing = actingKey === "role";
                const roleColor = {
                  member: {
                    active: "bg-[var(--app-strong-surface)] border-[var(--app-strong-surface)] text-[var(--app-strong-text)]",
                    inactive: "bg-white border-[var(--app-border-strong)] text-[var(--app-text-2)] hover:border-neutral-500",
                  },
                  admin: {
                    active: "bg-blue-600 border-blue-600 text-white",
                    inactive: "bg-white border-blue-300 text-blue-800 hover:border-blue-500",
                  },
                  superadmin: {
                    active: "bg-red-600 border-red-600 text-white",
                    inactive: "bg-white border-red-300 text-red-800 hover:border-red-500",
                  },
                }[r];
                const roleLabel = APP_ROLE_LABELS[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => !isCurrent && onRoleChange(r)}
                    disabled={acting || isCurrent}
                    aria-pressed={isCurrent}
                    className={`px-3 py-2 rounded-xl border text-sm font-medium transition inline-flex items-center gap-1.5 disabled:cursor-default ${
                      isCurrent ? roleColor.active : `${roleColor.inactive} disabled:opacity-50`
                    }`}
                  >
                    {isRoleActing && isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isCurrent ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    {roleLabel}
                  </button>
                );
              })}
            </div>
          </section>

          {detail.telegramLinks.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-text-2)]">
                Vínculos de Telegram
              </h3>
              <div className="space-y-2">
                {detail.telegramLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 border border-[var(--app-border-strong)] rounded-xl px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-[var(--app-text-1)]">
                        chat {link.chat_id ?? "—"}
                      </div>
                      <div className="text-xs text-[var(--app-text-2)]">{link.status}</div>
                    </div>
                    {link.status === "active" && (
                      <button
                        type="button"
                        onClick={() => onRevokeTelegramLink(link.id, link.chat_id)}
                        disabled={acting}
                        className="p-2 rounded-lg border border-red-300 text-[var(--chart-expense)] hover:border-red-400 disabled:opacity-50"
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

          {canDelete && (
            <section className="space-y-3 rounded-xl border border-[var(--app-red-border)] bg-[var(--app-red-surface)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-red-text)]">
                Zona peligrosa
              </h3>
              <p className="text-xs text-[var(--app-text-2)]">
                Eliminar la cuenta borra el acceso (login y membresías). Los movimientos y empresas se conservan. Irreversible.
              </p>
              <button
                type="button"
                onClick={onDeleteAccount}
                disabled={acting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--app-red-text)] px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar cuenta definitivamente
              </button>
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
    <div className="border border-[var(--app-border-strong)] rounded-xl py-3 px-2">
      <div className="text-2xl font-bold text-[var(--app-text-1)]">{value}</div>
      <div className="text-xs uppercase tracking-widest text-[var(--app-text-2)] mt-0.5">
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
    amber: "bg-[var(--app-amber-surface)]0 border-amber-500 text-white shadow-md ring-2 ring-amber-200",
    red: "bg-red-600 border-red-600 text-white shadow-md ring-2 ring-red-200",
  }[tone];
  const inactiveClass = {
    green: "bg-white border-green-300 text-green-800 hover:border-green-400",
    amber: "bg-white border-amber-300 text-[var(--app-amber-text)] hover:border-amber-400",
    red: "bg-white border-red-300 text-red-800 hover:border-red-400",
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
