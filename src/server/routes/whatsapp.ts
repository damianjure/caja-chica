/**
 * routes/whatsapp.ts — dashboard endpoints for the WhatsApp link write-path.
 *
 * Mirror of the Telegram invite routes: an owner (or an editor with the
 * invite_telegram permission, reused for WhatsApp) generates an invite token,
 * lists links, confirms a pending link, or revokes one. Redemption itself
 * happens via the WhatsApp message router (acceptWhatsAppInvite), not here.
 */

import express, { type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";
import {
  createWhatsAppInviteToken,
  confirmWhatsAppLink,
  revokeWhatsAppLink,
  listWhatsAppLinks,
} from "../whatsappInvite.ts";

export interface WhatsAppRouterDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  randomBytes: (size: number) => { toString(encoding: string): string };
}

export function createWhatsAppRouter(deps: WhatsAppRouterDeps) {
  const router = express.Router();
  const { supabase, requireSession, getSession, resolveDataAccessScope, randomBytes } = deps;

  router.post("/api/whatsapp/invite-token", requireSession, async (req, res) => {
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
        .select("id")
        .eq("user_id", target_user_id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "active")
        .limit(1);
      if (tmError) throw tmError;
      if (!targetMember?.[0]) return res.status(404).json({ error: "miembro no encontrado" });

      const token = randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await createWhatsAppInviteToken(supabase, {
        dashboardId: scope.dashboardId,
        targetUserId: target_user_id,
        createdByUserId: session.userId,
        token,
        expiresAt,
      });

      return res.json({ token, expires_at: expiresAt, manualLinkCode: `/vincular ${token}` });
    } catch (err) {
      console.error("POST /api/whatsapp/invite-token:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.get("/api/whatsapp/links", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId) return res.status(403).json({ error: "forbidden" });
      const links = await listWhatsAppLinks(supabase, scope.dashboardId);
      return res.json({ links });
    } catch (err) {
      console.error("GET /api/whatsapp/links:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.post("/api/whatsapp/links/:id/confirm", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId || scope.membershipRole !== "owner") {
        return res.status(403).json({ error: "solo owner puede confirmar" });
      }
      const { confirmed } = await confirmWhatsAppLink(supabase, { linkId: req.params.id, dashboardId: scope.dashboardId });
      if (!confirmed) return res.status(404).json({ error: "link no encontrado o no pendiente" });
      return res.json({ confirmed: true });
    } catch (err) {
      console.error("POST /api/whatsapp/links/:id/confirm:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.delete("/api/whatsapp/links/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId) return res.status(403).json({ error: "forbidden" });

      const { data: linkRows, error: fetchError } = await supabase
        .from("whatsapp_links")
        .select("id, app_user_id")
        .eq("id", req.params.id)
        .eq("dashboard_id", scope.dashboardId)
        .limit(1);
      if (fetchError) throw fetchError;
      const link = linkRows?.[0];
      if (!link) return res.status(404).json({ error: "link no encontrado" });
      if (scope.membershipRole !== "owner" && link.app_user_id !== session.userId) {
        return res.status(403).json({ error: "solo owner puede revocar links de otros" });
      }

      const { revoked } = await revokeWhatsAppLink(supabase, { linkId: req.params.id, dashboardId: scope.dashboardId });
      return res.json({ revoked });
    } catch (err) {
      console.error("DELETE /api/whatsapp/links/:id:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
