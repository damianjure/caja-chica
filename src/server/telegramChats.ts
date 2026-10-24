type SupabaseLike = {
  from(table: string): any;
};

/**
 * Telegram chat id per app user id, from the single Telegram model: active
 * `telegram_links` rows (`telegram_user_id` = chat id). The legacy `usuarios`
 * table is no longer read.
 */
export async function resolveTelegramChatIds(
  supabase: SupabaseLike,
  userIds: string[],
): Promise<Map<string, string | number>> {
  const chatByUserId = new Map<string, string | number>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return chatByUserId;

  const { data: links } = await supabase
    .from("telegram_links")
    .select("app_user_id, telegram_user_id")
    .eq("status", "active")
    .not("telegram_user_id", "is", null)
    .in("app_user_id", ids);

  for (const l of (links ?? []) as any[]) {
    if (l.app_user_id && l.telegram_user_id && !chatByUserId.has(l.app_user_id)) {
      chatByUserId.set(l.app_user_id, l.telegram_user_id);
    }
  }

  return chatByUserId;
}
