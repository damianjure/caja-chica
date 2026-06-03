import type { AppSession, DataAccessScope, SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

const MEMBERSHIP_ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  editor: 1,
  viewer: 2,
};

function selectPrimaryMembership(rows: any[]): any | null {
  const sorted = [...rows].sort((a, b) => {
    const roleA = MEMBERSHIP_ROLE_PRIORITY[a?.role as string] ?? 99;
    const roleB = MEMBERSHIP_ROLE_PRIORITY[b?.role as string] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
    return String(a?.created_at ?? "").localeCompare(String(b?.created_at ?? ""));
  });
  return sorted[0] ?? null;
}

export async function resolveDataAccessScope(
  supabase: SupabaseLike,
  session: AppSession,
): Promise<DataAccessScope> {
  try {
    const { data, error } = await supabase
      .from("dashboard_members")
      .select("dashboard_id, role, status, permissions, created_at")
      .eq("user_id", session.userId)
      .eq("status", "active")
      .limit(50);

    if (error) throw error;
    const membership = selectPrimaryMembership(data ?? []);

    if (membership?.dashboard_id) {
      return {
        dashboardId: membership.dashboard_id,
        membershipRole: membership.role ?? "viewer",
        memberPermissions: (membership.permissions as Record<string, boolean>) ?? {},
      };
    }
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
    console.warn(
      "[resolveDataAccessScope] dashboard_members unavailable, falling back to legacy self-scope:",
      error,
    );
  }

  return { dashboardId: null, membershipRole: null, memberPermissions: {} };
}

export function canWriteToScope(scope: DataAccessScope): boolean {
  return (
    scope.membershipRole === null ||
    scope.membershipRole === "owner" ||
    scope.membershipRole === "editor"
  );
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
  const pageSize = 1000;
  const all: any[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await applyDataScope(
      supabase
        .from("movimientos")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      session,
      scope,
    ).range(from, to);
    if (error) throw error;

    const page = (data ?? []) as any[];
    all.push(...page);
    if (page.length < pageSize) break;
  }

  return all;
}
