import crypto from "node:crypto";
import express, { type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";
import type { ActiveTelegramLink } from "../botConnection.ts";
import { buildWelcomeMessage, fetchUserDashboards } from "../../bot/welcome.ts";

export interface TelegramDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canWriteToScope: (scope: DataAccessScope) => boolean;
  getActiveTelegramLink: (session: AppSession, scope: DataAccessScope) => Promise<ActiveTelegramLink | null>;
  issueSelfLinkToken: (session: AppSession, dashboardId: string, token: string) => Promise<{ token: string; expiresAt: string }>;
  buildTelegramDeepLink: (token: string | null) => string | null;
  randomBytes: (size: number) => { toString(encoding: string): string };
  webhookPath?: string;
  webhookHandler?: RequestHandler;
  webhookSecret?: string;
  bot?: { api: { sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown> } } | null;
}

export function createTelegramRouter(deps: TelegramDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    getActiveTelegramLink,
    issueSelfLinkToken,
    buildTelegramDeepLink,
    randomBytes,
    webhookPath,
    webhookHandler,
    webhookSecret,
    bot,
  } = deps;


  // Telegram connection state of the caller, from the single Telegram model
  // (telegram_links). Pending link codes are issued by /link-token or /self-link.
  router.get("/api/bot/connection", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const link = await getActiveTelegramLink(session, scope);
      res.json({
        connected: Boolean(link),
        chatId: link?.telegram_user_id ?? null,
        telegramUsername: link?.telegram_username ?? null,
        linkedAt: link?.linked_at ?? null,
        remindersEnabled: true,
        pendingToken: null,
        pendingTokenExpiresAt: null,
        telegramDeepLink: null,
        manualStartCode: null,
      });
    } catch (err) {
      console.error("Bot connection fetch error:", err);
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  // Kept for API compatibility: issues the same pre-authorized link code as
  // /self-link (the legacy usuarios link codes are retired).
  router.post("/api/bot/connection/link-token", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope) || !scope.dashboardId) {
        return res.status(403).json({ error: "forbidden" });
      }
      const { token, expiresAt } = await issueSelfLinkToken(session, scope.dashboardId, randomBytes(16).toString("hex"));
      res.status(201).json({
        connected: false,
        chatId: null,
        telegramUsername: null,
        linkedAt: null,
        remindersEnabled: true,
        pendingToken: token,
        pendingTokenExpiresAt: expiresAt,
        telegramDeepLink: buildTelegramDeepLink(token),
        manualStartCode: `/start ${token}`,
      });
    } catch (err) {
      console.error("Bot connection token error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  router.post("/api/telegram/self-link", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId) return res.status(403).json({ error: "forbidden" });

      const { token, expiresAt } = await issueSelfLinkToken(session, scope.dashboardId, randomBytes(16).toString("hex"));

      return res.status(201).json({
        token,
        telegramDeepLink: buildTelegramDeepLink(token),
        manualStartCode: `/start ${token}`,
        expiresAt,
      });
    } catch (err) {
      console.error("POST /api/telegram/self-link:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.post("/api/telegram/invite-token", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId) return res.status(403).json({ error: "forbidden" });

      const { target_user_id } = req.body as { target_user_id?: string };
      if (!target_user_id) return res.status(400).json({ error: "target_user_id requerido" });

      const isOwner = scope.membershipRole === "owner";
      if (!isOwner) {
        const { data: callerMember } = await supabase
          .from("dashboard_members")
          .select("permissions")
          .eq("user_id", session.userId)
          .eq("dashboard_id", scope.dashboardId)
          .limit(1);
        const perms = (callerMember?.[0]?.permissions as Record<string, boolean>) ?? {};
        if (!perms.invite_telegram) return res.status(403).json({ error: "sin permiso para invitar" });
      }

      const { data: targetMember, error: tmError } = await supabase
        .from("dashboard_members")
        .select("id, role")
        .eq("user_id", target_user_id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "active")
        .limit(1);
      if (tmError) throw tmError;
      if (!targetMember?.[0]) return res.status(404).json({ error: "miembro no encontrado" });

      await supabase
        .from("telegram_invite_tokens")
        .update({ status: "expired" })
        .eq("target_user_id", target_user_id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "pending");

      const token = randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: insertError } = await supabase
        .from("telegram_invite_tokens")
        .insert({
          token,
          dashboard_id: scope.dashboardId,
          target_user_id,
          created_by_user_id: session.userId,
          expires_at: expiresAt,
          status: "pending",
        });
      if (insertError) throw insertError;

      return res.json({ token, expires_at: expiresAt });
    } catch (err) {
      console.error("POST /api/telegram/invite-token:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.get("/api/telegram/links", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId) return res.status(403).json({ error: "forbidden" });

      const { data, error } = await supabase
        .from("telegram_links")
        .select("id, telegram_user_id, telegram_username, app_user_id, status, linked_at, created_at")
        .eq("dashboard_id", scope.dashboardId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;

      const links = [...(data ?? [])];
      return res.json({ links });
    } catch (err) {
      console.error("GET /api/telegram/links:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.post("/api/telegram/links/:id/confirm", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId || scope.membershipRole !== "owner") {
        return res.status(403).json({ error: "solo owner puede confirmar" });
      }

      const { id } = req.params;
      const { data, error } = await supabase
        .from("telegram_links")
        .update({ status: "active", linked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "pending_owner_confirm")
        .select("id, telegram_user_id, app_user_id")
        .limit(1);
      if (error) throw error;
      const confirmedLink = data?.[0];
      if (!confirmedLink) return res.status(404).json({ error: "link no encontrado o no pendiente" });

      // Best-effort welcome DM — must never block or fail the confirmation.
      if (bot && confirmedLink.telegram_user_id && confirmedLink.app_user_id) {
        try {
          const dashboards = await fetchUserDashboards(supabase, confirmedLink.app_user_id);
          await bot.api.sendMessage(confirmedLink.telegram_user_id, buildWelcomeMessage(dashboards));
        } catch (notifyErr) {
          console.error("[confirm] welcome DM failed:", notifyErr);
        }
      }

      return res.json({ confirmed: true });
    } catch (err) {
      console.error("POST /api/telegram/links/:id/confirm:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.delete("/api/telegram/links/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId) return res.status(403).json({ error: "forbidden" });

      const { id } = req.params;

      const { data: linkRows, error: fetchError } = await supabase
        .from("telegram_links")
        .select("id, app_user_id")
        .eq("id", id)
        .eq("dashboard_id", scope.dashboardId)
        .limit(1);
      if (fetchError) throw fetchError;
      const link = linkRows?.[0];
      if (!link) return res.status(404).json({ error: "link no encontrado" });

      if (scope.membershipRole !== "owner" && link.app_user_id !== session.userId) {
        return res.status(403).json({ error: "solo owner puede revocar links de otros" });
      }

      const { error: updateError } = await supabase
        .from("telegram_links")
        .update({ status: "revoked" })
        .eq("id", id);
      if (updateError) throw updateError;

      return res.json({ revoked: true });
    } catch (err) {
      console.error("DELETE /api/telegram/links/:id:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  if (webhookPath && webhookHandler) {
    router.post(webhookPath, (req, res, next) => {
      if (webhookSecret) {
        const incoming = req.headers["x-telegram-bot-api-secret-token"];
        const got = Buffer.from(typeof incoming === "string" ? incoming : "", "utf8");
        const expected = Buffer.from(webhookSecret, "utf8");
        if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
          res.sendStatus(403);
          return;
        }
      }
      next();
    }, webhookHandler);
  }


  return router;
}
