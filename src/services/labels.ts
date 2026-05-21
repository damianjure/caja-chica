// Centralized UI vocabulary for Caja Chica.
// Keeps DB enums (app_role, dashboard_member_role) intact — only changes labels.
//
// Naming model (Notion + Slack convergence, 2026-05-21):
//   - identity nouns at the system level: Operador / Admin / Usuario
//   - capability verb-phrases at the resource level: Dueño / Puede editar / Puede ver
//
// See /tmp/vocab-full-mockup.html for the full visual reference.

export type AppRole = "superadmin" | "admin" | "member";
export type DashboardRole = "owner" | "editor" | "viewer";

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Operador",
  admin: "Admin",
  member: "Usuario",
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
 * For badge tooltips. Short, action-oriented.
 */
export function badgeTooltip(role: AppRole | DashboardRole): string {
  if (role in APP_ROLE_HINTS) {
    return APP_ROLE_HINTS[role as AppRole];
  }
  return DASHBOARD_ROLE_HINTS[role as DashboardRole];
}
