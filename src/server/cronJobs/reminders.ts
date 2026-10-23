import { sendViaBrevo } from "../email.ts";
import { resolveTelegramChatIds } from "../telegramChats.ts";
import { alertSuperadmin } from "../alertSuperadmin.ts";

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
  alert = alertSuperadmin,
}: {
  supabase: SupabaseLike;
  bot: BotLike;
  sendEmail?: SendReminderEmail;
  alert?: typeof alertSuperadmin;
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

  const chatByUserId = bot
    ? await resolveTelegramChatIds(supabase, telegramUserIds, { remindersOnly: true })
    : new Map<string, string | number>();

  let sent = 0;
  let failed = 0;
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
          failed++;
          console.error(`[cron:reminder] failed to send telegram to user_id=${u.user_id}:`, err);
        }
      }
    }

    if (u.notification_email === true && u.email) {
      try {
        // sendViaBrevo never throws: a rejected email comes back as { ok: false }.
        const result = await emailSender(u.email, "Recordatorio diario de Caja Chica", emailHtml);
        if ((result as { ok?: boolean } | undefined)?.ok === false) {
          failed++;
          console.error(`[cron:reminder] email not accepted for user_id=${u.user_id}`);
        } else {
          sent++;
        }
      } catch (err) {
        failed++;
        console.error(`[cron:reminder] failed to send email to user_id=${u.user_id}:`, err);
      }
    }
  }

  if (failed > 0) {
    alert({
      code: "cron:reminders-failed",
      title: "Recordatorio diario: envíos fallidos",
      problem: `${failed} recordatorio(s) no se pudieron enviar en esta corrida.`,
      impact: "Esos usuarios no recibieron el recordatorio de hoy.",
      context: { failed: String(failed), sent: String(sent) },
      steps: [
        "Revisar los logs de [cron:reminder] en Cloud Run.",
        "Si fallan los emails, revisar BREVO_API_KEY y el email log en Super Admin.",
      ],
    });
  }

  return { sent };
}
