type SupabaseLike = {
  from(table: string): any;
};

/**
 * Telegram chat id per app user id. Owners linked through the legacy one-shot
 * flow live in `usuarios`; editors/viewers linked through the multi-user flow
 * live in `telegram_links` (keyed by `telegram_user_id` = chat id).
 *
 * `remindersOnly` restricts legacy owners to those with reminders enabled
 * (what the daily reminder needs); other notices go to any linked chat.
 */
export async function resolveTelegramChatIds(
  supabase: SupabaseLike,
  userIds: string[],
  opts: { remindersOnly?: boolean } = {},
): Promise<Map<string, string | number>> {
  const chatByUserId = new Map<string, string | number>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return chatByUserId;

  let legacyQuery = supabase.from("usuarios").select("chat_id, user_id");
  if (opts.remindersOnly) legacyQuery = legacyQuery.eq("reminders_enabled", true);
  const { data: telegramUsers } = await legacyQuery.not("chat_id", "is", null).in("user_id", ids);

  for (const u of (telegramUsers ?? []) as any[]) {
    if (u.user_id && u.chat_id) chatByUserId.set(u.user_id, u.chat_id);
  }

  const unresolved = ids.filter((id) => !chatByUserId.has(id));
  if (unresolved.length > 0) {
    const { data: links } = await supabase
      .from("telegram_links")
      .select("app_user_id, telegram_user_id")
      .eq("status", "active")
      .not("telegram_user_id", "is", null)
      .in("app_user_id", unresolved);

    for (const l of (links ?? []) as any[]) {
      if (l.app_user_id && l.telegram_user_id && !chatByUserId.has(l.app_user_id)) {
        chatByUserId.set(l.app_user_id, l.telegram_user_id);
      }
    }
  }

  return chatByUserId;
}
