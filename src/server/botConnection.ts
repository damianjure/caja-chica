import type { AppSession, DataAccessScope, SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

export async function getBotConnectionRecord(
  supabase: SupabaseLike,
  session: AppSession,
  scope: DataAccessScope,
) {
  if (scope.dashboardId) {
    try {
      const { data, error } = await supabase
        .from("usuarios")
        .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled")
        .eq("user_id", session.userId)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled")
    .eq("owner_user_id", session.userId)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function upsertBotConnectionRecord(
  supabase: SupabaseLike,
  session: AppSession,
  scope: DataAccessScope,
  token: string,
  tokenExpiresAt: string,
) {
  if (scope.dashboardId) {
    try {
      const { data: existingRows, error: fetchError } = await supabase
        .from("usuarios")
        .select("id")
        .eq("user_id", session.userId)
        .limit(1);
      if (fetchError) throw fetchError;

      const payload = {
        user_id: session.userId,
        owner_user_id: session.userId,
        dashboard_id: scope.dashboardId,
        link_token: token,
        link_token_expires_at: tokenExpiresAt,
        reminders_enabled: true,
      };

      if (existingRows?.[0]?.id) {
        const { error } = await supabase
          .from("usuarios")
          .update(payload)
          .eq("id", existingRows[0].id);
        if (error) throw error;
        return await getBotConnectionRecord(supabase, session, scope);
      }

      const { data, error } = await supabase
        .from("usuarios")
        .insert([payload])
        .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled");
      if (error) throw error;
      return data?.[0] ?? (await getBotConnectionRecord(supabase, session, scope));
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }
  }

  const { data, error } = await supabase
    .from("usuarios")
    .upsert(
      {
        owner_user_id: session.userId,
        link_token: token,
        link_token_expires_at: tokenExpiresAt,
        reminders_enabled: true,
      },
      { onConflict: "owner_user_id" },
    )
    .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled")
    .single();
  if (error) throw error;
  return data;
}
