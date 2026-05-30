import express, { type Request, type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike, DashboardMemberSummary } from "../contracts.ts";

export interface DashboardDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canManageDashboardMembers: (session: AppSession, scope: DataAccessScope) => boolean;
  listDashboardMembers: (dashboardId: string) => Promise<DashboardMemberSummary[]>;
  publicAppUrl?: string;
  isMissingSchemaArtifactError: (error: unknown) => boolean;
  parseDashboardInvitationRequest: (body: unknown) => any;
  randomBytes: (size: number) => Buffer;
  buildTelegramDeepLink: (token: string | null) => string | null;
  sendDashboardInvitationEmail: (to: string, inviteUrl: string, role: string, inviterEmail: string, telegramDeepLink?: string) => Promise<void>;
  sendAppInvitationEmail: (to: string, inviteUrl: string, emailType?: import("../email.ts").EmailType, inviterName?: string) => Promise<void>;
  purgeDemoData: (supabase: SupabaseLike, session: AppSession, dashboardId: string) => Promise<void>;
  tierRead: RequestHandler;
  tierResend: RequestHandler;
  tierWrite: RequestHandler;
}

export function createDashboardRouter(deps: DashboardDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canManageDashboardMembers,
    listDashboardMembers,
    publicAppUrl,
    isMissingSchemaArtifactError,
    parseDashboardInvitationRequest,
    randomBytes,
    buildTelegramDeepLink,
    sendDashboardInvitationEmail,
    sendAppInvitationEmail,
    purgeDemoData,
    tierRead,
    tierResend,
    tierWrite,
  } = deps;

  router.get("/api/dashboard/members", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!scope.dashboardId) {
        return res.json({
          dashboardId: null,
          members: [
            {
              id: session.userId,
              user_id: session.userId,
              email: session.email,
              role: "owner",
              status: "active",
              created_at: new Date(0).toISOString(),
            },
          ],
          invitations: [],
        });
      }

      const members = await listDashboardMembers(scope.dashboardId);
      let invitations: any[] = [];
      try {
        const { data, error } = await supabase
          .from("dashboard_invitations")
          .select("id, dashboard_id, email, role, status, invite_token, expires_at, created_at, accepted_at")
          .eq("dashboard_id", scope.dashboardId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const canSeeTokens = scope.membershipRole === "owner" || scope.membershipRole === null;
        invitations = (data ?? []).map((invitation: any) => {
          const base = { ...invitation };
          if (canSeeTokens) {
            base.invite_url = `${publicAppUrl || ""}/?invite=${invitation.invite_token}`;
          } else {
            delete base.invite_token;
          }
          return base;
        });
      } catch (error) {
        if (!isMissingSchemaArtifactError(error)) throw error;
      }

      res.json({
        dashboardId: scope.dashboardId,
        members,
        invitations,
      });
    } catch (err) {
      console.error("Dashboard members fetch error:", err);
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  router.post("/api/dashboard/invitations", requireSession, async (req, res) => {
    try {
      const payload = parseDashboardInvitationRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!scope.dashboardId) {
        return res.status(409).json({ error: "shared_dashboard_unavailable" });
      }

      if (!canManageDashboardMembers(session, scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      if (payload.email === session.email.toLowerCase()) {
        return res.status(400).json({ error: "cannot_invite_self" });
      }

      const { data: userRows, error: userError } = await supabase
        .from("app_users")
        .select("user_id, email, status")
        .eq("email", payload.email)
        .limit(1);
      if (userError) throw userError;

      const existingUser = userRows?.[0] ?? null;
      const acceptedNow = existingUser?.status === "active";
      const now = new Date().toISOString();
      const inviteToken = randomBytes(24).toString("hex");

      // Handle telegram_preauth: create a pre-authorized telegram invite token (TTL 24h)
      let telegramTokenId: string | null = null;
      let telegramDeepLink: string | undefined;
      if (payload.telegram_preauth) {
        const telegramToken = randomBytes(24).toString("hex");
        const telegramTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { data: tTokenData, error: tTokenErr } = await supabase
          .from("telegram_invite_tokens")
          .insert({
            token: telegramToken,
            dashboard_id: scope.dashboardId,
            target_user_id: existingUser?.user_id ?? null,
            pre_authorized: true,
            expires_at: telegramTokenExpiresAt,
            status: "pending",
          })
          .select()
          .single();
        if (tTokenErr) {
          console.error("[invitations] Failed to create telegram invite token:", tTokenErr);
        } else {
          telegramTokenId = tTokenData?.id ?? null;
          telegramDeepLink = buildTelegramDeepLink(telegramToken) ?? undefined;
        }
      }

      const sevenDaysFromNow = new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const invitationPayload = {
        dashboard_id: scope.dashboardId,
        email: payload.email,
        role: payload.role,
        status: acceptedNow ? "accepted" : "pending",
        invited_by_user_id: session.userId,
        accepted_user_id: acceptedNow ? existingUser.user_id : null,
        accepted_at: acceptedNow ? now : null,
        expires_at: acceptedNow ? null : sevenDaysFromNow,
        invite_token: inviteToken,
        ...(payload.telegram_preauth
          ? { telegram_preauth: true, telegram_invite_token_id: telegramTokenId }
          : {}),
      };

      const { data, error } = await supabase
        .from("dashboard_invitations")
        .upsert(invitationPayload, { onConflict: "dashboard_id,email" })
        .select("id, dashboard_id, email, role, status, invite_token, expires_at, created_at, accepted_at")
        .single();
      if (error) throw error;

      if (acceptedNow) {
        const { error: memberError } = await supabase
          .from("dashboard_members")
          .upsert(
            {
              dashboard_id: scope.dashboardId,
              user_id: existingUser.user_id,
              role: payload.role,
              status: "active",
              invited_by_user_id: session.userId,
            },
            { onConflict: "dashboard_id,user_id" },
          );
        if (memberError) throw memberError;
      } else {
        const { error: globalInviteError } = await supabase
          .from("user_invitations")
          .upsert(
            {
              email: payload.email,
              role: "member",
              status: "pending",
              invited_by: session.userId,
              expires_at: sevenDaysFromNow,
            },
            { onConflict: "email" },
          );
        if (globalInviteError) throw globalInviteError;
      }

      const inviteUrl = `${publicAppUrl || ""}/?invite=${data.invite_token}`;
      res.status(201).json({
        ...data,
        invite_url: inviteUrl,
        ...(telegramDeepLink ? { telegram_deep_link: telegramDeepLink } : {}),
      });
      void sendDashboardInvitationEmail(data.email, inviteUrl, data.role, session.email, telegramDeepLink);

      // Auto-purge demo data when owner invites their first collaborator
      void (async () => {
        try {
          const { data: userRow } = await supabase
            .from("app_users")
            .select("onboarding_state")
            .eq("user_id", session.userId)
            .single();
          if (userRow?.onboarding_state === "seeded") {
            await purgeDemoData(supabase, session, scope.dashboardId!);
          }
        } catch (purgeErr) {
          console.error("Auto-purge demo error:", purgeErr);
        }
      })();
    } catch (err) {
      console.error("Dashboard invitation error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  router.post("/api/dashboard/invitations/:id/revoke", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!scope.dashboardId || !canManageDashboardMembers(session, scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const { data: rows, error: fetchError } = await supabase
        .from("dashboard_invitations")
        .select("id, dashboard_id")
        .eq("id", req.params.id)
        .limit(1);
      if (fetchError) throw fetchError;

      const invitation = rows?.[0];
      if (!invitation || invitation.dashboard_id !== scope.dashboardId) {
        return res.status(404).json({ error: "not_found" });
      }

      const { error } = await supabase
        .from("dashboard_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (error) throw error;

      res.json({ ok: true });
    } catch (err) {
      console.error("Dashboard invitation revoke error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });



  router.patch("/api/dashboard/members/:id/permissions", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId || scope.membershipRole !== "owner") {
        return res.status(403).json({ error: "solo owner puede cambiar permisos" });
      }

      const { id } = req.params;
      const { permissions } = req.body as { permissions?: Record<string, boolean> };
      if (!permissions || typeof permissions !== "object") {
        return res.status(400).json({ error: "permissions requerido (objeto)" });
      }

      const allowed = [
        "delete_any",
        "edit_any",
        "export_drive",
        "export_local",
        "invite_telegram",
        "manage_empresas",
        "manage_categorias",
        "manage_backups",
        "restore_backups",
      ] as const;
      const sanitized: Record<string, boolean> = {};
      for (const key of allowed) {
        if (key in permissions) sanitized[key] = Boolean(permissions[key]);
      }

      const { data: memberRows, error: fetchError } = await supabase
        .from("dashboard_members")
        .select("id, role")
        .eq("id", id)
        .eq("dashboard_id", scope.dashboardId)
        .limit(1);
      if (fetchError) throw fetchError;
      const member = memberRows?.[0];
      if (!member) return res.status(404).json({ error: "miembro no encontrado" });
      if (member.role !== "editor") {
        return res.status(400).json({ error: "permisos granulares solo aplican a editor" });
      }

      const { error: updateError } = await supabase
        .from("dashboard_members")
        .update({ permissions: sanitized })
        .eq("id", id);
      if (updateError) throw updateError;

      return res.json({ permissions: sanitized });
    } catch (err) {
      console.error("PATCH /api/dashboard/members/:id/permissions:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.post("/api/dashboard/members/:id/revoke", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const memberId = req.params.id;
      const { data: callerMembership } = await supabase
        .from("dashboard_members")
        .select("dashboard_id, role")
        .eq("user_id", session.userId)
        .eq("status", "active")
        .limit(1);
      const isAdminOrSuper = session.role === "admin" || session.role === "superadmin";
      const isOwner = callerMembership?.[0]?.role === "owner";
      if (!isAdminOrSuper && !isOwner) return res.status(403).json({ error: "Forbidden" });
      const dashboardId = callerMembership?.[0]?.dashboard_id;
      if (!dashboardId) return res.status(404).json({ error: "No dashboard" });
      const { data: target } = await supabase
        .from("dashboard_members")
        .select("user_id, role")
        .eq("id", memberId)
        .eq("dashboard_id", dashboardId)
        .limit(1);
      if (!target?.[0]) return res.status(404).json({ error: "Member not found" });
      if (target[0].user_id === session.userId) return res.status(400).json({ error: "Cannot revoke yourself" });
      if (target[0].role === "owner") return res.status(400).json({ error: "Cannot revoke owner" });
      const { error } = await supabase
        .from("dashboard_members")
        .update({ status: "revoked" })
        .eq("id", memberId)
        .eq("dashboard_id", dashboardId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ revoked: true });
    } catch (err) {
      console.error("POST /api/dashboard/members/:id/revoke:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  router.post("/api/dashboard/leave", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const { data: membership } = await supabase
        .from("dashboard_members")
        .select("id, role, dashboard_id")
        .eq("user_id", session.userId)
        .eq("status", "active")
        .limit(1);
      if (!membership?.[0]) return res.status(404).json({ error: "No active membership" });
      if (membership[0].role === "owner") return res.status(400).json({ error: "Owner cannot leave. Transfer ownership first." });
      const { error } = await supabase
        .from("dashboard_members")
        .update({ status: "revoked" })
        .eq("id", membership[0].id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ left: true });
    } catch (err) {
      console.error("POST /api/dashboard/leave:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Personas — unified view of all invitations
  // ---------------------------------------------------------------------------

  type PersonaStatus = "pending" | "active" | "expired" | "revoked";
  type PersonaScope = "app" | "dashboard";

  interface PersonaRecord {
    id: string;
    email: string;
    type: PersonaScope;
    role: string;
    status: PersonaStatus;
    created_at: string;
    last_action_at: string;
    telegram_link_status: "active" | null;
    invite_url: string;
  }

  function derivePersonaStatus(row: {
    status: string;
    accepted_at: string | null;
    expires_at: string | null;
  }): PersonaStatus {
    if (row.status === "revoked") return "revoked";
    if (row.accepted_at) return "active";
    if (row.expires_at && row.expires_at < new Date().toISOString()) return "expired";
    return "pending";
  }

  function deriveLastActionAt(row: {
    created_at: string;
    accepted_at: string | null;
    last_reminder_at: string | null;
  }): string {
    const candidates = [row.created_at, row.accepted_at, row.last_reminder_at].filter(Boolean) as string[];
    return candidates.reduce((a, b) => (a > b ? a : b));
  }

  router.get("/api/personas", requireSession, tierRead, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      const isOwner = scope.membershipRole === "owner";
      const isAdmin = session.role === "admin" || session.role === "superadmin";

      // Only owners and admins can access this endpoint
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "forbidden" });
      }

      const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
      const scopeFilter = typeof req.query.scope === "string" ? req.query.scope : null;
      const roleFilter = typeof req.query.role === "string" ? req.query.role : null;

      const personas: PersonaRecord[] = [];

      // App-scope invitations (user_invitations) — visible to admins/superadmins only
      if (isAdmin && (!scopeFilter || scopeFilter === "app")) {
        const { data: uiRows, error: uiErr } = await supabase
          .from("user_invitations")
          .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at, last_reminder_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (uiErr) throw uiErr;

        for (const row of (uiRows ?? []) as any[]) {
          const status = derivePersonaStatus(row);
          const last_action_at = deriveLastActionAt(row);
          personas.push({
            id: row.id,
            email: row.email,
            type: "app",
            role: row.role,
            status,
            created_at: row.created_at,
            last_action_at,
            telegram_link_status: null,
            invite_url: `${publicAppUrl || ""}/?invite=${row.invite_token}`,
          });
        }
      }

      // Dashboard-scope invitations — visible only to owner of that dashboard
      if ((!scopeFilter || scopeFilter === "dashboard") && scope.dashboardId) {
        const { data: diRows, error: diErr } = await supabase
          .from("dashboard_invitations")
          .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at, last_reminder_at, telegram_preauth, telegram_invite_token_id")
          .eq("dashboard_id", scope.dashboardId)
          .order("created_at", { ascending: false })
          .limit(500);
        if (diErr) throw diErr;

        const telegramLinksByInviteToken: Map<string, string> = new Map();
        const diInviteTokens = ((diRows ?? []) as any[]).map((r: any) => r.invite_token).filter(Boolean);

        if (diInviteTokens.length > 0) {
          // Look up active telegram links for these invitations
          const { data: tlRows } = await supabase
            .from("telegram_links")
            .select("id, status, invite_token")
            .in("invite_token", diInviteTokens)
            .eq("status", "active")
            .limit(500);
          for (const tl of (tlRows ?? []) as any[]) {
            if (tl.invite_token) telegramLinksByInviteToken.set(tl.invite_token, tl.status);
          }
        }

        for (const row of (diRows ?? []) as any[]) {
          const status = derivePersonaStatus(row);
          const last_action_at = deriveLastActionAt(row);
          const tgStatus = row.invite_token && telegramLinksByInviteToken.has(row.invite_token)
            ? ("active" as const)
            : null;
          personas.push({
            id: row.id,
            email: row.email,
            type: "dashboard",
            role: row.role,
            status,
            created_at: row.created_at,
            last_action_at,
            telegram_link_status: tgStatus,
            invite_url: `${publicAppUrl || ""}/join?token=${row.invite_token}`,
          });
        }
      }

      // Apply post-fetch filters
      let result = personas;
      if (statusFilter) result = result.filter((p) => p.status === statusFilter);
      if (roleFilter) result = result.filter((p) => p.role === roleFilter);

      // Sort by last_action_at DESC
      result.sort((a, b) => (a.last_action_at > b.last_action_at ? -1 : 1));

      return res.json(result);
    } catch (err) {
      console.error("GET /api/personas:", err);
      return res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  // Helper: lookup a persona invite by id across both tables.
  // Returns { table, row } or null.
  async function lookupPersonaInvite(
    id: string,
    dashboardId: string | null,
    isAdmin: boolean = false,
  ): Promise<{ table: "user_invitations" | "dashboard_invitations"; row: any } | null> {
    // Try user_invitations — only admins/superadmins may act on app-level invitations
    if (isAdmin) {
      const { data: uiRows } = await supabase
        .from("user_invitations")
        .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at, last_reminder_at, invited_by")
        .eq("id", id)
        .limit(1);
      if (uiRows?.[0]) return { table: "user_invitations", row: uiRows[0] };
    }

    // Try dashboard_invitations (must belong to the caller's dashboard)
    if (dashboardId) {
      const { data: diRows } = await supabase
        .from("dashboard_invitations")
        .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at, last_reminder_at, invited_by_user_id, dashboard_id, accepted_user_id")
        .eq("id", id)
        .eq("dashboard_id", dashboardId)
        .limit(1);
      if (diRows?.[0]) return { table: "dashboard_invitations", row: diRows[0] };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // POST /api/personas/:id/resend
  // ---------------------------------------------------------------------------

  router.post("/api/personas/:id/resend", requireSession, tierResend, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      const isOwner = scope.membershipRole === "owner";
      const isAdmin = session.role === "admin" || session.role === "superadmin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "forbidden" });
      }

      const found = await lookupPersonaInvite(req.params.id, scope.dashboardId, isAdmin);
      if (!found) return res.status(404).json({ error: "not_found" });

      const { table, row } = found;
      const derived = derivePersonaStatus(row);

      // Already consumed or revoked — cannot resend
      if (derived === "active") return res.status(409).json({ error: "already_accepted" });
      if (row.status === "revoked") return res.status(409).json({ error: "invite_revoked" });

      const nowDate = new Date();
      const nowIso = nowDate.toISOString();

      // Regenerate token + expires_at if expired
      let currentToken: string = row.invite_token;
      if (derived === "expired") {
        currentToken = randomBytes(24).toString("hex");
        const newExpiresAt = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from(table)
          .update({ invite_token: currentToken, expires_at: newExpiresAt })
          .eq("id", row.id);
      }

      // Update last_reminder_at
      await supabase
        .from(table)
        .update({ last_reminder_at: nowIso })
        .eq("id", row.id);

      // Dispatch email based on table type
      if (table === "user_invitations") {
        const inviteUrl = `${publicAppUrl || ""}/?invite=${currentToken}`;
        void sendAppInvitationEmail(row.email, inviteUrl, undefined, session.email.split("@")[0]);
      } else {
        const inviteUrl = `${publicAppUrl || ""}/join?token=${currentToken}`;
        void sendDashboardInvitationEmail(row.email, inviteUrl, row.role, session.email);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("POST /api/personas/:id/resend:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/personas/:id/role
  // ---------------------------------------------------------------------------

  router.patch("/api/personas/:id/role", requireSession, tierWrite, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      const isOwner = scope.membershipRole === "owner";
      const isAdmin = session.role === "admin" || session.role === "superadmin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "forbidden" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const newRole = body.role;

      // Validate role: only member/admin for app scope; editor/viewer for dashboard scope
      // Superadmin promotion requires caller to be superadmin
      const validAppRoles = ["member", "admin"];
      const validDashboardRoles = ["editor", "viewer"];
      const allValid = [...validAppRoles, ...validDashboardRoles];
      if (typeof newRole !== "string" || !allValid.includes(newRole)) {
        return res.status(400).json({ error: "invalid_role" });
      }

      const found = await lookupPersonaInvite(req.params.id, scope.dashboardId, isAdmin);
      if (!found) return res.status(404).json({ error: "not_found" });

      const { table, row } = found;

      if (table === "user_invitations") {
        // App scope: only admins/superadmins can update role (member ↔ admin)
        if (!validAppRoles.includes(newRole as string)) {
          return res.status(400).json({ error: "invalid_role_for_scope" });
        }

        const derived = derivePersonaStatus(row);
        if (derived === "active") {
          // Accepted invite: must update app_users directly, not the invite
          // For now 409 — use the admin user management routes instead
          return res.status(409).json({ error: "already_accepted_use_user_management" });
        }

        await supabase
          .from("user_invitations")
          .update({ role: newRole })
          .eq("id", row.id);

        return res.json({ ok: true });
      }

      // Dashboard scope
      if (!validDashboardRoles.includes(newRole as string)) {
        return res.status(400).json({ error: "invalid_role_for_scope" });
      }

      // Guard: cannot change role of owner
      if (row.role === "owner") {
        return res.status(422).json({ error: "cannot_change_owner_role" });
      }

      const derived = derivePersonaStatus(row);

      if (derived !== "active") {
        // Pending invite: update dashboard_invitations.role
        await supabase
          .from("dashboard_invitations")
          .update({ role: newRole })
          .eq("id", row.id);
      } else {
        // Accepted invite: update dashboard_members.role + reset permissions
        // (remove editor-only permissions if demoting to viewer)
        if (row.accepted_user_id) {
          await supabase
            .from("dashboard_members")
            .update({ role: newRole, permissions: {} })
            .eq("user_id", row.accepted_user_id)
            .eq("dashboard_id", row.dashboard_id);
        }
        // Also update the invitation record to keep in sync
        await supabase
          .from("dashboard_invitations")
          .update({ role: newRole })
          .eq("id", row.id);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("PATCH /api/personas/:id/role:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // ---------------------------------------------------------------------------
  // Recurrentes endpoints
  // ---------------------------------------------------------------------------

  return router;
}
