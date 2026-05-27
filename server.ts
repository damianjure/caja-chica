import { Bot, webhookCallback } from "grammy";

loadRuntimeEnv();

// --- SERVICES ---
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { createApp } from "./src/server/app.ts";
import { loadRuntimeEnv } from "./src/server/env.ts";
import { registerBotHandlers, registerBotCommands } from "./src/bot/index.ts";
import type { BotDeps } from "./src/bot/deps.ts";
import { hydrateCache } from "./src/server/maintenance.ts";

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

} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN no configurado. El bot no se iniciará.");
}

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
  bot: bot ?? null,
  cronSecret: process.env.CRON_SECRET,
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
