import express from "express";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;
type Frecuencia = any;
type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export function createMeRouter(ctx: any) {
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


  router.get("/api/me", requireSession, async (req, res) => {
    const session = getSession(req);

    // Relocated side effects: sync invitations and seed demo data for new member accounts
    await syncPendingDashboardInvitations(session);

    // Derive is_dashboard_joiner: true when user has a dashboard_members row with invited_by_user_id set
    let isDashboardJoiner = false;
    try {
      const { data: memberRows } = await supabase
        .from("dashboard_members")
        .select("id")
        .eq("user_id", session.userId)
        .not("invited_by_user_id", "is", null)
        .limit(1);
      isDashboardJoiner = !!(memberRows && memberRows.length > 0);
    } catch {
      // non-fatal — default to false
    }

    let currentOnboardingState: string | undefined;

    if (session.role === "member") {
      const { data: userRow } = await supabase
        .from("app_users")
        .select("onboarding_state")
        .eq("user_id", session.userId)
        .single();
      if (!userRow || userRow.onboarding_state === "pending") {
        if (isDashboardJoiner) {
          // Joiners skip demo seed but keep onboarding_state='pending' so the
          // frontend renders <WelcomeJoined>. When the user dismisses it, the
          // wizard PATCHes /api/me with onboarding_state='completed'.
          currentOnboardingState = "pending";
        } else {
          try {
            const dashboardId = await ensurePersonalDashboard(supabase, session);
            await seedDemoData(supabase, session, dashboardId);
            currentOnboardingState = "seeded";
          } catch (seedErr) {
            console.error("Onboarding seed error:", seedErr);
          }
        }
      }
    }

    const { data } = await supabase
      .from("app_users")
      .select("display_name, notification_hour, notification_minute, onboarding_state")
      .eq("user_id", session.userId)
      .single();

    res.json({
      id: session.userId,
      email: session.email,
      role: session.role,
      status: session.status,
      display_name: data?.display_name ?? null,
      notification_hour: data?.notification_hour ?? 21,
      notification_minute: data?.notification_minute ?? 0,
      onboarding_state: currentOnboardingState ?? data?.onboarding_state ?? "completed",
      is_dashboard_joiner: isDashboardJoiner,
    });
  });

  router.patch("/api/me", requireSession, async (req, res) => {
    const session = getSession(req);
    const body = req.body as { display_name?: string | null; notification_hour?: number; notification_minute?: number; onboarding_state?: string };
    const updates: Record<string, unknown> = {};

    if ("display_name" in body) {
      updates.display_name = body.display_name ? String(body.display_name).trim().slice(0, 50) : null;
    }
    if ("notification_hour" in body) {
      const h = Number(body.notification_hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        res.status(400).json({ error: "notification_hour must be 0–23" });
        return;
      }
      updates.notification_hour = h;
    }
    if ("notification_minute" in body) {
      const m = Number(body.notification_minute);
      if (!Number.isInteger(m) || m < 0 || m > 59) {
        res.status(400).json({ error: "notification_minute must be 0–59" });
        return;
      }
      updates.notification_minute = m;
    }
    if ("onboarding_state" in body) {
      const allowed = ["completed", "cleaned"];
      if (!allowed.includes(body.onboarding_state as string)) {
        res.status(400).json({ error: "invalid onboarding_state" });
        return;
      }
      updates.onboarding_state = body.onboarding_state;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const { error } = await supabase
      .from("app_users")
      .update(updates)
      .eq("user_id", session.userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/api/me/export", requireSession, async (req, res) => {
    const session = getSession(req);
    const scope = await resolveDataAccessScope(session);
    const scopeFilter = scope.dashboardId
      ? { col: "dashboard_id", val: scope.dashboardId }
      : { col: "owner_user_id", val: session.userId };

    const [mov, emp, cat] = await Promise.all([
      supabase.from("movimientos").select("*").eq(scopeFilter.col, scopeFilter.val).is("deleted_at", null),
      supabase.from("empresas").select("*").eq(scopeFilter.col, scopeFilter.val).is("deleted_at", null),
      supabase.from("categorias").select("*").eq(scopeFilter.col, scopeFilter.val),
    ]);

    if (mov.error || emp.error || cat.error) {
      console.error("[export] DB error:", mov.error ?? emp.error ?? cat.error);
      return res.status(500).json({ error: "export_failed" });
    }

    const filename = `caja-chica-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json({
      exported_at: new Date().toISOString(),
      user: { id: session.userId, email: session.email },
      movimientos: mov.data ?? [],
      empresas: emp.data ?? [],
      categorias: cat.data ?? [],
    });
  });

  router.delete("/api/me/demo-data", requireSession, async (req, res) => {
    const session = getSession(req);
    const scope = await resolveDataAccessScope(session);
    if (!scope.dashboardId) {
      return res.status(409).json({ error: "no_dashboard" });
    }
    try {
      await purgeDemoData(supabase, session, scope.dashboardId);
      res.json({ ok: true });
    } catch (err) {
      console.error("Demo purge error:", err);
      res.status(500).json({ error: "failed_to_purge" });
    }
  });

  router.get("/api/me/sessions", requireSession, async (req, res) => {
    const session = getSession(req);
    const { data, error } = await supabase.rpc("get_my_sessions", { target_user_id: session.userId });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ sessions: data ?? [], currentSessionId: session.sessionId ?? null });
  });

  router.delete("/api/me/sessions/:sessionId", requireSession, async (req, res) => {
    const session = getSession(req);
    // Prevent revoking the currently-active session — would lock the user out immediately
    if (session.sessionId && req.params.sessionId === session.sessionId) {
      res.status(400).json({ error: "No podés revocar tu sesión activa. Usá Cerrar sesión." });
      return;
    }
    const { error } = await supabase.rpc("delete_user_session", {
      target_session_id: req.params.sessionId,
      target_user_id: session.userId,
    });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  router.delete("/api/me", requireSession, async (req, res) => {
    const session = getSession(req);
    // Remove from non-owned dashboard memberships
    await supabase
      .from("dashboard_members")
      .delete()
      .eq("user_id", session.userId)
      .neq("role", "owner");
    // Hard delete auth user — cascades auth.sessions automatically
    const { error } = await supabase.auth.admin.deleteUser(session.userId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
