import { randomBytes } from "node:crypto";
import express, { type RequestHandler } from "express";
import type { AppSession, AppUserStatus, SupabaseLike } from "../contracts.ts";
import type { ActiveSender } from "../emailSettings.ts";
import type { EmailLogRow, EmailLogFilters } from "../emailLog.ts";
import type { BrevoSender } from "../brevoSenders.ts";
import { warnIfListCapped } from "../listCap.ts";

export interface AdminEmailDeps {
  brevoApiKey?: string;
  getActiveSender: (supabase: SupabaseLike) => Promise<ActiveSender>;
  setEmailSettings: (supabase: SupabaseLike, patch: { fromEmail: string; fromName: string; updatedBy?: string | null }) => Promise<ActiveSender>;
  listVerifiedSenders: (apiKey: string) => Promise<BrevoSender[]>;
  listEmailLog: (supabase: SupabaseLike, filters: EmailLogFilters) => Promise<EmailLogRow[]>;
  sendTestEmail: (to: string, sender: ActiveSender) => Promise<{ ok: boolean; messageId?: string }>;
  tierEmailTest: RequestHandler;
  parseEmailSettingsRequest: (body: unknown) => { from_email: string; from_name: string } | null;
  parseTestSendRequest: (body: unknown) => { to: string } | null;
}

export interface AdminDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  requireAdmin: RequestHandler;
  requireSuperadmin: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  publicAppUrl?: string;
  botActive: boolean;
  parseInvitationRequest: (body: unknown) => { email: string; role: string } | null;
  sendAppInvitationEmail: (email: string, inviteUrl: string, emailType?: import("../email.ts").EmailType, inviterName?: string) => Promise<void>;
  emailDeps?: AdminEmailDeps;
}

