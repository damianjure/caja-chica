import express from "express";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;
type Frecuencia = any;
type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export function createDriveRouter(ctx: any) {
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

  router.get("/api/drive/status", requireSession, async (req, res) => {
    if (!driveEnabled) return res.json({ connected: false, enabled: false });
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canExportDrive(scope)) return res.json({ connected: false, enabled: false });
      const driveOwnerUserId = await resolveDriveOwnerUserId(session, scope);
      if (!driveOwnerUserId) return res.json({ connected: false, enabled: true });
      const { data, error } = await supabase
        .from("drive_connections")
        .select("id")
        .eq("owner_user_id", driveOwnerUserId)
        .limit(1);
      if (error) throw error;
      res.json({ connected: (data?.length ?? 0) > 0, enabled: true });
    } catch {
      res.status(500).json({ error: "failed_to_check" });
    }
  });

  router.get("/api/drive/auth-url", requireSession, async (req, res) => {
    if (!driveEnabled) return res.status(503).json({ error: "drive_not_configured" });
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canConnectDrive(scope)) return res.status(403).json({ error: "forbidden" });
      const state = randomBytes(16).toString("hex");
      pendingDriveOAuthStates.set(state, { userId: session.userId, expiresAt: Date.now() + 5 * 60_000 });
      const url = getDriveAuthUrl(
        googleDriveClientId!,
        googleDriveClientSecret!,
        googleDriveRedirectUri!,
        state,
      );
      res.json({ url });
    } catch {
      res.status(500).json({ error: "failed_to_generate_url" });
    }
  });

  router.get("/api/drive/callback", async (req, res) => {
    if (!driveEnabled) return res.status(503).send("Drive not configured");
    const { code, state } = req.query as { code?: string; state?: string };
    // WARNING-18: if publicAppUrl is missing, redirect goes to backend root — startup warning fires at boot
    const fallbackUrl = publicAppUrl ?? "/";
    if (!code || !state) return res.redirect(`${fallbackUrl}?driveError=missing_params`);

    const pending = pendingDriveOAuthStates.get(state);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingDriveOAuthStates.delete(state);
      return res.redirect(`${fallbackUrl}?driveError=invalid_state`);
    }
    pendingDriveOAuthStates.delete(state);

    try {
      const { refreshToken } = await exchangeCodeForTokens(
        googleDriveClientId!,
        googleDriveClientSecret!,
        googleDriveRedirectUri!,
        code,
      );
      const encryptedToken = encryptToken(refreshToken, tokenEncryptionKey!);
      const { error: upsertErr } = await supabase.from("drive_connections").upsert(
        [{ owner_user_id: pending.userId, refresh_token_enc: encryptedToken, updated_at: new Date().toISOString() }],
        { onConflict: "owner_user_id" },
      );
      if (upsertErr) {
        console.error("[drive] Failed to save tokens:", upsertErr);
        return res.redirect(`${fallbackUrl}?driveError=save_failed`);
      }
      res.redirect(`${fallbackUrl}?driveConnected=true`);
    } catch {
      res.redirect(`${fallbackUrl}?driveError=exchange_failed`);
    }
  });

  router.delete("/api/drive/disconnect", requireSession, async (req, res) => {
    if (!driveEnabled) return res.status(503).json({ error: "drive_not_configured" });
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canConnectDrive(scope)) return res.status(403).json({ error: "forbidden" });
      await supabase.from("drive_connections").delete().eq("owner_user_id", session.userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed_to_disconnect" });
    }
  });

  return router;
}
