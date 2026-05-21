import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Link,
  Loader2,
  RefreshCw,
  Send,
  Smartphone,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  api,
  type DashboardInvitationRole,
  type PersonaRecord,
  type PersonaScope,
  type PersonaStatus,
} from "../services/api";
import {
  ACTION_LABELS,
  APP_ROLE_LABELS,
  DASHBOARD_ROLE_LABELS,
  STATUS_LABELS as VOCAB_STATUS_LABELS,
  badgeTooltip,
  type AppRole,
  type DashboardRole,
} from "../services/labels";
import { ConfirmModal } from "./ui/ConfirmModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonasPanelProps {
  /** "app" shows admin view (all user_invitations); "dashboard" shows owner view. */
  scope: PersonaScope;
  /** Whether to show the telegram_preauth toggle (dashboard scope only). */
  showTelegramToggle?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Higher-contrast badge palette with explicit dark-mode variants.
// Tailwind v4 emits `[data-theme="dark"] .dark\:*` when the dark variant is configured.
// If `dark:` doesn't take effect at runtime (no `dark` class on <html>), the data-theme
// fallback selectors in src/index.css would catch it. Using ring for extra edge contrast.
const STATUS_STYLES: Record<PersonaStatus, string> = {
  pending: "bg-amber-100 text-amber-800 ring-1 ring-amber-300/60 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/40",
  active: "bg-green-100 text-green-800 ring-1 ring-green-300/60 dark:bg-green-500/15 dark:text-green-200 dark:ring-green-400/40",
  expired: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-300/60 dark:bg-neutral-700/40 dark:text-neutral-300 dark:ring-neutral-500/40",
  revoked: "bg-red-100 text-red-700 ring-1 ring-red-300/60 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/40",
};

// Map our PersonaStatus to the canonical vocab labels (revoked → "Sin acceso", etc.).
const STATUS_LABELS: Record<PersonaStatus, string> = {
  pending: VOCAB_STATUS_LABELS.pending,
  active: VOCAB_STATUS_LABELS.active,
  expired: VOCAB_STATUS_LABELS.expired,
  revoked: VOCAB_STATUS_LABELS.revoked,
};

