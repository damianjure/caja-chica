import type { AppSession, DataAccessScope, SupabaseLike } from "./contracts.ts";

export function isOwnerLike(scope: DataAccessScope): boolean {
  return scope.membershipRole === null || scope.membershipRole === "owner";
}

// Check a granular permission for the current editor. defaultOn = true for backwards-compatible perms.
export function scopePerm(scope: DataAccessScope, key: string, defaultOn: boolean): boolean {
  if (scope.membershipRole !== "editor") return false;
  const val = scope.memberPermissions[key];
  return val !== undefined ? !!val : defaultOn;
}

export function canConnectDrive(scope: DataAccessScope): boolean {
  return isOwnerLike(scope);
}

export function canExportDrive(scope: DataAccessScope): boolean {
  return isOwnerLike(scope) || scopePerm(scope, "export_drive", false);
}

export function canExportLocal(scope: DataAccessScope): boolean {
  return isOwnerLike(scope) || scopePerm(scope, "export_local", true);
}

export function canManageEmpresasOp(scope: DataAccessScope): boolean {
  return isOwnerLike(scope) || scopePerm(scope, "manage_empresas", true);
}

export function canManageCategoriasOp(scope: DataAccessScope): boolean {
  return isOwnerLike(scope) || scopePerm(scope, "manage_categorias", true);
}

export function canDeleteOthers(scope: DataAccessScope): boolean {
  return isOwnerLike(scope) || scopePerm(scope, "delete_any", false);
}

export function canEditOthers(scope: DataAccessScope): boolean {
  return isOwnerLike(scope) || scopePerm(scope, "edit_any", false);
}

export async function resolveDriveOwnerUserId(
  supabase: SupabaseLike,
  session: AppSession,
  scope: DataAccessScope,
): Promise<string | null> {
  if (!scope.dashboardId || scope.membershipRole === "owner" || scope.membershipRole === null) {
    return session.userId;
  }
  const { data, error } = await supabase
    .from("dashboard_members")
    .select("user_id")
    .eq("dashboard_id", scope.dashboardId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  return data?.[0]?.user_id ?? null;
}
