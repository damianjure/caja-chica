import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Lock,
  Send,
  Smartphone,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type AppViewer,
  type DashboardInvitation,
  type DashboardInvitationRole,
  type DashboardMember,
  type DashboardMembersResponse,
  type MemberPermissions,
  type PersonaRecord,
  type TelegramLink,
} from "../../../../services/api";
import { DASHBOARD_ROLE_LABELS } from "../../../../services/labels";
import { ConfirmModal } from "../../../ui/ConfirmModal";

// ---------------------------------------------------------------------------
// Permission definitions (only non-default ones = require explicit grant)
// ---------------------------------------------------------------------------

interface PermDef {
  key: keyof MemberPermissions;
  label: string;
  description: string;
}

const PERM_DEFS: PermDef[] = [
  {
    key: "delete_any",
    label: "Eliminar movimientos de cualquiera",
    description:
      "Sin este permiso solo puede borrar lo que él mismo cargó. Con permiso, borra cualquier movimiento del dashboard.",
  },
  {
    key: "edit_any",
    label: "Editar movimientos de cualquiera",
    description:
      "Por defecto solo puede editar sus propios movimientos. Con este permiso, puede editar los de todos.",
  },
  {
    key: "export_drive",
    label: "Exportar a Google Drive",
    description:
      "Puede subir informes CSV/PDF a tu Drive (usa tu cuenta de Drive conectada).",
  },
  {
    key: "invite_telegram",
    label: "Invitar gente a Telegram",
    description:
      "Puede generar links de invitación para que otros vinculen el bot. Sin este permiso, solo vos generás links.",
  },
  {
    key: "manage_backups",
    label: "Gestionar backups",
    description: "Puede crear y gestionar snapshots del dashboard.",
  },
  {
    key: "restore_backups",
    label: "Restaurar desde backup",
    description: "Puede restaurar datos del dashboard desde un backup guardado.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function avatarInitial(email: string): string {
  return email.charAt(0).toUpperCase();
}

function daysUntil(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const ms = new Date(isoDate).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 0) return "vencida";
  if (days === 1) return "vence mañana";
  return `vence en ${days} días`;
}

function effectivePerm(perms: MemberPermissions | undefined, key: keyof MemberPermissions): boolean {
  return !!(perms?.[key]);
}

