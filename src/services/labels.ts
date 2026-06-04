// Centralized UI vocabulary for Caja Chica.
// Keeps DB enums (app_role, dashboard_member_role) intact — only changes labels.
//
// Naming model (Slack/Notion/Stripe alignment, revised 2026-05-25):
//   - identity nouns at the system level: Super Admin / Admin / Miembro
//   - capability verb-phrases at the resource level: Dueño / Puede editar / Puede ver
//
// Previous labels (Operador / Usuario) replaced because:
//   - "Operador" is non-standard in modern SaaS; industry uses "Owner" or "Super Admin"
//   - "Usuario" is ambiguous (everyone logged in is a user); industry uses "Member"

export type AppRole = "superadmin" | "admin" | "member";
export type DashboardRole = "owner" | "editor" | "viewer";

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  member: "Dueño",
};

export const DASHBOARD_ROLE_LABELS: Record<DashboardRole, string> = {
  owner: "Dueño",
  editor: "Puede editar",
  viewer: "Puede ver",
};

export const APP_ROLE_HINTS: Record<AppRole, string> = {
  superadmin: "Manda en todo el sistema. Vista global, configuración global.",
  admin: "Helper de soporte. Gestiona usuarios e invitaciones.",
  member: "Cuenta normal. Sin permisos del sistema.",
};

export const DASHBOARD_ROLE_HINTS: Record<DashboardRole, string> = {
  owner: "Manda en este dashboard. Invita, cambia accesos, borra.",
  editor: "Ve y carga movimientos. No invita.",
  viewer: "Solo lectura. No carga ni borra.",
};

export type InvitationStatus = "pending" | "active" | "expired" | "revoked" | "accepted";

export const STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: "Invitado",
  active: "Activo",
  expired: "Vencido",
  revoked: "Sin acceso",
  accepted: "Activo",
};

export const ACTION_LABELS = {
  resend: "Reenviar invitación",
  copyLink: "Copiar link de invitación",
  changeRole: "Cambiar acceso",
  revoke: "Quitar acceso",
  linkTelegram: "Sumar Telegram",
  inviteSend: "Mandar invitación",
  teamSectionTitle: "Equipo",
  teamSectionDesc: "Quién tiene acceso a este dashboard y qué puede hacer.",
  emptyTeamTitle: "Tu equipo está vacío.",
  emptyTeamBody: "Invitá a alguien para que vea o cargue movimientos con vos.",
  emptyTeamCta: "Sumar primera persona",
  telegramPreauthToggle: "Darle acceso al bot también",
} as const;

/**
 * Format identity for the dashboard header.
 * Example: "Operador · Dueño de este dashboard"
 */
export function formatIdentity(appRole: AppRole, dashboardRole: DashboardRole | null): string {
  const app = APP_ROLE_LABELS[appRole];
  if (!dashboardRole) return app;
  const dash = DASHBOARD_ROLE_LABELS[dashboardRole];
  const scope = dashboardRole === "owner" ? "de este dashboard" : "este dashboard";
  return `${app} · ${dash} ${scope}`;
}

/**
 * Single-letter avatar initial from an email (Header C avatar).
 * First alphanumeric char of the local part, uppercased. "?" if none.
 */
export function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").trim();
  const first = local.match(/[a-zA-Z0-9]/)?.[0];
  return first ? first.toUpperCase() : "?";
}

/**
 * For badge tooltips. Short, action-oriented.
 */
export function badgeTooltip(role: AppRole | DashboardRole): string {
  if (role in APP_ROLE_HINTS) {
    return APP_ROLE_HINTS[role as AppRole];
  }
  return DASHBOARD_ROLE_HINTS[role as DashboardRole];
}
