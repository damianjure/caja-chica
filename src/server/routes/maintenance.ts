import express, { type RequestHandler } from "express";
import type { SupabaseLike } from "../contracts.ts";

export interface MaintenanceDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  requireSuperadmin: RequestHandler;
  getSession: (req: express.Request) => { userId: string };
  getMaintenanceState: (supabase: SupabaseLike) => Promise<any>;
  setMaintenanceStatus: (supabase: SupabaseLike, payload: any) => Promise<any>;
  notifyMaintenance: (supabase: SupabaseLike, bot: any, opts: any) => Promise<void>;
  bot: { api: { sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown> } } | null;
}

export function createMaintenanceRouter(deps: MaintenanceDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    requireSuperadmin,
    getSession,
    getMaintenanceState,
    setMaintenanceStatus,
    notifyMaintenance,
    bot,
  } = deps;

  router.get("/api/maintenance/status", async (_req, res) => {
    try {
      const state = await getMaintenanceState(supabase);
      return res.json(state);
    } catch (err) {
      console.error("GET /api/maintenance/status:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // POST /api/maintenance/activate — superadmin only
  router.post("/api/maintenance/activate", requireSession, requireSuperadmin, async (req, res) => {
    try {
      const graceEndsAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const state = await setMaintenanceStatus(supabase, {
        status: "grace",
        grace_ends_at: graceEndsAt,
        message: typeof req.body?.message === "string" ? req.body.message : null,
        estimated_end_at: typeof req.body?.estimatedEnd === "string" ? req.body.estimatedEnd : null,
        notification_sent_30min: false,
      } as any);
      // Fire-and-forget notifications — failures must not block response
      notifyMaintenance(supabase, bot ?? null, { type: "start", message: state.message ?? undefined, estimatedEnd: state.estimated_end_at ?? undefined })
        .catch((err) => console.error("[maintenance] activate notify failed:", err));
      return res.json(state);
    } catch (err) {
      console.error("POST /api/maintenance/activate:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // POST /api/maintenance/schedule — superadmin only
  router.post("/api/maintenance/schedule", requireSession, requireSuperadmin, async (req, res) => {
    try {
      const { scheduledAt, message, estimatedEnd } = req.body ?? {};
      if (!scheduledAt || typeof scheduledAt !== "string") {
        return res.status(400).json({ error: "scheduledAt is required (ISO string)" });
      }
      const state = await setMaintenanceStatus(supabase, {
        status: "scheduled",
        scheduled_at: scheduledAt,
        message: typeof message === "string" ? message : null,
        estimated_end_at: typeof estimatedEnd === "string" ? estimatedEnd : null,
        notification_sent_30min: false,
      } as any);
      return res.json(state);
    } catch (err) {
      console.error("POST /api/maintenance/schedule:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // POST /api/maintenance/end — superadmin only
  router.post("/api/maintenance/end", requireSession, requireSuperadmin, async (req, res) => {
    try {
      const state = await setMaintenanceStatus(supabase, {
        status: "none",
        started_at: null,
        scheduled_at: null,
        grace_ends_at: null,
        notification_sent_30min: false,
      } as any);
      notifyMaintenance(supabase, bot ?? null, { type: "end" })
        .catch((err) => console.error("[maintenance] end notify failed:", err));
      return res.json(state);
    } catch (err) {
      console.error("POST /api/maintenance/end:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
