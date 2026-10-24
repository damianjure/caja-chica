import type { AppSession, DataAccessScope, SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

export interface ActiveTelegramLink {
  telegram_user_id: number | string;
  telegram_username: string | null;
  linked_at: string | null;
}

/**
 * The caller's active Telegram link in the current dashboard. Single model:
 * `telegram_links` is the only source (the legacy `usuarios` table is no
 * longer read), so the web shows the same state the bot uses.
 */
export async function getActiveTelegramLink(
  supabase: SupabaseLike,
  session: AppSession,
  scope: DataAccessScope,
): Promise<ActiveTelegramLink | null> {
  if (!scope.dashboardId) return null;
  try {
    const { data, error } = await supabase
      .from("telegram_links")
      .select("telegram_user_id, telegram_username, linked_at")
      .eq("app_user_id", session.userId)
      .eq("dashboard_id", scope.dashboardId)
      .eq("status", "active")
      .limit(1);
    if (error) throw error;
    return (data?.[0] as ActiveTelegramLink | undefined) ?? null;
  } catch (error) {
    if (isMissingSchemaArtifactError(error)) return null;
    throw error;
  }
}

/**
 * Issues a pre-authorized self-link token for the caller in the current
 * dashboard: revokes the caller's previous links there, expires their pending
 * tokens, and inserts a new token. The bot's `/start <token>` turns it into an
 * active `telegram_links` row.
 */
export async function issueSelfLinkToken(
  supabase: SupabaseLike,
  session: AppSession,
  dashboardId: string,
  token: string,
): Promise<{ token: string; expiresAt: string }> {
  await supabase
    .from("telegram_links")
    .update({ status: "revoked" })
    .eq("app_user_id", session.userId)
    .eq("dashboard_id", dashboardId)
    .neq("status", "revoked");

  await supabase
    .from("telegram_invite_tokens")
    .update({ status: "expired" })
    .eq("target_user_id", session.userId)
    .eq("dashboard_id", dashboardId)
    .eq("status", "pending");

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase
    .from("telegram_invite_tokens")
    .insert({
      token,
      dashboard_id: dashboardId,
      target_user_id: session.userId,
      created_by_user_id: session.userId,
      pre_authorized: true,
      expires_at: expiresAt,
      status: "pending",
    });
  if (insertError) throw insertError;
  return { token, expiresAt };
}
