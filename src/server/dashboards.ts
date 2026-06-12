/**
 * dashboards.ts — multi-dashboard management (personal vs pyme + switcher).
 *
 * The dashboards + dashboard_members tables already exist; this adds the
 * personal/pyme axis, the fiscal fields (CUIT/CUIL) on pyme dashboards, and the
 * user-selected "active dashboard" that the scope resolver honors. DB-only
 * cores, fake-testable.
 */

import type { SupabaseLike } from "./contracts.ts";

export type DashboardType = "personal" | "pyme";

export interface UserDashboard {
  id: string;
  name: string;
  type: DashboardType;
  role: string;
}

/** 11 digits, dashes/dots stripped. Returns the normalized CUIT/CUIL or null. */
export function normalizeCuit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return /^\d{11}$/.test(digits) ? digits : null;
}

/** List the dashboards the user is an active member of, with type + their role. */
export async function listUserDashboards(supabase: SupabaseLike, userId: string): Promise<UserDashboard[]> {
  const { data: members, error: mErr } = await supabase
    .from("dashboard_members")
    .select("dashboard_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(50);
  if (mErr) throw mErr;
  const rows = (members ?? []) as Array<{ dashboard_id: string; role: string }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.dashboard_id);
  const { data: dashboards, error: dErr } = await supabase
    .from("dashboards")
    .select("id, name, type")
    .in("id", ids);
  if (dErr) throw dErr;

  const byId = new Map<string, any>((dashboards ?? []).map((d: any) => [d.id, d]));
  return rows
    .map((r) => {
      const d = byId.get(r.dashboard_id);
      if (!d) return null;
      return { id: d.id, name: d.name, type: (d.type === "pyme" ? "pyme" : "personal") as DashboardType, role: r.role };
    })
    .filter((x): x is UserDashboard => x !== null);
}

export interface CreatePymeArgs {
  userId: string;
  name: string;
  cuit: string;
  cuil?: string | null;
}

export type CreatePymeResult =
  | { status: "ok"; dashboardId: string }
  | { status: "invalid_cuit" }
  | { status: "invalid_name" }
  | { status: "error" };

/** Create a pyme dashboard (CUIT required) + owner membership for the creator. */
export async function createPymeDashboard(supabase: SupabaseLike, args: CreatePymeArgs): Promise<CreatePymeResult> {
  const name = args.name?.trim();
  if (!name) return { status: "invalid_name" };
  const cuit = normalizeCuit(args.cuit);
  if (!cuit) return { status: "invalid_cuit" };
  const cuil = normalizeCuit(args.cuil);

  const { data: created, error: dErr } = await supabase
    .from("dashboards")
    .insert({ name, type: "pyme", cuit, cuil, created_by_user_id: args.userId })
    .select("id");
  if (dErr) return { status: "error" };
  const dashboardId = created?.[0]?.id as string | undefined;
  if (!dashboardId) return { status: "error" };

  const { error: mErr } = await supabase
    .from("dashboard_members")
    .insert({ dashboard_id: dashboardId, user_id: args.userId, role: "owner", status: "active" });
  if (mErr) return { status: "error" };

  return { status: "ok", dashboardId };
}

export type SetActiveDashboardResult = { status: "ok" } | { status: "forbidden" } | { status: "error" };

/** Set the user's active dashboard — only if they're an active member of it. */
export async function setActiveDashboard(
  supabase: SupabaseLike,
  args: { userId: string; dashboardId: string },
): Promise<SetActiveDashboardResult> {
  const { data: member, error: mErr } = await supabase
    .from("dashboard_members")
    .select("id")
    .eq("user_id", args.userId)
    .eq("dashboard_id", args.dashboardId)
    .eq("status", "active")
    .limit(1);
  if (mErr) return { status: "error" };
  if (!member?.[0]) return { status: "forbidden" };

  const { error: uErr } = await supabase
    .from("app_users")
    .update({ active_dashboard_id: args.dashboardId })
    .eq("user_id", args.userId);
  if (uErr) return { status: "error" };
  return { status: "ok" };
}
