import crypto from "node:crypto";
import express, { type RequestHandler } from "express";
import { runDailyReminders } from "../cronJobs/reminders.ts";
import { runRecurrentes } from "../cronJobs/recurrentes.ts";
import { reconcileTransitions } from "../maintenance.ts";
import { processInviteReminders } from "../inviteReminders.ts";
import { notifyMaintenance } from "../maintenanceNotify.ts";

type SupabaseLike = { from(table: string): any };
type BotLike = { api: { sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown> } } | null;

export interface CronsDeps {
  supabase: SupabaseLike;
  bot: BotLike;
  dashboardUrl: string;
  cronSecret?: string;
}

function requireCronSecret(cronSecret: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (!cronSecret) return void res.status(401).json({ error: "cron_disabled" });
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

  return router;
}
