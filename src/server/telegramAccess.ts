import { isMissingSchemaArtifactError } from "./errors.ts";
import { can, type MemberPermissions } from "./permissions.ts";

export interface TelegramSupabaseLike {
  from(table: string): any;
}

export type TelegramDashboardRole = "owner" | "editor" | "viewer";

export interface TelegramLinkRecord {
  id?: string;
  userId: string | null;
  dashboardId: string | null;
  ownerUserId: string | null;
  role: TelegramDashboardRole | null;
  permissions: MemberPermissions;
  username: string | null;
  remindersEnabled: boolean;
  linkTokenExpiresAt: string | null;
}

export interface TelegramMovementMutationRecord {
  owner_user_id?: string | null;
  created_by_user_id?: string | null;
}

export async function resolveDashboardRole(
  supabase: TelegramSupabaseLike,
  userId: string,
  dashboardId: string,
): Promise<TelegramDashboardRole | null> {
  try {
    const { data, error } = await supabase
      .from("dashboard_members")
      .select("role, status")
      .eq("user_id", userId)
      .eq("dashboard_id", dashboardId)
      .limit(1);

    if (error) throw error;
    const membership = data?.[0];
    if (!membership || membership.status !== "active") return null;
    return membership.role ?? null;
  } catch (error) {
    if (isMissingSchemaArtifactError(error)) return null;
    throw error;
  }
}

async function resolveViaNewLinks(
  supabase: TelegramSupabaseLike,
  telegramUserId: number,
): Promise<TelegramLinkRecord | null> {
  try {
    const { data: linkRows, error: linkError } = await supabase
      .from("telegram_links")
      .select("id, app_user_id, dashboard_id, telegram_username, status")
      .eq("telegram_user_id", telegramUserId)
      .eq("status", "active")
      .limit(1);

    if (linkError) {
      if (isMissingSchemaArtifactError(linkError)) return null;
      throw linkError;
    }

    const link = linkRows?.[0];
    if (!link) return null;

    const { data: memberRows, error: memberError } = await supabase
      .from("dashboard_members")
      .select("role, status, permissions")
      .eq("user_id", link.app_user_id)
      .eq("dashboard_id", link.dashboard_id)
      .limit(1);

    if (memberError) throw memberError;
    const member = memberRows?.[0];
    if (!member || member.status !== "active") return null;

    return {
      id: link.id,
      userId: link.app_user_id,
      dashboardId: link.dashboard_id,
      ownerUserId: null,
      role: member.role as TelegramDashboardRole,
      permissions: (member.permissions as MemberPermissions) ?? {},
      username: link.telegram_username ?? null,
      remindersEnabled: true,
      linkTokenExpiresAt: null,
    };
  } catch (error) {
    if (isMissingSchemaArtifactError(error)) return null;
    throw error;
  }
}

/**
 * Identity of a Telegram chat. Single model: only an active `telegram_links`
 * row (with an active dashboard membership) grants access. The legacy
 * `usuarios` table is no longer read, so revoking a link always removes access.
 */
export async function resolveTelegramIdentityByChatId(
  supabase: TelegramSupabaseLike,
  chatId: number,
): Promise<TelegramLinkRecord | null> {
  return resolveViaNewLinks(supabase, chatId);
}

export function hasTelegramAccess(linked: TelegramLinkRecord | null) {
  return Boolean(linked?.ownerUserId || (linked?.userId && linked?.dashboardId));
}

export function canEditViaTelegram(linked: TelegramLinkRecord | null) {
  if (!linked) return false;
  if (linked.dashboardId && linked.userId) {
    return linked.role === "owner" || linked.role === "editor";
  }
  return Boolean(linked.ownerUserId);
}

function telegramActorUserId(linked: TelegramLinkRecord): string | null {
  return linked.userId ?? linked.ownerUserId ?? null;
}

function telegramPermissionRole(linked: TelegramLinkRecord): "owner" | "editor" | "viewer" {
  if (linked.role) return linked.role;
  return linked.ownerUserId && !linked.dashboardId ? "owner" : "viewer";
}

function ownsTelegramMovement(
  movement: TelegramMovementMutationRecord,
  linked: TelegramLinkRecord,
): boolean {
  const actorUserId = telegramActorUserId(linked);
  if (!actorUserId) return false;
  return movement.owner_user_id === actorUserId || movement.created_by_user_id === actorUserId;
}

export function canEditMovementViaTelegram(
  movement: TelegramMovementMutationRecord,
  linked: TelegramLinkRecord,
): boolean {
  const member = {
    role: telegramPermissionRole(linked),
    permissions: linked.permissions ?? {},
    user_id: telegramActorUserId(linked) ?? "",
  };
  if (!can(member, "write_movimiento")) return false;
  return ownsTelegramMovement(movement, linked) || can(member, "edit_any_movimiento");
}

export function canDeleteMovementViaTelegram(
  movement: TelegramMovementMutationRecord,
  linked: TelegramLinkRecord,
): boolean {
  const member = {
    role: telegramPermissionRole(linked),
    permissions: linked.permissions ?? {},
    user_id: telegramActorUserId(linked) ?? "",
  };
  if (!can(member, "delete_own_movimiento")) return false;
  return ownsTelegramMovement(movement, linked) || can(member, "delete_any_movimiento");
}

export function applyTelegramDataScope(
  query: any,
  linked: TelegramLinkRecord,
) {
  if (linked.dashboardId) {
    return query.eq("dashboard_id", linked.dashboardId);
  }
  return query.eq("owner_user_id", linked.ownerUserId as string);
}

export function buildTelegramWriteOwnership(linked: TelegramLinkRecord) {
  if (linked.dashboardId && linked.userId) {
    return {
      owner_user_id: linked.userId,
      dashboard_id: linked.dashboardId,
      created_by_user_id: linked.userId,
    };
  }

  return {
    owner_user_id: linked.ownerUserId,
  };
}
