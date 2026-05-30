/**
 * welcome.ts — Friendly first-contact message for Telegram users who just
 * got linked to a dashboard (pre-authorized invite or owner confirmation).
 *
 * Plain text on purpose: the message embeds user-provided dashboard names, so
 * NO parse_mode is used — names can never break formatting or inject markup.
 *
 * buildWelcomeMessage is pure (no I/O) and fully tested.
 * fetchUserDashboards reads dashboard_members + dashboards and degrades to []
 * on any error (a missing welcome must never block the linking flow).
 */

import { DASHBOARD_ROLE_LABELS, type DashboardRole } from "../services/labels.ts";

export interface DashboardAccess {
  name: string;
  role: DashboardRole;
}

const INTRO_BODY =
  "Desde acá vas a poder ingresar, ver y generar informes de todo lo referido a tus finanzas. ¡Que lo disfrutes!";
const OUTRO = "Escribí /menu para ver todo lo que podés hacer.";

export function buildWelcomeMessage(dashboards: DashboardAccess[], firstName?: string | null): string {
  const trimmed = firstName?.trim();
  const nameSuffix = trimmed ? ` ${trimmed}` : "";
  const intro = `¡Hola${nameSuffix}! Te damos la bienvenida al bot de Caja Chica 🎉\n\n${INTRO_BODY}`;

  const accessBlock = buildAccessBlock(dashboards);
  if (!accessBlock) return `${intro}\n\n${OUTRO}`;
  return `${intro}\n\n${accessBlock}\n\n${OUTRO}`;
}

function buildAccessBlock(dashboards: DashboardAccess[]): string | null {
  if (dashboards.length === 0) return null;

  if (dashboards.length === 1) {
    const d = dashboards[0];
    return `📋 El dashboard al que tenés acceso es el de ${d.name}.\nTu rol: ${DASHBOARD_ROLE_LABELS[d.role]}.`;
  }

  const lines = dashboards
    .map((d) => `• ${d.name} — ${DASHBOARD_ROLE_LABELS[d.role]}`)
    .join("\n");
  return `📋 Los dashboards a los que tenés acceso:\n${lines}`;
}

interface WelcomeSupabaseLike {
  from(table: string): any;
}

/**
 * Resolve every active dashboard the given app user belongs to, with role.
 * Returns [] on any error or when there are no memberships.
 */
export async function fetchUserDashboards(
  supabase: WelcomeSupabaseLike,
  appUserId: string,
): Promise<DashboardAccess[]> {
  try {
    const { data: members, error } = await supabase
      .from("dashboard_members")
      .select("role, dashboard_id, status")
      .eq("user_id", appUserId)
      .eq("status", "active");
    if (error || !members || members.length === 0) return [];

    const ids = members.map((m: any) => m.dashboard_id).filter(Boolean);
    if (ids.length === 0) return [];

    const { data: dashes } = await supabase
      .from("dashboards")
      .select("id, name")
      .in("id", ids);
    const nameById = new Map<string, string>(
      (dashes ?? []).map((d: any) => [d.id, d.name]),
    );

    return members
      .map((m: any) => ({
        name: nameById.get(m.dashboard_id) ?? "tu dashboard",
        role: m.role as DashboardRole,
      }))
      .sort((a: DashboardAccess, b: DashboardAccess) => a.name.localeCompare(b.name, "es"));
  } catch {
    return [];
  }
}
