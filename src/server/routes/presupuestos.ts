import express from "express";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;
type Frecuencia = any;
type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export function createPresupuestosRouter(ctx: any) {
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


  router.post("/api/presupuestos", requireSession, async (req, res) => {
    try {
      const payload = parseBudgetRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const ownership = buildWriteOwnership(session, scope);

      const { data, error } = await supabase
        .from("presupuestos")
        .upsert(
          {
            ...ownership,
            period: payload.period,
            categoria: payload.categoria,
            moneda: payload.moneda,
            monto: payload.monto,
          },
          {
            onConflict: scope.dashboardId
              ? "dashboard_id,period,categoria,moneda"
              : "owner_user_id,period,categoria,moneda",
          },
        )
        .select()
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      console.error("Budget error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  router.get("/api/movimientos", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const { limit, before } = parsePaginationQuery(req.query);
      let query = applyDataScope(
        supabase
          .from("movimientos")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        session,
        scope,
      );

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data, error } = (await query.limit(limit)) as Awaited<
        QueryBuilderResult<any[]>
      >;
      if (error) throw error;

      const items = data ?? [];
      const nextCursor =
        items.length === limit && items.at(-1)?.created_at
          ? items.at(-1)?.created_at
          : null;

      res.json({ items, nextCursor });
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  router.get("/api/presupuestos", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const period =
        typeof req.query.period === "string" && /^\d{4}-\d{2}$/.test(req.query.period)
          ? req.query.period
          : null;

      let query = applyDataScope(
        supabase
          .from("presupuestos")
          .select("*")
          .order("period", { ascending: false })
          .order("categoria", { ascending: true }),
        session,
        scope,
      );

      if (period) {
        query = query.eq("period", period);
      }

      const { data, error } = (await query.limit(500)) as Awaited<
        QueryBuilderResult<any[]>
      >;
      if (error) throw error;
      res.json(data ?? []);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });


  return router;
}
