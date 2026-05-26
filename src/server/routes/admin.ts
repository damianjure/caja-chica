import express from "express";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;
type Frecuencia = any;
type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export function createAdminRouter(ctx: any) {
  const router = express.Router();
  const {
    supabase,
    genAI,
    botActive,
    webhookPath,
    webhookHandler,
    webhookSecret,
    adminApiToken,
    enableDangerousRoutes,
    publicAppUrl,
    telegramBotUsername,
    googleDriveClientId,
    googleDriveClientSecret,
    googleDriveRedirectUri,
    tokenEncryptionKey,
    bot,
    buildTelegramDeepLink,
    requireSession,
    requireAdmin,
    requireSuperadmin,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canManageDashboardMembers,
    applyDataScope,
    buildWriteOwnership,
    insertAuditLog,
    getScopeEntityById,
    fetchScopedMovimientos,
    insertReportExport,
    logEntityMutation,
    createEmpresaDeleteBackup,
    getBotConnectionRecord,
    upsertBotConnectionRecord,
    syncPendingDashboardInvitations,
    listDashboardMembers,
    pendingDriveOAuthStates,
    driveEnabled,
    canConnectDrive,
    canExportDrive,
    canExportLocal,
    canManageEmpresasOp,
    canManageCategoriasOp,
    canDeleteOthers,
    canEditOthers,
    resolveDriveOwnerUserId,
    parseExtractRequest,
    parseSaveMovimientosRequest,
    parseEmpresaRequest,
    parseUpdateEmpresaRequest,
    parseUpdateMovimientoRequest,
    parseReconciliationRequest,
    parseBudgetRequest,
    parsePaginationQuery,
    parseReportExportRequest,
    parseInvitationRequest,
    parseDashboardInvitationRequest,
    parseRecurrenteRequest,
    SYSTEM_PROMPT,
    parseGeminiJsonResponse,
    filterMovementsForReport,
    resolveReportDateRange,
    buildReportFile,
    getDriveAuthUrl,
    exchangeCodeForTokens,
    uploadFileToDrive,
    encryptToken,
    decryptToken,
    sendAppInvitationEmail,
    sendDashboardInvitationEmail,
    ensurePersonalDashboard,
    seedDemoData,
    purgeDemoData,
    getMaintenanceState,
    setMaintenanceStatus,
    notifyMaintenance,
    computeNextRun,
    relativeRunLabel,
    randomBytes,
    hasValidAdminToken,
    isMissingSchemaArtifactError,
    tierRead,
    tierWrite,
    tierStrict,
    tierResend,
  } = ctx;


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

  router.get("/api/admin/invitations", requireSession, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("user_invitations")
        .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const invitations = (data ?? []).map((invitation: any) => ({
        ...invitation,
        invite_url: `${publicAppUrl || ""}/?invite=${invitation.invite_token}`,
      }));
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
      };

      const { data, error } = await supabase
        .from("user_invitations")
        .upsert(invitationPayload, { onConflict: "email" })
        .select("id, email, role, status, invite_token, expires_at, created_at, accepted_at")
        .single();
      if (error) throw error;

      const inviteUrl = `${publicAppUrl || ""}/?invite=${data.invite_token}`;
      res.status(201).json({ ...data, invite_url: inviteUrl });
      void sendAppInvitationEmail(data.email, inviteUrl);
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


  return router;
}
