// Maintenance notifications: Brevo email + Telegram bot messages.
// Fan-out via Promise.allSettled — one failure does not abort others.

import type { SupabaseLike } from "./app.ts";
import { warnIfListCapped } from "./listCap.ts";

export interface NotifyOpts {
  type: "start" | "end" | "reminder";
  message?: string;
  estimatedEnd?: string;
}

function buildMessage(opts: NotifyOpts): string {
  const { type, message, estimatedEnd } = opts;
  const endNote = estimatedEnd
    ? `\nFinalización estimada: ${new Date(estimatedEnd).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`
    : "";
  const customMsg = message ? `\n\n${message}` : "";

  if (type === "start") {
    return `🔧 *Mantenimiento iniciado*\n\nEl sistema está en mantenimiento. Los registros están temporalmente suspendidos.${customMsg}${endNote}`;
  }
  if (type === "end") {
    return `✅ *Mantenimiento finalizado*\n\nEl sistema está nuevamente operativo. Ya podés registrar movimientos.`;
  }
  // reminder
  return `⏰ *Aviso de mantenimiento*\n\nEn 30 minutos el sistema entrará en mantenimiento.${customMsg}${endNote}`;
}

function buildEmailSubject(type: NotifyOpts["type"]): string {
  if (type === "start") return "Caja Chica — Sistema en mantenimiento";
  if (type === "end") return "Caja Chica — Sistema restaurado";
  return "Caja Chica — Aviso de mantenimiento en 30 minutos";
}

function buildEmailHtml(text: string, subject: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${subject}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;margin:0;padding:32px 20px;background:#f9f9f7;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<p style="font-size:15px;line-height:1.6;white-space:pre-line;">${text.replace(/\*([^*]+)\*/g, "<strong>$1</strong>")}</p>
<p style="font-size:13px;color:#888;margin-top:24px;">— El equipo de Caja Chica</p>
</div>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, htmlContent: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY ?? null;
  if (!apiKey) {
    console.warn("[maintenanceNotify] BREVO_API_KEY not set — skipping email to", to);
    return;
  }
  const fromEmail = process.env.FROM_EMAIL ?? "hola@damianjure.com";
  const fromName = process.env.FROM_NAME ?? "Caja Chica";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[maintenanceNotify] Brevo error ${res.status} for ${to}:`, body);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyMaintenance(
  supabase: SupabaseLike,
  bot: { api: { sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown> } } | null | undefined,
  opts: NotifyOpts,
): Promise<void> {
  const text = buildMessage(opts);
  const subject = buildEmailSubject(opts.type);
  const html = buildEmailHtml(text, subject);

  // Fetch email recipients: active users
  const { data: emailUsers } = await (supabase as any)
    .from("app_users")
    .select("user_id, email")
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(500) as { data: Array<{ user_id: string; email: string }> | null };
  warnIfListCapped(emailUsers, "maintenanceNotify email recipients");

  // Fetch Telegram recipients: active linked users
  const { data: telegramLinks } = await (supabase as any)
    .from("telegram_links")
    .select("telegram_chat_id, user_id")
    .eq("status", "active")
    .limit(500) as { data: Array<{ telegram_chat_id: string; user_id: string }> | null };
  warnIfListCapped(telegramLinks, "maintenanceNotify telegram recipients");

  const emailTasks = (emailUsers ?? []).map((u) =>
    sendEmail(u.email, subject, html).catch((err) => {
      console.error(`[maintenanceNotify] Email failed for ${u.email}:`, err);
    }),
  );

  const telegramTasks = bot
    ? (telegramLinks ?? []).map((link) =>
        bot.api
          .sendMessage(link.telegram_chat_id, text, { parse_mode: "Markdown" })
          .catch((err: unknown) => {
            console.error(`[maintenanceNotify] Telegram failed for chat_id=${link.telegram_chat_id}:`, err);
          }),
      )
    : [];

  await Promise.allSettled([...emailTasks, ...telegramTasks]);
}
