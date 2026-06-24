import crypto from "node:crypto";
import express, { type RequestHandler } from "express";
import { runDailyReminders } from "../cronJobs/reminders.ts";
import { runRecurrentes } from "../cronJobs/recurrentes.ts";
import { runDrainAiQueue } from "../cronJobs/drainAiQueue.ts";
import { reconcileTransitions } from "../maintenance.ts";
import { processInviteReminders } from "../inviteReminders.ts";
import { notifyMaintenance } from "../maintenanceNotify.ts";
import { alertSuperadmin } from "../alertSuperadmin.ts";
import type { GenAILike } from "../contracts.ts";

type SupabaseLike = { from(table: string): any };
type BotLike = { api: { sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown>; getFile(fileId: string): Promise<{ file_path?: string }> } } | null;

export interface CronsDeps {
  supabase: SupabaseLike;
  bot: BotLike;
  dashboardUrl: string;
  cronSecret?: string;
  genAI?: GenAILike;
  genAI2?: GenAILike | null;
  botToken?: string;
}

function requireCronSecret(cronSecret: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (!cronSecret) {
      alertSuperadmin({
        code: "cron:secret-missing",
        title: "Crons deshabilitados: CRON_SECRET ausente",
        problem: "Llegó una petición a /api/crons/* pero CRON_SECRET no está seteado en el backend, así que TODAS las peticiones de cron se rechazan con 401 (fail-closed).",
        impact: "No corren los jobs: recordatorios diarios, recurrentes, reconciliación de mantenimiento y recordatorios de invitación.",
        context: { endpoint: req.path },
        steps: [
          "Setear CRON_SECRET en las env vars de Cloud Run (servicio caja-chica, us-west2).",
          "Usar el mismo valor en el header X-Cron-Secret de los jobs de Cloud Scheduler.",
          "Valor de respaldo en Secret Manager: caja-chica-cron-secret. Redeployar tras setearlo.",
        ],
      });
      return void res.status(401).json({ error: "cron_disabled" });
    }
    const provided = req.header("X-Cron-Secret") || "";
    const expected = Buffer.from(cronSecret, "utf8");
    const got = Buffer.from(provided, "utf8");
    if (got.length !== expected.length) return void res.status(401).json({ error: "invalid_secret" });
    if (!crypto.timingSafeEqual(got, expected)) return void res.status(401).json({ error: "invalid_secret" });
    next();
  };
}

export function createCronsRouter(deps: CronsDeps) {
  const router = express.Router();
  const auth = requireCronSecret(deps.cronSecret);


  router.post("/api/crons/reminders", auth, async (_req, res) => {
    try {
      const result = await runDailyReminders({ supabase: deps.supabase, bot: deps.bot });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[cron:reminders] failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/api/crons/recurrentes", auth, async (_req, res) => {
    try {
      const result = await runRecurrentes({ supabase: deps.supabase, bot: deps.bot });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[cron:recurrentes] failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/api/crons/maintenance", auth, async (_req, res) => {
    try {
      await reconcileTransitions(
        deps.supabase as any,
        (type) => notifyMaintenance(deps.supabase as any, deps.bot, { type }),
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[cron:maintenance] failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/api/crons/invite-reminders", auth, async (_req, res) => {
    try {
      const { sent } = await processInviteReminders(deps.supabase as any, {
        baseUrl: deps.dashboardUrl,
      });
      res.json({ ok: true, sent });
    } catch (err) {
      console.error("[cron:invite-reminders] failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/api/crons/drain-ai-queue", auth, async (_req, res) => {
    if (!deps.genAI) return void res.status(503).json({ error: "genai_not_configured" });
    try {
      const result = await runDrainAiQueue({
        supabase: deps.supabase as any,
        genAI: deps.genAI,
        genAI2: deps.genAI2 ?? null,
        bot: deps.bot as any,
        botToken: deps.botToken,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[cron:drain-ai-queue] failed:", err);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
