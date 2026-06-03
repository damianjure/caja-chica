import { sendViaBrevo } from "../email.ts";

type SupabaseLike = {
  from(table: string): any;
};

type BotLike = {
  api: {
    sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown>;
  };
} | null;

type SendReminderEmail = (to: string, subject: string, html: string) => Promise<unknown>;

function reminderEmailHtml(): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f7f3ed;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#211B14"><div style="max-width:520px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #D8CABB;border-radius:18px;padding:24px"><p style="margin:0 0 8px;color:#147E60;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Caja Chica</p><h1 style="margin:0 0 10px;font-size:22px;line-height:1.2">Recordatorio diario</h1><p style="margin:0;color:#574B3E;font-size:15px;line-height:1.55">No te olvides de registrar tus gastos del día. Dos minutos hoy evitan revisar todo junto después.</p></div></div></body></html>`;
}

export async function runDailyReminders({
  supabase,
  bot,
  sendEmail,
}: {
  supabase: SupabaseLike;
  bot: BotLike;
  sendEmail?: SendReminderEmail;
}): Promise<{ sent: number }> {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  const { data: appUsers } = await supabase
    .from("app_users")
    .select("user_id, email, notification_hour, notification_minute, notification_enabled, notification_telegram, notification_email")
    .eq("notification_enabled", true);

  const dueUsers = (appUsers ?? []).filter((u: any) => {
    const hour = u.notification_hour ?? 21;
    const minute = u.notification_minute ?? 0;
    return hour === currentHour && minute === currentMinute && (u.notification_telegram !== false || u.notification_email === true);
  });

  if (!dueUsers.length) return { sent: 0 };

  const telegramUserIds = dueUsers
    .filter((u: any) => u.notification_telegram !== false)
    .map((u: any) => u.user_id)
    .filter(Boolean) as string[];

  const chatByUserId = new Map<string, string | number>();
  if (bot && telegramUserIds.length > 0) {
    // Owners linked via the legacy one-shot flow live in `usuarios`.
    const { data: telegramUsers } = await supabase
      .from("usuarios")
      .select("chat_id, user_id")
      .eq("reminders_enabled", true)
      .not("chat_id", "is", null)
      .in("user_id", telegramUserIds);

    for (const u of (telegramUsers ?? []) as any[]) {
      if (u.user_id && u.chat_id) chatByUserId.set(u.user_id, u.chat_id);
    }

    // Editors/viewers linked via the multi-user flow live in `telegram_links`
    // (keyed by telegram_user_id = chat id). Without this, members who enable
    // their reminder from the bot would never receive it.
    const unresolved = telegramUserIds.filter((id) => !chatByUserId.has(id));
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
  }

  let sent = 0;
  const emailSender: SendReminderEmail = sendEmail ?? ((to, subject, html) => sendViaBrevo(to, subject, html, { emailType: "reminder" }));
  const emailHtml = reminderEmailHtml();

  for (const u of dueUsers as any[]) {
    if (u.notification_telegram !== false && bot) {
      const chatId = chatByUserId.get(u.user_id);
      if (chatId) {
        try {
          await bot.api.sendMessage(
            chatId,
            "🔔 *Recordatorio:* No te olvides de registrar tus gastos del día. 💸",
            { parse_mode: "Markdown" },
          );
          sent++;
        } catch (err) {
          console.error(`[cron:reminder] failed to send telegram to user_id=${u.user_id}:`, err);
        }
      }
    }

    if (u.notification_email === true && u.email) {
      try {
        await emailSender(u.email, "Recordatorio diario de Caja Chica", emailHtml);
        sent++;
      } catch (err) {
        console.error(`[cron:reminder] failed to send email to user_id=${u.user_id}:`, err);
      }
    }
  }

  return { sent };
}