function StatusBadge({ status }: { status: PersonaStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const DASHBOARD_ROLE_STYLES: Record<DashboardRole, string> = {
  owner: "bg-violet-100 text-violet-800 ring-1 ring-violet-300/60 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/40",
  editor: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/60 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/40",
  viewer: "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-300/60 dark:bg-neutral-700/50 dark:text-neutral-200 dark:ring-neutral-500/40",
};

const APP_ROLE_STYLES: Record<AppRole, string> = {
  superadmin: "bg-rose-100 text-rose-800 ring-1 ring-rose-300/60 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-400/40",
  admin: "bg-amber-100 text-amber-900 ring-1 ring-amber-300/60 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/40",
  member: "bg-sky-100 text-sky-800 ring-1 ring-sky-300/60 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/40",
};

function RoleBadge({ role, scope }: { role: string; scope: PersonaScope }) {
  const isDashboardRole = scope === "dashboard" && (role === "owner" || role === "editor" || role === "viewer");
  const isAppRole = scope === "app" && (role === "superadmin" || role === "admin" || role === "member");

  let label = role;
  let className = "bg-neutral-100 text-neutral-600";
  let tip = "";

  if (isDashboardRole) {
    label = DASHBOARD_ROLE_LABELS[role as DashboardRole];
    className = DASHBOARD_ROLE_STYLES[role as DashboardRole];
    tip = badgeTooltip(role as DashboardRole);
  } else if (isAppRole) {
    label = APP_ROLE_LABELS[role as AppRole];
    className = APP_ROLE_STYLES[role as AppRole];
    tip = badgeTooltip(role as AppRole);
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      title={tip}
    >
      {label}
    </span>
  );
}

function relativeTime(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

// ---------------------------------------------------------------------------
// Actions dropdown
// ---------------------------------------------------------------------------

interface ActionMenuProps {
  persona: PersonaRecord;
  onResend: () => void;
  onCopyLink: () => void;
  onChangeRole: (role: string) => void;
  onRevoke: () => void;
  loadingResend: boolean;
}

function ActionMenu({
  persona,
  onResend,
  onCopyLink,
  onChangeRole,
  onRevoke,
  loadingResend,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const canResend = persona.status === "pending" || persona.status === "expired";
  const canRevoke = persona.status !== "revoked";
  const canChangeRole = persona.status !== "revoked" && persona.type === "dashboard";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Acciones
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-2xl border border-neutral-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => {
              onCopyLink();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <Link className="w-3.5 h-3.5" />
            {ACTION_LABELS.copyLink}
          </button>

          {canResend && (
            <button
              disabled={loadingResend}
              onClick={() => {
                onResend();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {loadingResend ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {ACTION_LABELS.resend}
            </button>
          )}

          {canChangeRole && (
            <>
              <div className="my-1 border-t border-neutral-100" />
              <button
                onClick={() => {
                  onChangeRole(persona.role === "editor" ? "viewer" : "editor");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Smartphone className="w-3.5 h-3.5" />
                {persona.role === "editor"
                  ? `${ACTION_LABELS.changeRole}: "${DASHBOARD_ROLE_LABELS.viewer}"`
                  : `${ACTION_LABELS.changeRole}: "${DASHBOARD_ROLE_LABELS.editor}"`}
              </button>
            </>
          )}

          {canRevoke && (
            <>
              <div className="my-1 border-t border-neutral-100" />
              <button
                onClick={() => {
                  onRevoke();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                {ACTION_LABELS.revoke}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function PersonasPanel({ scope, showTelegramToggle = false }: PersonasPanelProps) {
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DashboardInvitationRole>("viewer");
  const [telegramPreauth, setTelegramPreauth] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Pending confirmation: revoke or role change. Rendered as a ConfirmModal.
  const [confirm, setConfirm] = useState<
    | { kind: "revoke"; persona: PersonaRecord }
    | { kind: "role"; persona: PersonaRecord; newRole: string }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listPersonas({ scope });
      setPersonas(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cargar las personas.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      if (scope === "app") {
        await api.inviteUser(trimmed, "member");
      } else {
        // dashboard scope — pass telegram_preauth if enabled
        const body: Record<string, unknown> = { email: trimmed, role };
        if (showTelegramToggle && telegramPreauth) body.telegram_preauth = true;
        await fetch("/api/dashboard/invitations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
      }
      setEmail("");
      setRole("viewer");
      setTelegramPreauth(false);
      toast.success(`Invitación enviada a ${trimmed}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo invitar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (persona: PersonaRecord) => {
    setResendingId(persona.id);
    try {
      await api.resendInvitation(persona.id);
      toast.success(`Recordatorio enviado a ${persona.email}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reenviar.");
    } finally {
      setResendingId(null);
    }
  };

  const handleCopyLink = async (persona: PersonaRecord) => {
    await navigator.clipboard.writeText(persona.invite_url);
    toast.success("Link copiado");
  };

  const handleChangeRole = async (persona: PersonaRecord, newRole: string) => {
    try {
      await api.updatePersonaRole(persona.id, newRole);
      toast.success(`Acceso actualizado a "${DASHBOARD_ROLE_LABELS[newRole as DashboardRole] ?? newRole}"`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el rol.");
    }
  };

  const handleRevoke = async (persona: PersonaRecord) => {
    setRevokingId(persona.id);
    try {
      if (persona.type === "app") {
        await api.revokeInvitation(persona.id);
      } else {
        await api.revokeDashboardInvitation(persona.id);
      }
      toast.success("Acceso quitado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo revocar.");
    } finally {
      setRevokingId(null);
    }
  };

  // Group by status for empty state
  const pendingCount = personas.filter((p) => p.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
            placeholder="colaborador@empresa.com"
            className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
          />
          {scope === "dashboard" && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DashboardInvitationRole)}
              className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 bg-white text-sm"
            >
              <option value="viewer">{DASHBOARD_ROLE_LABELS.viewer} — solo lectura</option>
              <option value="editor">{DASHBOARD_ROLE_LABELS.editor} — ve y carga</option>
            </select>
          )}
          {scope === "app" && (
            <div className="flex items-center rounded-2xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500">
              {APP_ROLE_LABELS.member}
            </div>
          )}
          <button
            onClick={() => void handleInvite()}
            disabled={submitting || !email.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {ACTION_LABELS.inviteSend}
          </button>
        </div>

        {scope === "dashboard" && showTelegramToggle && (
          <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={telegramPreauth}
              onChange={(e) => setTelegramPreauth(e.target.checked)}
              className="rounded"
            />
            {ACTION_LABELS.telegramPreauthToggle}
          </label>
        )}
      </div>

      {/* Persona list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            {scope === "dashboard" ? "Personas" : "Invitaciones"} {pendingCount > 0 && `· ${pendingCount} invitad${pendingCount > 1 ? "as" : "a"}`}
          </h3>
          <button
            onClick={() => void load()}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
            title="Actualizar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-neutral-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : personas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 px-6 py-10 text-center">
            <h4 className="text-sm font-semibold text-neutral-700">{ACTION_LABELS.emptyTeamTitle}</h4>
            <p className="mt-1 text-sm text-neutral-500">{ACTION_LABELS.emptyTeamBody}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {personas.map((persona) => (
              <div
                key={persona.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3"
              >
                {/* Avatar */}
                <div className="shrink-0 w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600 uppercase">
                  {persona.email[0]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="font-medium text-sm text-neutral-900 [overflow-wrap:anywhere]">
                    {persona.email}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={persona.status} />
                    <RoleBadge role={persona.role} scope={scope} />
                    <span className="text-xs text-neutral-400">
                      {relativeTime(persona.last_action_at)}
                    </span>
                  </div>
                </div>

                {/* Copy icon shortcut */}
                <button
                  onClick={() => void handleCopyLink(persona)}
                  className="shrink-0 p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  title="Copiar link"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                {/* Actions dropdown */}
                <ActionMenu
                  persona={persona}
                  onResend={() => void handleResend(persona)}
                  onCopyLink={() => void handleCopyLink(persona)}
                  onChangeRole={(r) => setConfirm({ kind: "role", persona, newRole: r })}
                  onRevoke={() => setConfirm({ kind: "revoke", persona })}
                  loadingResend={resendingId === persona.id}
                />

                {(revokingId === persona.id) && (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm?.kind === "revoke" && (
        <ConfirmModal
          title={`¿Quitar acceso a ${confirm.persona.email}?`}
          description="Va a dejar de ver este dashboard. Sus movimientos y empresas siguen acá. Podés volver a invitarla cuando quieras."
          confirmLabel={ACTION_LABELS.revoke}
          tone="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await handleRevoke(confirm.persona);
            setConfirm(null);
          }}
        />
      )}

      {confirm?.kind === "role" && (
        <ConfirmModal
          title={`Cambiar acceso de ${confirm.persona.email}`}
          description={
            confirm.newRole === "editor"
              ? "Va a poder ver y cargar movimientos. Sigue sin poder invitar gente."
              : "Va a poder ver los movimientos, pero ya no cargar ni editar."
          }
          confirmLabel={ACTION_LABELS.changeRole}
          tone="neutral"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await handleChangeRole(confirm.persona, confirm.newRole);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
