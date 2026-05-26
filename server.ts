import { Bot, webhookCallback } from "grammy";
import cron from "node-cron";

loadRuntimeEnv();

// --- SERVICES ---
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { createApp } from "./src/server/app.ts";
import { processInviteReminders } from "./src/server/inviteReminders.ts";
import { loadRuntimeEnv } from "./src/server/env.ts";
import { addMonth, computeNextRun } from "./src/server/recurrentes.ts";
import { registerBotHandlers, registerBotCommands } from "./src/bot/index.ts";
import type { BotDeps } from "./src/bot/deps.ts";
import { hydrateCache, reconcileTransitions } from "./src/server/maintenance.ts";
import { notifyMaintenance } from "./src/server/maintenanceNotify.ts";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServerKey) {
  console.error("❌ SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas. El proceso no puede continuar sin ellas.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServerKey);
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const dashboardUrl = process.env.DASHBOARD_URL || "https://caja-chica-bot.web.app";

// --- TELEGRAM BOT ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new Bot(botToken) : null;

if (bot) {
  console.log("🤖 Configurando Bot de Telegram...");

  const deps: BotDeps = {
    supabase,
    bot,
    dashboardUrl,
    genAI,
    botToken: botToken as string,
  };

  registerBotHandlers(bot, deps);
  void registerBotCommands(bot);

  // Long polling only for local dev (Cloud Run uses webhook defined below)
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== "production") {
    bot.start().catch((err) => {
      console.error("⚠️ Bot start error:", err.message);
    });
  }

  // --- CRON JOBS ---

  // Reminder cron: runs every minute, checks each user's notification_hour + minute
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    const { data: telegramUsers } = await supabase
      .from("usuarios")
      .select("chat_id, user_id")
      .eq("reminders_enabled", true)
      .not("chat_id", "is", null);

    if (!telegramUsers?.length) return;

    const userIds = telegramUsers.map((u) => u.user_id).filter(Boolean) as string[];

    const { data: appUsers } = await supabase
      .from("app_users")
      .select("user_id, notification_hour, notification_minute")
      .in("user_id", userIds);

    const scheduleMap = new Map<string, { hour: number; minute: number }>(
      appUsers?.map((u) => [u.user_id, { hour: u.notification_hour ?? 21, minute: u.notification_minute ?? 0 }]) ?? [],
    );

    for (const u of telegramUsers) {
      if (!u.chat_id) continue;
      const notif = scheduleMap.get(u.user_id) ?? { hour: 21, minute: 0 };
      if (notif.hour !== currentHour || notif.minute !== currentMinute) continue;
      try {
        await bot.api.sendMessage(u.chat_id, "🔔 *Recordatorio:* No te olvides de registrar tus gastos del día. 💸", { parse_mode: "Markdown" });
      } catch (err) {
        console.error(`[cron:reminder] failed to send to chat_id=${u.chat_id}:`, err);
      }
    }
  });

  // Recurrentes cron: daily at 08:00 UTC
  cron.schedule("0 8 * * *", async () => {
    const today = new Date();
    const { data: recs } = await supabase.from("recurrentes").select("*");

    for (const r of recs ?? []) {
      if (!r.is_active || r.deleted_at) continue;

      try {
        let shouldProcess = false;
        const last = r.last_processed ? new Date(r.last_processed) : null;

        if (!last) shouldProcess = true;
        else {
          const diff = today.getTime() - last.getTime();
          const days = diff / (1000 * 3600 * 24);
          if (r.frecuencia === "diario" && days >= 1) shouldProcess = true;
          if (r.frecuencia === "semanal" && days >= 7) shouldProcess = true;
          if (r.frecuencia === "quincenal" && days >= 14) shouldProcess = true;
          if (r.frecuencia === "mensual") {
            const nextRun = computeNextRun("mensual", last, typeof r.day_of_month === "number" ? r.day_of_month : null, today);
            if (nextRun && today >= nextRun) shouldProcess = true;
          }
          if (r.frecuencia === "anual") {
            let nextRun = addMonth(last);
            for (let i = 0; i < 11; i++) nextRun = addMonth(nextRun);
            if (today >= nextRun) shouldProcess = true;
          }
        }

        if (shouldProcess) {
          await supabase.from("movimientos").insert([{
            ...(r.dashboard_id && r.created_by_user_id
              ? { dashboard_id: r.dashboard_id, created_by_user_id: r.created_by_user_id }
              : { owner_user_id: r.owner_user_id }),
            monto: Math.abs(r.monto),
            tipo: r.tipo,
            moneda: r.moneda,
            categoria: r.categoria,
            empresa_nombre: r.empresa_nombre,
            descripcion: r.descripcion + " (Recurrente)",
            original_text: "System Generated",
            conciliado: true,
            conciliado_notas: null,
          }]);
          await supabase.from("recurrentes").update({ last_processed: today.toISOString() }).eq("id", r.id);
          if (r.chat_id) {
            bot.api.sendMessage(r.chat_id, `🔄 *Recurrente Registrado:* ${r.descripcion}\n💰 ${r.monto} ${r.moneda}`, { parse_mode: "Markdown" });
          }
        }
      } catch (recErr) {
        console.error(`[cron:recurrentes] Error processing recurrente id=${r.id}:`, recErr);
      }
    }
  });
} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN no configurado. El bot no se iniciará.");
}

// Maintenance mode cron — every minute
cron.schedule("* * * * *", async () => {
  try {
    await reconcileTransitions(
      supabase as unknown as Parameters<typeof reconcileTransitions>[0],
      (type) => notifyMaintenance(supabase as any, bot, { type }),
    );
  } catch (err) {
    console.error("[cron:maintenance] Unexpected error:", err);
  }
});

// Invite reminder cron — daily at 10:00 UTC
cron.schedule("0 10 * * *", async () => {
  try {
    const { sent } = await processInviteReminders(supabase as unknown as Parameters<typeof processInviteReminders>[0]);
    console.log(`[cron:inviteReminder] Done. Sent: ${sent}`);
  } catch (err) {
    console.error("[cron:inviteReminder] Unexpected error:", err);
  }
});

const PORT = parseInt(process.env.PORT || "8080", 10);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://caja-chica-bot.web.app").split(",");
const webhookPath = bot ? "/webhook/telegram" : undefined;
const app = createApp({
  supabase,
  genAI,
  allowedOrigins,
  botActive: !!bot,
  webhookPath,
  webhookHandler: bot
    ? webhookCallback(bot, "express", {
        onTimeout: "return",
        timeoutMilliseconds: 9000,
      })
    : undefined,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  adminApiToken: process.env.ADMIN_API_TOKEN,
  enableDangerousRoutes: process.env.ENABLE_DANGEROUS_ROUTES === "true",
  publicAppUrl: dashboardUrl,
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  googleDriveRedirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
});

// Hydrate maintenance cache on startup so first request reads from cache, not DB.
hydrateCache(supabase as any).catch((err) => {
  console.warn("[maintenance] Startup hydration failed (non-fatal):", err);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot server running on http://0.0.0.0:${PORT}`);
});

function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
