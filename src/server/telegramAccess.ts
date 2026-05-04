import { isMissingSchemaArtifactError } from "./errors.ts";
import type { MemberPermissions } from "./permissions.ts";

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

async function resolveDashboardRole(
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

function normalizeRecord(
  raw: any,
  role: TelegramDashboardRole | null,
  permissions: MemberPermissions = {},
): TelegramLinkRecord {
  return {
    id: raw?.id ?? undefined,
    userId: raw?.user_id ?? null,
    dashboardId: raw?.dashboard_id ?? null,
    ownerUserId: raw?.owner_user_id ?? null,
    role,
    permissions,
    username: raw?.username ?? null,
    remindersEnabled: raw?.reminders_enabled ?? true,
    linkTokenExpiresAt: raw?.link_token_expires_at ?? null,
  };
}

async function resolveRoleIfNeeded(
  supabase: TelegramSupabaseLike,
  raw: any,
): Promise<TelegramDashboardRole | null> {
  if (!raw?.user_id || !raw?.dashboard_id) return null;
  return resolveDashboardRole(supabase, raw.user_id, raw.dashboard_id);
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

export async function resolveTelegramIdentityByChatId(
  supabase: TelegramSupabaseLike,
  chatId: number,
): Promise<TelegramLinkRecord | null> {
  // 1. Flujo nuevo: editor/viewer via telegram_links
  const viaNewLinks = await resolveViaNewLinks(supabase, chatId);
  if (viaNewLinks) return viaNewLinks;

  // 2. Flujo legacy: owner via usuarios (unchanged)
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select(
        "id, user_id, dashboard_id, owner_user_id, username, reminders_enabled, link_token_expires_at",
      )
      .eq("chat_id", chatId)
      .limit(1);
    if (error) throw error;
    const raw = data?.[0];
    if (!raw) return null;
    return normalizeRecord(raw, await resolveRoleIfNeeded(supabase, raw));
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, owner_user_id, username, reminders_enabled, link_token_expires_at")
    .eq("chat_id", chatId)
    .limit(1);
  if (error) throw error;
  const raw = data?.[0];
  return raw ? normalizeRecord(raw, null) : null;
}

export async function resolveTelegramIdentityByToken(
  supabase: TelegramSupabaseLike,
  token: string,
): Promise<TelegramLinkRecord | null> {
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select(
        "id, user_id, dashboard_id, owner_user_id, username, reminders_enabled, link_token_expires_at",
      )
      .eq("link_token", token)
      .gt("link_token_expires_at", new Date().toISOString())
      .limit(1);
    if (error) throw error;
    const raw = data?.[0];
    if (!raw) return null;
    return normalizeRecord(raw, await resolveRoleIfNeeded(supabase, raw));
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, owner_user_id, username, reminders_enabled, link_token_expires_at")
    .eq("link_token", token)
    .gt("link_token_expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw error;
  const raw = data?.[0];
  return raw ? normalizeRecord(raw, null) : null;
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
      owner_user_id: linked.ownerUserId ?? linked.userId,
      dashboard_id: linked.dashboardId,
      created_by_user_id: linked.userId,
    };
  }

  return {
    owner_user_id: linked.ownerUserId,
  };
}