// ---------------------------------------------------------------------------
// Inline badge components
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner:
      "bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border-[var(--app-strong-surface)] font-semibold",
    editor:
      "bg-emerald-100 text-emerald-800 border-emerald-200 ring-1 ring-emerald-300/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
    viewer:
      "bg-[var(--app-surface-2)] text-[var(--app-text-2)] border-[var(--app-border)] ring-1 ring-neutral-300/50 dark:bg-neutral-700/50 dark:text-neutral-200 dark:border-neutral-600/40",
  };
  const labels: Record<string, string> = {
    owner: DASHBOARD_ROLE_LABELS.owner,
    editor: DASHBOARD_ROLE_LABELS.editor,
    viewer: DASHBOARD_ROLE_LABELS.viewer,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${styles[role] ?? "bg-[var(--app-surface-2)] text-[var(--app-text-3)] border-[var(--app-border)]"}`}>
      {labels[role] ?? role}
    </span>
  );
}

function StatusBadge({ status, expiresAt }: { status: string; expiresAt?: string | null }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--app-green-border)] bg-green-100 px-2 py-0.5 text-xs text-[var(--chart-income)] ring-1 ring-green-300/50 dark:bg-[var(--app-green-surface)]0/15 dark:text-green-200 dark:border-green-500/30">
        Activo
      </span>
    );
  }
  if (status === "pending" || status === "expired") {
    const label = status === "expired" ? "Invitación vencida" : `Invitado · ${daysUntil(expiresAt)}`;
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--app-amber-border)] bg-amber-100 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-300/50 dark:bg-[var(--app-amber-surface)]0/15 dark:text-amber-200 dark:border-amber-500/30">
        {label}
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--app-red-border)] bg-red-100 px-2 py-0.5 text-xs text-[var(--chart-expense)] ring-1 ring-red-300/50 dark:bg-[var(--app-red-surface)]0/15 dark:text-red-200 dark:border-red-500/30">
        Sin acceso
      </span>
    );
  }
  return null;
}

function TelegramBadge({ linked }: { linked: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${
        linked
          ? "border-blue-200 bg-blue-100 text-blue-700 ring-1 ring-blue-300/50 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30"
          : "border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text-3)] dark:bg-neutral-700/40 dark:text-[var(--app-text-3)] dark:border-neutral-600/40"
      }`}
    >
      {linked ? "Telegram vinculado" : "Sin Telegram"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Invite form
// ---------------------------------------------------------------------------

interface InviteFormProps {
  onInvited: () => void;
}

function InviteForm({ onInvited }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DashboardInvitationRole>("viewer");
  const [telegramPreauth, setTelegramPreauth] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { email: trimmed, role };
      if (telegramPreauth) body.telegram_preauth = true;
      await fetch("/api/dashboard/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      setEmail("");
      setRole("viewer");
      setTelegramPreauth(false);
      toast.success(`Invitación enviada a ${trimmed}`);
      onInvited();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
        <input
          aria-label="Email para invitar"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
          placeholder="colaborador@empresa.com"
          className="rounded-md border border-[var(--app-border)] px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--app-text-1)] text-sm dark:bg-[var(--app-surface-2)] dark:border-[var(--app-border)]"
        />
        <select
          aria-label="Rol del invitado"
          value={role}
          onChange={(e) => setRole(e.target.value as DashboardInvitationRole)}
          className="rounded-md border border-[var(--app-border)] px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--app-text-1)] bg-white text-sm dark:bg-[var(--app-surface-2)] dark:border-[var(--app-border)]"
        >
          <option value="viewer">{DASHBOARD_ROLE_LABELS.viewer} — solo lectura</option>
          <option value="editor">{DASHBOARD_ROLE_LABELS.editor} — ve y carga</option>
        </select>
        <button
          onClick={() => void handleInvite()}
          disabled={submitting || !email.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-5 py-3 text-[var(--app-strong-text)] text-sm font-medium hover:border-[var(--app-text-2)] disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Invitar
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--app-text-2)] dark:text-[var(--app-text-2)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={telegramPreauth}
          onChange={(e) => setTelegramPreauth(e.target.checked)}
          className="rounded"
        />
        Darle acceso al bot también
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telegram section inside each card body
// ---------------------------------------------------------------------------

interface TelegramCardProps {
  userId: string;
  telegramLinks: TelegramLink[];
  onRefreshLinks: () => void;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

function TelegramCardSection({
  userId,
  telegramLinks,
  onRefreshLinks,
  showNotice,
  setError,
}: TelegramCardProps) {
  const [generatingToken, setGeneratingToken] = useState(false);
  const [freshToken, setFreshToken] = useState<{ token: string; expiresAt: string } | null>(null);

  const memberLinks = telegramLinks.filter((l) => l.app_user_id === userId && l.status !== "revoked");
  const activeLink = memberLinks.find((l) => l.status === "active") ?? null;
  const pendingLink = memberLinks.find((l) => l.status === "pending_owner_confirm") ?? null;

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    setError(null);
    try {
      const result = await api.generateTelegramInviteToken(userId);
      setFreshToken({ token: result.token, expiresAt: result.expires_at });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el token.");
    } finally {
      setGeneratingToken(false);
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
      onRefreshLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el vínculo.");
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setError(null);
    try {
      await api.revokeTelegramLink(linkId);
      onRefreshLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el vínculo.");
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-[var(--app-border)] dark:border-[var(--app-border)]">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Telegram</p>

      {freshToken ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
            Enviá este comando. Lo pega en el chat con el bot. Válido 30 minutos.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 dark:bg-[var(--app-surface-2)] dark:border-[var(--app-border)]">
            <code className="flex-1 text-xs font-mono text-[var(--app-text-1)] dark:text-[var(--app-text-1)] break-all">
              /start {freshToken.token}
            </code>
            <button
              onClick={() => void handleCopyToken(freshToken.token)}
              className="shrink-0 p-1.5 rounded-lg border border-transparent hover:border-[var(--app-text-2)]"
              aria-label="Copiar comando"
            >
              <Copy className="w-3.5 h-3.5 text-[var(--app-text-2)] dark:text-[var(--app-text-2)]" />
            </button>
          </div>
        </div>
      ) : activeLink ? (
        <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
          Conectado como{" "}
          <span className="font-medium text-[var(--app-text-2)] dark:text-[var(--app-text-2)]">
            {activeLink.telegram_username ? `@${activeLink.telegram_username}` : `ID ${activeLink.telegram_user_id}`}
          </span>
          .
        </p>
      ) : pendingLink ? (
        <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
          {pendingLink.telegram_username ? `@${pendingLink.telegram_username}` : `ID ${pendingLink.telegram_user_id}`}{" "}
          ya inició sesión en el bot. Confirmá el vínculo para darle acceso.
        </p>
      ) : (
        <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
          Generá un vínculo para que esta persona conecte su Telegram al bot.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {activeLink && (
          <>
            <button
              disabled={generatingToken}
              onClick={() => void handleGenerateToken()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-white dark:bg-[var(--app-surface-2)] dark:border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-2)] dark:text-[var(--app-text-2)] hover:border-[var(--app-text-2)] disabled:opacity-50"
            >
              {generatingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
              Regenerar vínculo
            </button>
            <button
              onClick={() => void handleRevokeLink(activeLink.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-red-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--chart-expense)] hover:border-red-400"
            >
              <X className="w-3 h-3" /> Desvincular
            </button>
          </>
        )}
        {pendingLink && (
          <>
            <button
              onClick={() => void handleConfirmLink(pendingLink.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-green-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--chart-income)] hover:border-green-400"
            >
              <Check className="w-3 h-3" /> Confirmar vínculo
            </button>
            <button
              onClick={() => void handleRevokeLink(pendingLink.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-red-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--chart-expense)] hover:border-red-400"
            >
              <X className="w-3 h-3" /> Rechazar
            </button>
          </>
        )}
        {!activeLink && !pendingLink && (
          <button
            disabled={generatingToken}
            onClick={() => void handleGenerateToken()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-3 py-1.5 text-xs font-medium text-[var(--app-strong-text)] hover:border-[var(--app-text-2)] disabled:opacity-50"
          >
            {generatingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
            {freshToken ? "Regenerar" : "Generar vínculo de Telegram"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person card
// ---------------------------------------------------------------------------

interface PersonCardProps {
  key?: string;
  /** Stable key for expand/collapse */
  cardId: string;
  email: string;
  role: string;
  status: string;
  isOwner: boolean;
  isCurrentUser: boolean;
  telegramLinked: boolean;
  /** For pending invitations */
  expiresAt?: string | null;
  inviteUrl?: string;
  /** For active members */
  memberId?: string;
  permissions?: MemberPermissions;
  userId?: string;
  /** Telegram link data for expanded body */
  telegramLinks: TelegramLink[];
  onRefreshLinks: () => void;
  permLoading: boolean;
  onTogglePerm: (key: keyof MemberPermissions, current: boolean) => Promise<void>;
  onRevoke: () => void;
  onRestoreAccess?: () => void;
  onChangeRole: (newRole: "editor" | "viewer") => void;
  onResend?: () => void;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

function PersonCard({
  cardId,
  email,
  role,
  status,
  isOwner,
  isCurrentUser,
  telegramLinked,
  expiresAt,
  inviteUrl,
  memberId,
  permissions,
  userId,
  telegramLinks,
  onRefreshLinks,
  permLoading,
  onTogglePerm,
  onRevoke,
  onRestoreAccess,
  onChangeRole,
  onResend,
  showNotice,
  setError,
  expanded,
  onToggleExpand,
}: PersonCardProps) {
  const isInvitation = status === "pending" || status === "expired";
  const isRevoked = status === "revoked";
  const isEditor = role === "editor";
  const isViewer = role === "viewer";

  // Determine if telegram can be managed (active members with userId only)
  const canManageTelegram = !isInvitation && !isRevoked && !!userId;

  const handleCopyLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Link copiado");
  };

  return (
    <div
      className={[
        "rounded-xl border overflow-hidden transition-all",
        isOwner
          ? "border-[var(--app-border-strong)] bg-[var(--app-surface-1)] dark:border-[var(--app-border-strong,_var(--app-border))]"
          : expanded
          ? "border-[var(--app-border)] bg-[var(--app-surface-1)] dark:border-[var(--app-border)]"
          : "border-[var(--app-border)] bg-[var(--app-surface-2)] dark:border-[var(--app-border)]",
        isRevoked ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Head — always visible */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full grid grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-[var(--app-surface-3,_var(--app-surface-2))] border border-[var(--app-border)] dark:border-[var(--app-border)] flex items-center justify-center text-sm font-semibold text-[var(--app-text-2)] dark:text-[var(--app-text-2)] shrink-0">
          {avatarInitial(email)}
        </div>

        {/* Meta */}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--app-text-1)] dark:text-[var(--app-text-1)] truncate leading-snug">
            {email}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <RoleBadge role={role} />
            {!isOwner && <StatusBadge status={status} expiresAt={expiresAt} />}
            {isCurrentUser && (
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30">
                Vos
              </span>
            )}
            {!isInvitation && <TelegramBadge linked={telegramLinked} />}
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={`w-4 h-4 text-[var(--app-text-3)] shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Body — shown when expanded */}
      {expanded && (
        <div className="px-4 pb-4 pl-[52px]">

          {/* Permissions — editors only */}
          {isEditor && (
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--app-text-3)] dark:text-[var(--app-text-3)] mb-2">
                Permisos extra
              </p>
              <div className="space-y-0.5">
                {PERM_DEFS.map((def) => {
                  const active = effectivePerm(permissions, def.key);
                  return (
                    <div
                      key={def.key}
                      className="grid grid-cols-[24px_1fr] gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--app-surface-2)] items-start"
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active ? "true" : "false"}
                        aria-label={def.label}
                        disabled={permLoading || isCurrentUser}
                        onClick={() => void onTogglePerm(def.key, active)}
                        className={`mt-0.5 w-[18px] h-[18px] rounded-md flex items-center justify-center shrink-0 border transition-all disabled:opacity-50 ${
                          active
                            ? "bg-[var(--app-strong-surface)] border-[var(--app-strong-surface)] text-[var(--app-strong-text)] dark:bg-[var(--app-text-1)] dark:border-[var(--app-text-1)]"
                            : "border-[var(--app-border-strong)] dark:border-[var(--app-border)] bg-transparent"
                        }`}
                        title={isCurrentUser ? "No podés cambiar tus propios permisos" : undefined}
                      >
                        {active && <Check className="w-3 h-3" />}
                        {permLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span className="sr-only">{active ? "Activo" : "Inactivo"}</span>
                      </button>
                      <div>
                        <p className="text-sm font-medium text-[var(--app-text-1)] dark:text-[var(--app-text-1)] leading-tight">
                          {def.label}
                        </p>
                        <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)] mt-0.5 leading-snug">
                          {def.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Viewers: locked permissions info */}
          {isViewer && (
            <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-[var(--app-surface-2)] mb-4">
              <Lock className="w-3.5 h-3.5 text-[var(--app-text-3)] shrink-0" />
              <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
                Este rol solo puede ver el dashboard. No tiene permisos extra configurables.
              </p>
            </div>
          )}

          {/* Telegram section for active members */}
          {canManageTelegram && userId && (
            <TelegramCardSection
              userId={userId}
              telegramLinks={telegramLinks}
              onRefreshLinks={onRefreshLinks}
              showNotice={showNotice}
              setError={setError}
            />
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--app-border)] dark:border-[var(--app-border)]">
            {/* Pending / expired invitations */}
            {isInvitation && (
              <>
                {inviteUrl && (
                  <button
                    type="button"
                    onClick={() => void handleCopyLink()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] dark:border-[var(--app-border)] bg-white dark:bg-[var(--app-surface-2)] px-3 py-2 text-xs font-medium text-[var(--app-text-2)] dark:text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar link
                  </button>
                )}
                {onResend && (
                  <button
                    type="button"
                    onClick={onResend}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] dark:border-[var(--app-border)] bg-white dark:bg-[var(--app-surface-2)] px-3 py-2 text-xs font-medium text-[var(--app-text-2)] dark:text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Reenviar invitación
                  </button>
                )}
                <button
                  type="button"
                  onClick={onRevoke}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-red-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--chart-expense)] hover:border-red-400"
                >
                  Cancelar invitación
                </button>
              </>
            )}

            {/* Active members */}
            {!isOwner && !isInvitation && !isRevoked && !isCurrentUser && (
              <>
                <button
                  type="button"
                  onClick={() => onChangeRole(isEditor ? "viewer" : "editor")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] dark:border-[var(--app-border)] bg-white dark:bg-[var(--app-surface-2)] px-3 py-2 text-xs font-medium text-[var(--app-text-2)] dark:text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
                >
                  Cambiar a "{isEditor ? DASHBOARD_ROLE_LABELS.viewer : DASHBOARD_ROLE_LABELS.editor}"
                </button>
                <button
                  type="button"
                  onClick={onRevoke}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-red-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--chart-expense)] hover:border-red-400"
                >
                  Quitar acceso
                </button>
              </>
            )}

            {/* Revoked: restore */}
            {isRevoked && onRestoreAccess && (
              <button
                type="button"
                onClick={onRestoreAccess}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] dark:border-[var(--app-border)] bg-white dark:bg-[var(--app-surface-2)] px-3 py-2 text-xs font-medium text-[var(--app-text-2)] dark:text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
              >
                Restaurar acceso
              </button>
            )}

            {/* Owner self card: no actions */}
            {isOwner && isCurrentUser && (
              <p className="text-xs text-[var(--app-text-3)] dark:text-[var(--app-text-3)] py-1">
                Dueño del dashboard — vos controlás el acceso.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MiembrosSectionProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function MiembrosSection({
  viewer,
  data,
  loading,
  onRefresh,
  showNotice,
  setError,
}: MiembrosSectionProps) {
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);

  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [permLoading, setPermLoading] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<
    | { kind: "revoke-member"; memberId: string; email: string }
    | { kind: "revoke-invite"; personaId: string; email: string }
    | { kind: "role"; personaId: string; email: string; newRole: "editor" | "viewer" }
    | null
  >(null);

  // Ref to avoid stale closure issue with confirm handlers
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const loadPersonas = useCallback(async () => {
    setPersonasLoading(true);
    try {
      const data = await api.listPersonas({ scope: "dashboard" });
      setPersonas(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cargar el equipo.");
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  const loadTelegramLinks = useCallback(() => {
    api.getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error);
  }, []);

  useEffect(() => {
    void loadPersonas();
    loadTelegramLinks();
  }, [loadPersonas, loadTelegramLinks]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPersonas(), onRefresh()]);
    loadTelegramLinks();
  }, [loadPersonas, onRefresh, loadTelegramLinks]);

  // Build owner card entry
  const ownerMember = data?.members.find((m) => m.role === "owner") ?? null;

  // Find DashboardMember by email (for permissions + revoke by memberId)
  const findMember = (email: string): DashboardMember | undefined =>
    data?.members.find(
      (m) => m.email?.toLowerCase() === email.toLowerCase() && m.role !== "owner",
    );

  // Find DashboardInvitation by email (for expires_at)
  const findInvitation = (email: string): DashboardInvitation | undefined =>
    data?.invitations.find((i) => i.email.toLowerCase() === email.toLowerCase());

  // Telegram linked status per user_id
  const isTelegramLinked = (userId: string): boolean =>
    telegramLinks.some((l) => l.app_user_id === userId && l.status === "active");

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleTogglePerm = async (memberId: string, key: keyof MemberPermissions, current: boolean, currentPerms: MemberPermissions | undefined) => {
    setPermLoading(memberId);
    setError(null);
    try {
      await api.updateMemberPermissions(memberId, { ...(currentPerms ?? {}), [key]: !current });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el permiso.");
    } finally {
      setPermLoading(null);
    }
  };

  const handleRevokeMember = async (memberId: string) => {
    setError(null);
    try {
      await api.revokeMember(memberId);
      toast.success("Acceso revocado");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el acceso.");
    }
  };

  const handleRevokeInvitation = async (personaId: string) => {
    setError(null);
    try {
      await api.revokeDashboardInvitation(personaId);
      toast.success("Invitación cancelada");
      await loadPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar la invitación.");
    }
  };

  const handleChangeRole = async (personaId: string, newRole: "editor" | "viewer") => {
    setError(null);
    try {
      await api.updatePersonaRole(personaId, newRole);
      toast.success(`Rol actualizado a "${DASHBOARD_ROLE_LABELS[newRole]}"`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el rol.");
    }
  };

  const handleResend = async (persona: PersonaRecord) => {
    setResendingId(persona.id);
    try {
      await api.resendInvitation(persona.id);
      toast.success(`Recordatorio enviado a ${persona.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reenviar.");
    } finally {
      setResendingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = loading || personasLoading;

  return (
    <>
      <section className="bg-white border border-[var(--app-border)] rounded-xl shadow-[var(--app-shadow-sm)] overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-7 pb-5 md:px-8 md:pt-9 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Equipo</h2>
              <p className="text-sm text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
                Quién tiene acceso a este dashboard y qué puede hacer.
              </p>
            </div>
          </div>

          {/* Invite form */}
          <InviteForm onInvited={refreshAll} />
        </div>

        {/* Person list */}
        <div className="px-6 pb-6 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--app-text-3)]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : personas.length === 0 && !ownerMember ? (
            <div className="rounded-xl border border-dashed border-[var(--app-border)] dark:border-[var(--app-border)] px-6 py-12 text-center">
              <div className="text-3xl mb-3 opacity-40">👥</div>
              <h4 className="text-sm font-semibold text-[var(--app-text-2)] dark:text-[var(--app-text-1)]">
                Tu equipo está vacío
              </h4>
              <p className="mt-1 text-sm text-[var(--app-text-3)] dark:text-[var(--app-text-3)]">
                Sumá a alguien que vea o cargue movimientos con vos.
              </p>
            </div>
          ) : (
            <>
              {/* Owner card */}
              {ownerMember && (
                <PersonCard
                  cardId={`owner-${ownerMember.user_id}`}
                  email={ownerMember.email ?? ownerMember.user_id}
                  role="owner"
                  status="active"
                  isOwner={true}
                  isCurrentUser={ownerMember.user_id === viewer.id}
                  telegramLinked={isTelegramLinked(ownerMember.user_id)}
                  memberId={ownerMember.id}
                  permissions={ownerMember.permissions}
                  userId={ownerMember.user_id}
                  telegramLinks={telegramLinks}
                  onRefreshLinks={loadTelegramLinks}
                  permLoading={false}
                  onTogglePerm={async () => {}}
                  onRevoke={() => {}}
                  onChangeRole={() => {}}
                  showNotice={showNotice}
                  setError={setError}
                  expanded={expandedId === `owner-${ownerMember.user_id}`}
                  onToggleExpand={() =>
                    setExpandedId((prev) =>
                      prev === `owner-${ownerMember.user_id}` ? null : `owner-${ownerMember.user_id}`,
                    )
                  }
                />
              )}

              {/* Everyone else */}
              {personas.map((persona) => {
                const member = findMember(persona.email);
                const invitation = findInvitation(persona.email);
                const isInvitation = persona.status === "pending" || persona.status === "expired";
                const cardId = persona.id;

                return (
                  <PersonCard
                    key={cardId}
                    cardId={cardId}
                    email={persona.email}
                    role={persona.role}
                    status={persona.status}
                    isOwner={false}
                    isCurrentUser={member?.user_id === viewer.id}
                    telegramLinked={
                      persona.telegram_link_status === "active" ||
                      (member ? isTelegramLinked(member.user_id) : false)
                    }
                    expiresAt={invitation?.expires_at}
                    inviteUrl={persona.invite_url}
                    memberId={member?.id}
                    permissions={member?.permissions}
                    userId={member?.user_id}
                    telegramLinks={telegramLinks}
                    onRefreshLinks={loadTelegramLinks}
                    permLoading={!!member && permLoading === member.id}
                    onTogglePerm={async (key, current) => {
                      if (!member) return;
                      await handleTogglePerm(member.id, key, current, member.permissions);
                    }}
                    onRevoke={() => {
                      if (isInvitation) {
                        setConfirm({ kind: "revoke-invite", personaId: persona.id, email: persona.email });
                      } else if (member) {
                        setConfirm({ kind: "revoke-member", memberId: member.id, email: persona.email });
                      }
                    }}
                    onChangeRole={(newRole) =>
                      setConfirm({ kind: "role", personaId: persona.id, email: persona.email, newRole })
                    }
                    onResend={
                      isInvitation
                        ? () => void handleResend(persona)
                        : undefined
                    }
                    showNotice={showNotice}
                    setError={setError}
                    expanded={expandedId === cardId}
                    onToggleExpand={() =>
                      setExpandedId((prev) => (prev === cardId ? null : cardId))
                    }
                  />
                );
              })}
            </>
          )}
        </div>
      </section>

      {/* Confirm modals */}
      {confirm?.kind === "revoke-member" && (
        <ConfirmModal
          title={`¿Quitar acceso a ${confirm.email}?`}
          description="Va a dejar de ver este dashboard. Sus movimientos y empresas siguen acá. Podés volver a invitarla cuando quieras."
          confirmLabel="Quitar acceso"
          tone="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirmRef.current;
            setConfirm(null);
            if (c?.kind === "revoke-member") await handleRevokeMember(c.memberId);
          }}
        />
      )}

      {confirm?.kind === "revoke-invite" && (
        <ConfirmModal
          title={`¿Cancelar invitación a ${confirm.email}?`}
          description="La invitación quedará inválida. Podés volver a invitar cuando quieras."
          confirmLabel="Cancelar invitación"
          tone="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirmRef.current;
            setConfirm(null);
            if (c?.kind === "revoke-invite") await handleRevokeInvitation(c.personaId);
          }}
        />
      )}

      {confirm?.kind === "role" && (
        <ConfirmModal
          title={`Cambiar acceso de ${confirm.email}`}
          description={
            confirm.newRole === "editor"
              ? "Va a poder ver y cargar movimientos. Sigue sin poder invitar gente."
              : "Va a poder ver los movimientos, pero ya no cargar ni editar."
          }
          confirmLabel="Cambiar rol"
          tone="neutral"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirmRef.current;
            setConfirm(null);
            if (c?.kind === "role") await handleChangeRole(c.personaId, c.newRole);
          }}
        />
      )}
    </>
  );
}
