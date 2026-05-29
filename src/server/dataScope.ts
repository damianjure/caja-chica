import type { AppSession, DataAccessScope, SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

export async function resolveDataAccessScope(
  supabase: SupabaseLike,
  session: AppSession,
): Promise<DataAccessScope> {
  try {
    const { data, error } = await supabase
      .from("dashboard_members")
      .select("dashboard_id, role, status, permissions")
      .eq("user_id", session.userId)
      .eq("status", "active")
      .limit(1);

    if (error) throw error;
    const membership = data?.[0];

    if (membership?.dashboard_id) {
      return {
        dashboardId: membership.dashboard_id,
        membershipRole: membership.role ?? "viewer",
        memberPermissions: (membership.permissions as Record<string, boolean>) ?? {},
      };
    }
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }

  return { dashboardId: null, membershipRole: null, memberPermissions: {} };
}

export function canWriteToScope(scope: DataAccessScope): boolean {
  return scope.membershipRole !== "viewer";
}

export function canManageDashboardMembers(session: AppSession, scope: DataAccessScope): boolean {
  return (
    session.role === "admin" ||
    session.role === "superadmin" ||
    scope.membershipRole === "owner"
  );
}

export function applyDataScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  session: AppSession,
  scope: DataAccessScope,
): T {
  return scope.dashboardId
    ? query.eq("dashboard_id", scope.dashboardId)
    : query.eq("owner_user_id", session.userId);
}

export function buildWriteOwnership(
  session: AppSession,
  scope: DataAccessScope,
): Record<string, string> {
  return scope.dashboardId
    ? {
        owner_user_id: session.userId,
        dashboard_id: scope.dashboardId,
        created_by_user_id: session.userId,
      }
    : {
        owner_user_id: session.userId,
      };
}

export async function getScopeEntityById(
  supabase: SupabaseLike,
  table: string,
  session: AppSession,
  scope: DataAccessScope,
  id: string,
): Promise<unknown> {
  const primaryQuery = scope.dashboardId
    ? supabase.from(table).select("*").eq("dashboard_id", scope.dashboardId)
    : supabase.from(table).select("*").eq("owner_user_id", session.userId);

  const { data, error } = await primaryQuery.eq("id", id).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchScopedMovimientos(
  supabase: SupabaseLike,
  session: AppSession,
  scope: DataAccessScope,
): Promise<any[]> {
  const { data, error } = await applyDataScope(
    supabase
      .from("movimientos")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    session,
    scope,
  ).limit(2000);
  if (error) throw error;
  return (data ?? []) as any[];
}