export function createAdminRouter(deps: AdminDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    requireAdmin,
    requireSuperadmin,
    getSession,
    publicAppUrl,
    botActive,
    parseInvitationRequest,
    sendAppInvitationEmail,
    emailDeps,
  } = deps;

  async function resolveInviterDisplayName(session: AppSession): Promise<string | null> {
    const sessionName = session.profileName?.trim();
    if (sessionName) return sessionName;

    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("display_name")
        .eq("user_id", session.userId)
        .limit(1);
      if (error) throw error;

      const displayName = data?.[0]?.display_name?.trim();
      return displayName || null;
    } catch (err) {
      console.error("[adminInvitations] Failed to resolve inviter display_name:", err);
      return null;
    }
  }

  router.get("/api/health", (_req, res) => {
    res.json({ status: "ok", botActive });
  });

  router.get("/api/admin/users", requireSession, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("user_id, email, role, status, invited_by, invited_at, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      warnIfListCapped(data, "GET /api/admin/users");
      res.json(data ?? []);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  // Returns dashboards-as-tree: each dashboard with its owner + members + pending invites,
  // plus orphan users (no dashboard membership) and pending app-level invitations.
  // Replaces the flat user list in the Super Admin panel.
  //
  // SECURITY: superadmin-only because the response cross-cuts every tenant dashboard.
  // Invite tokens are NOT included in the response (bearer links must not be enumerable
  // even by superadmin) — UI uses dedicated revoke/resend endpoints if needed.
  router.get("/api/admin/dashboards-tree", requireSession, requireSuperadmin, async (_req, res) => {
    try {
      const [dashboardsRes, membersRes, dashInvitesRes, usersRes, appInvitesRes] = await Promise.all([
        supabase.from("dashboards").select("id, name, personal_for_user_id, created_at").order("created_at", { ascending: true }),
        supabase.from("dashboard_members").select("id, dashboard_id, user_id, role, status, created_at, app_users!dashboard_members_user_id_fkey(email, role, status)").order("created_at", { ascending: true }),
        supabase.from("dashboard_invitations").select("id, dashboard_id, email, role, status, expires_at, created_at").eq("status", "pending").order("created_at", { ascending: false }),
        supabase.from("app_users").select("user_id, email, role, status, created_at"),
        supabase.from("user_invitations").select("id, email, role, status, expires_at, created_at").eq("status", "pending").order("created_at", { ascending: false }),
      ]);

      if (dashboardsRes.error) throw dashboardsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (dashInvitesRes.error) throw dashInvitesRes.error;
      if (usersRes.error) throw usersRes.error;
      if (appInvitesRes.error) throw appInvitesRes.error;

      const dashboards = dashboardsRes.data ?? [];
      const members = (membersRes.data ?? []) as any[];
      const dashInvites = dashInvitesRes.data ?? [];
      const users = usersRes.data ?? [];
      // SECURITY: do NOT include invite_token or invite_url in the tree response.
      // Tokens are bearer secrets — superadmin uses dedicated /resend or /revoke
      // endpoints to act on invites, never enumerates raw URLs.
      const appInvites = appInvitesRes.data ?? [];

      const membersByDash = new Map<string, any[]>();
      const userHasMembership = new Set<string>();
      for (const m of members) {
        userHasMembership.add(m.user_id);
        const arr = membersByDash.get(m.dashboard_id) ?? [];
        arr.push(m);
        membersByDash.set(m.dashboard_id, arr);
      }

      const invitesByDash = new Map<string, any[]>();
      for (const inv of dashInvites) {
        const arr = invitesByDash.get(inv.dashboard_id) ?? [];
        arr.push(inv);
        invitesByDash.set(inv.dashboard_id, arr);
      }

      const tree = dashboards.map((d: any) => {
        const dashMembers = membersByDash.get(d.id) ?? [];
        const ownerMember = dashMembers.find((m: any) => m.role === "owner");
        const nonOwnerMembers = dashMembers
          .filter((m: any) => m.role !== "owner")
          .map((m: any) => ({
            user_id: m.user_id,
            email: m.app_users?.email ?? null,
            app_role: m.app_users?.role ?? null,
            app_status: m.app_users?.status ?? null,
            dashboard_role: m.role,
            membership_status: m.status,
            joined_at: m.created_at,
          }));

        return {
          dashboard_id: d.id,
          dashboard_name: d.name,
          created_at: d.created_at,
          owner: ownerMember
            ? {
                user_id: ownerMember.user_id,
                email: ownerMember.app_users?.email ?? null,
                app_role: ownerMember.app_users?.role ?? null,
                app_status: ownerMember.app_users?.status ?? null,
                joined_at: ownerMember.created_at,
              }
            : null,
          members: nonOwnerMembers,
          pending_invitations: invitesByDash.get(d.id) ?? [],
        };
      });

      const orphanUsers = users.filter((u: any) => !userHasMembership.has(u.user_id));

      res.json({
        dashboards: tree,
        orphan_users: orphanUsers,
        pending_app_invitations: appInvites,
      });
    } catch (err) {
      console.error("[admin] dashboards-tree error:", err);
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  router.get("/api/admin/invitations", requireSession, requireAdmin, async (req, res) => {
    try {
      const session = getSession(req);
      const { data, error } = await supabase
        .from("user_invitations")
        .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at, last_reminder_at, invited_by")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      warnIfListCapped(data, "GET /api/admin/invitations");
      const rows = (data ?? []) as any[];

      const uniq = <T,>(xs: T[]) => Array.from(new Set(xs.filter(Boolean))) as T[];
      const inviterIds = uniq(rows.map((r) => r.invited_by));
      const emails = uniq(rows.map((r) => r.email));

      // Email del que invitó.
      const inviterEmailById = new Map<string, string>();
      if (inviterIds.length) {
        const { data: inv } = await supabase.from("app_users").select("user_id, email").in("user_id", inviterIds);
        for (const u of (inv ?? []) as any[]) inviterEmailById.set(u.user_id, u.email);
      }

      // Relación actual: ¿de qué dashboard(s) ajeno(s) es miembro hoy?
      const membershipByUserId = new Map<string, string[]>();
      const emailToUserId = new Map<string, string>();
      if (emails.length) {
        const { data: invitedUsers } = await supabase.from("app_users").select("user_id, email").in("email", emails);
        const invitedUserIds: string[] = [];
        for (const u of (invitedUsers ?? []) as any[]) { emailToUserId.set(u.email, u.user_id); invitedUserIds.push(u.user_id); }
        if (invitedUserIds.length) {
          const { data: members } = await supabase
            .from("dashboard_members")
            .select("user_id, dashboard_id, role")
            .in("user_id", invitedUserIds)
            .eq("status", "active");
          const nonOwner = ((members ?? []) as any[]).filter((m) => m.role !== "owner");
          const dashIds = uniq(nonOwner.map((m) => m.dashboard_id));
          const ownerEmailByDash = new Map<string, string>();
          if (dashIds.length) {
            const { data: owners } = await supabase
              .from("dashboard_members")
              .select("user_id, dashboard_id")
              .eq("role", "owner")
              .in("dashboard_id", dashIds);
            const ownerIds = uniq(((owners ?? []) as any[]).map((o) => o.user_id));
            const ownerEmailById = new Map<string, string>();
            if (ownerIds.length) {
              const { data: ownerUsers } = await supabase.from("app_users").select("user_id, email").in("user_id", ownerIds);
              for (const u of (ownerUsers ?? []) as any[]) ownerEmailById.set(u.user_id, u.email);
            }
            for (const o of (owners ?? []) as any[]) {
              const e = ownerEmailById.get(o.user_id);
              if (e) ownerEmailByDash.set(o.dashboard_id, e);
            }
          }
          for (const m of nonOwner) {
            const e = ownerEmailByDash.get(m.dashboard_id);
            if (!e) continue;
            const arr = membershipByUserId.get(m.user_id) ?? [];
            if (!arr.includes(e)) arr.push(e);
            membershipByUserId.set(m.user_id, arr);
          }
        }
      }

      const invitations = rows.map((r) => {
        const userId = emailToUserId.get(r.email);
        // SECURITY: invite tokens are bearer secrets. Only the superadmin or the
        // admin who created the invite may see the token/URL — same policy as
        // dashboards-tree (which never returns tokens at all).
        const canSeeToken = session.role === "superadmin" || r.invited_by === session.userId;
        if (!canSeeToken) delete r.invite_token;
        return {
          ...r,
          ...(canSeeToken ? { invite_url: `${publicAppUrl || ""}/?invite=${r.invite_token}` } : {}),
          invited_by_email: r.invited_by ? inviterEmailById.get(r.invited_by) ?? null : null,
          membership_of: userId ? membershipByUserId.get(userId) ?? [] : [],
          // Accepted invitation whose user account no longer exists → deleted user.
          user_deleted: r.status === "accepted" && !emailToUserId.has(r.email),
        };
      });
      res.json(invitations);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  router.post("/api/admin/invitations", requireSession, requireAdmin, async (req, res) => {
    try {
      const payload = parseInvitationRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      if (payload.role === "superadmin" && session.role !== "superadmin") {
        return res.status(403).json({ error: "forbidden" });
      }

      // Reject if accepted invitation already exists for this email
      const { data: acceptedRows } = await supabase
        .from("user_invitations")
        .select("id")
        .eq("email", payload.email)
        .eq("status", "accepted")
        .limit(1) as { data: unknown[] | null };
      if (acceptedRows && acceptedRows.length > 0) {
        return res.status(409).json({ error: "already_accepted" });
      }

      // Reject if active (pending + not expired) invitation already exists for this email
      const { data: existingRows } = await supabase
        .from("user_invitations")
        .select("id")
        .eq("email", payload.email)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .limit(1) as { data: unknown[] | null };
      if (existingRows && existingRows.length > 0) {
        return res.status(409).json({ error: "invitation_active" });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invitationPayload = {
        email: payload.email,
        role: payload.role,
        status: "pending",
        invited_by: session.userId,
        expires_at: expiresAt,
        // Always mint a fresh token: the upsert (onConflict email) would
        // otherwise resurrect the token of a previously revoked/expired invite.
        invite_token: randomBytes(24).toString("hex"),
      };

      const { data, error } = await supabase
        .from("user_invitations")
        .upsert(invitationPayload, { onConflict: "email" })
        .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at")
        .single();
      if (error) throw error;

      const inviteUrl = `${publicAppUrl || ""}/?invite=${data.invite_token}`;
      res.status(201).json({ ...data, invite_url: inviteUrl });
      const inviterName = await resolveInviterDisplayName(session);
      void sendAppInvitationEmail(data.email, inviteUrl, undefined, inviterName ?? session.email.split("@")[0]);
    } catch (err) {
      console.error("Invitation error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  router.post(
    "/api/admin/invitations/:id/revoke",
    requireSession,
    requireAdmin,
    async (req, res) => {
      try {
        const { error } = await supabase
          .from("user_invitations")
          .update({ status: "revoked", updated_at: new Date().toISOString() })
          .eq("id", req.params.id);
        if (error) throw error;
        res.json({ ok: true });
      } catch (_err) {
        res.status(500).json({ error: "failed_to_save" });
      }
    },
  );

  router.delete(
    "/api/admin/invitations/:id",
    requireSession,
    requireAdmin,
    async (req, res) => {
      try {
        const { data: rows, error: fetchError } = await supabase
          .from("user_invitations")
          .select("id, status, email")
          .eq("id", req.params.id)
          .limit(1);
        if (fetchError) throw fetchError;
        const inv = rows?.[0] as { status?: string; email?: string } | undefined;
        if (!inv) return res.status(404).json({ error: "not_found" });

        let deletable = inv.status === "revoked" || inv.status === "expired";
        // Accepted invitation is deletable only if its user account no longer exists.
        if (!deletable && inv.status === "accepted" && inv.email) {
          const { data: u } = await supabase.from("app_users").select("user_id").eq("email", inv.email).limit(1);
          deletable = !u || u.length === 0;
        }
        if (!deletable) return res.status(400).json({ error: "not_deletable" });

        const { error } = await supabase.from("user_invitations").delete().eq("id", req.params.id);
        if (error) throw error;
        res.json({ ok: true });
      } catch (_err) {
        res.status(500).json({ error: "failed_to_delete" });
      }
    },
  );

  // ----- Superadmin: user lifecycle (status / role / force-logout / detail / telegram revoke) -----

  const writeAuditLog = async (entry: {
    actor_user_id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    dashboard_id?: string | null;
    before_data?: unknown;
    after_data?: unknown;
    source?: "web" | "telegram" | "system";
  }) => {
    try {
      await supabase.from("audit_logs").insert({
        actor_user_id: entry.actor_user_id,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        dashboard_id: entry.dashboard_id ?? null,
        before_data: entry.before_data ?? null,
        after_data: entry.after_data ?? null,
        source: entry.source ?? "web",
      });
    } catch (err) {
      console.error("[audit] failed to write log:", err);
    }
  };

  const parseStatusBody = (body: unknown): { status: AppUserStatus; reason?: string } | null => {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const s = b.status;
    if (s !== "active" && s !== "paused" && s !== "blocked") return null;
    const reason = typeof b.reason === "string" ? b.reason.slice(0, 500) : undefined;
    return { status: s, reason };
  };

  router.get(
    "/api/admin/users/:id/detail",
    requireSession,
    requireSuperadmin,
    async (req, res) => {
      try {
        const userId = req.params.id;
        const { data: user, error: userErr } = await supabase
          .from("app_users")
          .select(
            "user_id, email, role, status, display_name, invited_by, invited_at, created_at, paused_at, blocked_at, status_reason, status_changed_at, status_changed_by",
          )
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        if (userErr) throw userErr;
        if (!user) return res.status(404).json({ error: "not_found" });

        const [{ count: movimientosCount }, dashboards, telegramLinks, driveConn] =
          await Promise.all([
            supabase
              .from("movimientos")
              .select("id", { count: "exact", head: true })
              .eq("owner_user_id", userId)
              .is("deleted_at", null),
            supabase
              .from("dashboard_members")
              .select("dashboard_id, role, status, permissions, created_at")
              .eq("user_id", userId),
            supabase
              .from("telegram_links")
              .select("id, dashboard_id, chat_id, status, created_at")
              .eq("app_user_id", userId),
            supabase
              .from("drive_connections")
              .select("owner_user_id, dashboard_id, created_at")
              .eq("owner_user_id", userId)
              .maybeSingle(),
          ]);

        res.json({
          user,
          stats: { movimientos: movimientosCount ?? 0 },
          dashboards: dashboards.data ?? [],
          telegramLinks: telegramLinks.data ?? [],
          drive: driveConn.data ?? null,
        });
      } catch (err) {
        console.error("[admin] user detail error:", err);
        res.status(500).json({ error: "failed_to_fetch" });
      }
    },
  );

  router.post(
    "/api/admin/users/:id/status",
    requireSession,
    requireSuperadmin,
    async (req, res) => {
      try {
        const payload = parseStatusBody(req.body);
        if (!payload) return res.status(400).json({ error: "invalid_request" });

        const session = getSession(req);
        const userId = req.params.id;

        if (userId === session.userId) {
          return res.status(400).json({ error: "cannot_change_own_status" });
        }

        const { data: before, error: beforeErr } = await supabase
          .from("app_users")
          .select("user_id, email, role, status")
          .eq("user_id", userId)
          .maybeSingle();
        if (beforeErr) throw beforeErr;
        if (!before) return res.status(404).json({ error: "not_found" });

        const now = new Date().toISOString();
        const update: Record<string, unknown> = {
          status: payload.status,
          status_reason: payload.reason ?? null,
          status_changed_by: session.userId,
          status_changed_at: now,
        };
        if (payload.status === "paused") update.paused_at = now;
        if (payload.status === "blocked") update.blocked_at = now;
        if (payload.status === "active") {
          update.paused_at = null;
          update.blocked_at = null;
        }

        const { error: updateErr } = await supabase
          .from("app_users")
          .update(update)
          .eq("user_id", userId);
        if (updateErr) throw updateErr;

        const action =
          payload.status === "active"
            ? "activate"
            : payload.status === "paused"
              ? "pause"
              : "block";

        await writeAuditLog({
          actor_user_id: session.userId,
          action,
          entity_type: "app_user",
          entity_id: userId,
          before_data: { status: before.status },
          after_data: { status: payload.status, reason: payload.reason ?? null },
        });

        // For blocked: force-logout the user from Supabase auth too.
        if (payload.status === "blocked") {
          try {
            await (supabase as any).auth.admin.signOut(userId);
          } catch (err) {
            console.warn("[admin] failed to signOut on block:", err);
          }
        }

        res.json({ ok: true, status: payload.status });
      } catch (err) {
        console.error("[admin] status change error:", err);
        res.status(500).json({ error: "failed_to_save" });
      }
    },
  );

  router.post(
    "/api/admin/users/:id/force-logout",
    requireSession,
    requireSuperadmin,
    async (req, res) => {
      try {
        const session = getSession(req);
        const userId = req.params.id;

        if (userId === session.userId) {
          return res.status(400).json({ error: "cannot_logout_self" });
        }

        try {
          await (supabase as any).auth.admin.signOut(userId);
        } catch (err) {
          console.error("[admin] signOut error:", err);
          return res.status(500).json({ error: "failed_to_logout" });
        }

        await writeAuditLog({
          actor_user_id: session.userId,
          action: "force_logout",
          entity_type: "app_user",
          entity_id: userId,
        });

        res.json({ ok: true });
      } catch (err) {
        console.error("[admin] force-logout error:", err);
        res.status(500).json({ error: "failed_to_save" });
      }
    },
  );

  router.post(
    "/api/admin/users/:id/role",
    requireSession,
    requireSuperadmin,
    async (req, res) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const role = body.role;
        if (role !== "superadmin" && role !== "admin" && role !== "member") {
          return res.status(400).json({ error: "invalid_role" });
        }

        const session = getSession(req);
        const userId = req.params.id;

        if (userId === session.userId) {
          return res.status(400).json({ error: "cannot_change_own_role" });
        }

        const { data: before, error: beforeErr } = await supabase
          .from("app_users")
          .select("user_id, role")
          .eq("user_id", userId)
          .maybeSingle();
        if (beforeErr) throw beforeErr;
        if (!before) return res.status(404).json({ error: "not_found" });

        const { error: updateErr } = await supabase
          .from("app_users")
          .update({ role })
          .eq("user_id", userId);
        if (updateErr) throw updateErr;

        await writeAuditLog({
          actor_user_id: session.userId,
          action: "role_change",
          entity_type: "app_user",
          entity_id: userId,
          before_data: { role: before.role },
          after_data: { role },
        });

        res.json({ ok: true, role });
      } catch (err) {
        console.error("[admin] role change error:", err);
        res.status(500).json({ error: "failed_to_save" });
      }
    },
  );

  // Eliminación definitiva de cuenta. Borra login + membresías. NO borra
  // movimientos/empresas/datos del dashboard (se preserva el historial contable).
  router.delete(
    "/api/admin/users/:id",
    requireSession,
    requireSuperadmin,
    async (req, res) => {
      try {
        const session = getSession(req);
        const userId = req.params.id;

        if (userId === session.userId) {
          return res.status(400).json({ error: "cannot_delete_self" });
        }

        const { data: target, error: targetErr } = await supabase
          .from("app_users")
          .select("user_id, email, role")
          .eq("user_id", userId)
          .maybeSingle();
        if (targetErr) throw targetErr;
        if (!target) return res.status(404).json({ error: "not_found" });

        if (target.role === "superadmin") {
          const { count, error: countErr } = await supabase
            .from("app_users")
            .select("user_id", { count: "exact", head: true })
            .eq("role", "superadmin");
          if (countErr) throw countErr;
          if ((count ?? 0) <= 1) {
            return res.status(400).json({ error: "last_superadmin" });
          }
        }

        // Quitar todas las membresías (incluye owner — la cuenta deja de existir).
        const { error: membersErr } = await supabase
          .from("dashboard_members")
          .delete()
          .eq("user_id", userId);
        if (membersErr) throw membersErr;

        // Hard delete del usuario de auth — cascada de sesiones. Mantiene movimientos/empresas.
        const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
        if (authErr) throw authErr;

        // Limpiar app_users por si el FK no cascadea.
        await supabase.from("app_users").delete().eq("user_id", userId);

        await writeAuditLog({
          actor_user_id: session.userId,
          action: "account_delete",
          entity_type: "app_user",
          entity_id: userId,
          before_data: { email: target.email, role: target.role },
        });

        res.json({ ok: true });
      } catch (err) {
        console.error("[admin] account delete error:", err);
        res.status(500).json({ error: "failed_to_delete" });
      }
    },
  );

  router.post(
    "/api/admin/telegram-links/:linkId/revoke",
    requireSession,
    requireSuperadmin,
    async (req, res) => {
      try {
        const session = getSession(req);
        const linkId = req.params.linkId;

        const { data: link, error: getErr } = await supabase
          .from("telegram_links")
          .select("id, app_user_id, dashboard_id, chat_id, status")
          .eq("id", linkId)
          .maybeSingle();
        if (getErr) throw getErr;
        if (!link) return res.status(404).json({ error: "not_found" });

        const { error: updateErr } = await supabase
          .from("telegram_links")
          .update({ status: "revoked", revoked_at: new Date().toISOString() })
          .eq("id", linkId);
        if (updateErr) throw updateErr;

        await writeAuditLog({
          actor_user_id: session.userId,
          action: "telegram_link_revoke",
          entity_type: "telegram_link",
          entity_id: linkId,
          dashboard_id: link.dashboard_id,
          before_data: { status: link.status, chat_id: link.chat_id },
        });

        res.json({ ok: true });
      } catch (err) {
        console.error("[admin] telegram revoke error:", err);
        res.status(500).json({ error: "failed_to_save" });
      }
    },
  );


  // ---------------------------------------------------------------------------
  // Email management endpoints (REQ-S1, REQ-S2, REQ-S3) — superadmin only
  // All 5 endpoints are behind requireSuperadmin (INV-3).
  // ---------------------------------------------------------------------------

  if (emailDeps) {
    const {
      brevoApiKey,
      getActiveSender,
      setEmailSettings,
      listVerifiedSenders,
      listEmailLog,
      sendTestEmail,
      tierEmailTest,
      parseEmailSettingsRequest,
      parseTestSendRequest,
    } = emailDeps;

    // REQ-S1.1/S1.2 — GET /api/admin/email-settings
    router.get(
      "/api/admin/email-settings",
      requireSession,
      requireSuperadmin,
      async (_req, res) => {
        try {
          const sender = await getActiveSender(supabase);
          res.json({ from_email: sender.fromEmail, from_name: sender.fromName, updated_at: null });
        } catch (err) {
          console.error("[admin/email-settings] GET error:", err);
          res.status(500).json({ error: "failed_to_fetch" });
        }
      },
    );

    // REQ-S1.3/S1.7 — GET /api/admin/email-settings/senders
    router.get(
      "/api/admin/email-settings/senders",
      requireSession,
      requireSuperadmin,
      async (_req, res) => {
        try {
          const apiKey = brevoApiKey ?? "";
          const senders = await listVerifiedSenders(apiKey);
          res.json(senders);
        } catch (err) {
          console.error("[admin/email-settings/senders] Brevo error:", err);
          res.status(502).json({ error: "senders_unavailable" });
        }
      },
    );

    // REQ-S1.4/S1.5/S1.6 — PATCH /api/admin/email-settings
    router.patch(
      "/api/admin/email-settings",
      requireSession,
      requireSuperadmin,
      async (req, res) => {
        try {
          const payload = parseEmailSettingsRequest(req.body);
          if (!payload) return res.status(400).json({ error: "invalid_request" });

          // REQ-S1.5: must be verified in Brevo
          const apiKey = brevoApiKey ?? "";
          const senders = await listVerifiedSenders(apiKey);
          const isVerified = senders.some((s) => s.email === payload.from_email);
          if (!isVerified) return res.status(400).json({ error: "sender_not_verified" });

          const session = getSession(req);
          const updated = await setEmailSettings(supabase, {
            fromEmail: payload.from_email,
            fromName: payload.from_name,
            updatedBy: session.userId,
          });
          res.json({ from_email: updated.fromEmail, from_name: updated.fromName, updated_at: new Date().toISOString() });
        } catch (err) {
          console.error("[admin/email-settings] PATCH error:", err);
          res.status(500).json({ error: "failed_to_save" });
        }
      },
    );

    // REQ-S3.1/S3.2/S3.4 — POST /api/admin/email-settings/test-send
    router.post(
      "/api/admin/email-settings/test-send",
      requireSession,
      requireSuperadmin,
      tierEmailTest,
      async (req, res) => {
        try {
          const payload = parseTestSendRequest(req.body);
          if (!payload) return res.status(400).json({ error: "invalid_request" });

          const sender = await getActiveSender(supabase);
          const result = await sendTestEmail(payload.to, sender);
          res.json({ ok: result.ok, brevo_message_id: result.messageId ?? null });
        } catch (err) {
          console.error("[admin/email-settings/test-send] error:", err);
          res.status(500).json({ error: "failed_to_send" });
        }
      },
    );

    // REQ-S2.4/S2.5 — GET /api/admin/email-log
    router.get(
      "/api/admin/email-log",
      requireSession,
      requireSuperadmin,
      async (req, res) => {
        try {
          const q = req.query as Record<string, string | undefined>;
          const filters: import("../emailLog.ts").EmailLogFilters = {};
          if (q.type) filters.type = q.type as import("../email.ts").EmailType;
          if (q.ok !== undefined) filters.ok = q.ok === "true";
          if (q.from) filters.from = q.from;
          if (q.to) filters.to = q.to;
          if (q.before) filters.before = q.before;
          if (q.limit) filters.limit = Number.parseInt(q.limit, 10);

          const rows = await listEmailLog(supabase, filters);
          res.json(rows);
        } catch (err) {
          console.error("[admin/email-log] GET error:", err);
          res.status(500).json({ error: "failed_to_fetch" });
        }
      },
    );
  }

  return router;
}
