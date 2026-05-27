type SupabaseLike = {
  from(table: string): any;
};

type BotLike = {
  api: {
    sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown>;
  };
} | null;

export async function runDailyReminders({
  supabase,
  bot,
}: {
  supabase: SupabaseLike;
  bot: BotLike;
}): Promise<{ sent: number }> {
  if (!bot) return { sent: 0 };

  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  const { data: telegramUsers } = await supabase
    .from("usuarios")
    .select("chat_id, user_id")
    .eq("reminders_enabled", true)
    .not("chat_id", "is", null);

  if (!telegramUsers?.length) return { sent: 0 };

  const userIds = telegramUsers.map((u: any) => u.user_id).filter(Boolean) as string[];

  const { data: appUsers } = await supabase
    .from("app_users")
    .select("user_id, notification_hour, notification_minute")
    .in("user_id", userIds);

  const scheduleMap = new Map<string, { hour: number; minute: number }>(
    appUsers?.map((u: any) => [
      u.user_id,
      { hour: u.notification_hour ?? 21, minute: u.notification_minute ?? 0 },
    ]) ?? [],
  );

  let sent = 0;
  for (const u of telegramUsers) {
    if (!u.chat_id) continue;
    const notif = scheduleMap.get(u.user_id) ?? { hour: 21, minute: 0 };
    if (notif.hour !== currentHour || notif.minute !== currentMinute) continue;
    try {
      await bot.api.sendMessage(
        u.chat_id,
        "🔔 *Recordatorio:* No te olvides de registrar tus gastos del día. 💸",
        { parse_mode: "Markdown" },
      );
      sent++;
    } catch (err) {
      console.error(`[cron:reminder] failed to send to chat_id=${u.chat_id}:`, err);
    }
  }

  return { sent };
}
