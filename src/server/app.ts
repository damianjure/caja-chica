import express, { type Request, RequestHandler } from "express";
import { tierRead, tierWrite, tierAuth, tierStrict, tierResend } from "./rateLimit.ts";
import { randomBytes } from "node:crypto";

import { filterMovementsForReport, resolveReportDateRange } from "../reports/shared.ts";
import { buildReportFile } from "./reportExports.ts";
import { getDriveAuthUrl, exchangeCodeForTokens, uploadFileToDrive, encryptToken, decryptToken } from "./drive.ts";
import { sendAppInvitationEmail, sendDashboardInvitationEmail } from "./email.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "./gemini.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";
import { ensurePersonalDashboard, seedDemoData, purgeDemoData } from "./demoSeed.ts";
import {
  parseBudgetRequest,
  parseDashboardInvitationRequest,
  parseEmpresaRequest,
  parseExtractRequest,
  parseInvitationRequest,
  parsePaginationQuery,
  parseReconciliationRequest,
  parseRecurrenteRequest,
  parseReportExportRequest,
  parseSaveMovimientosRequest,
  parseUpdateEmpresaRequest,
  parseUpdateMovimientoRequest,
} from "./validation.ts";

// Re-export shared domain types from contracts.ts for backward-compatibility
// (tests and callers that import them from app.ts keep working unchanged).
export type {
  AppUserStatus,
  AppSession,
  DashboardMemberRole,
  DataAccessScope,
  DashboardMemberSummary,
  SupabaseLike,
  GenAILike,
} from "./contracts.ts";
import type {
  AppSession,
  DataAccessScope,
  DashboardMemberSummary,
  SupabaseLike,
  GenAILike,
} from "./contracts.ts";
import {
  resolveDataAccessScope as resolveDataAccessScopeFn,
  canWriteToScope,
  canManageDashboardMembers,
  applyDataScope,
  buildWriteOwnership,
  getScopeEntityById as getScopeEntityByIdFn,
  fetchScopedMovimientos as fetchScopedMovimientosFn,
} from "./dataScope.ts";
import {
  getBotConnectionRecord as getBotConnectionRecordFn,
  upsertBotConnectionRecord as upsertBotConnectionRecordFn,
} from "./botConnection.ts";
import {
  syncPendingDashboardInvitations as syncPendingDashboardInvitationsFn,
  listDashboardMembers as listDashboardMembersFn,
} from "./invitations.ts";
import {
  insertAuditLog as insertAuditLogFn,
  logEntityMutation as logEntityMutationFn,
  createEmpresaDeleteBackup as createEmpresaDeleteBackupFn,
  insertReportExport as insertReportExportFn,
} from "./audit.ts";
import {
  isOwnerLike,
  scopePerm,
  canConnectDrive,
  canExportDrive,
  canExportLocal,
  canManageEmpresasOp,
  canManageCategoriasOp,
  canDeleteOthers,
  canEditOthers,
  resolveDriveOwnerUserId as resolveDriveOwnerUserIdFn,
} from "./scopePermissions.ts";
import { computeNextRun, relativeRunLabel, type Frecuencia } from "./recurrentes.ts";
import { isWriteBlocked, getMaintenanceState, setMaintenanceStatus, maintenanceCache } from "./maintenance.ts";
import { notifyMaintenance } from "./maintenanceNotify.ts";
import { createMaintenanceRouter } from "./routes/maintenance.ts";
import { createMeRouter } from "./routes/me.ts";
import { createTelegramRouter } from "./routes/telegram.ts";
import { createAdminRouter } from "./routes/admin.ts";
import { createMovimientosRouter } from "./routes/movimientos.ts";
import { createEmpresasRouter } from "./routes/empresas.ts";
import { createCategoriasRouter } from "./routes/categorias.ts";
import { createPresupuestosRouter } from "./routes/presupuestos.ts";
import { createDriveRouter } from "./routes/drive.ts";
import { createInformesRouter } from "./routes/informes.ts";
import { createDashboardRouter } from "./routes/dashboard.ts";
import { createCronsRouter } from "./routes/crons.ts";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;

function getSession(req: Request): AppSession {
  if (!req.session) throw new Error("BUG: session middleware not applied");
  return req.session;
}

function unrefInterval(timer: ReturnType<typeof setInterval>) {
  const maybeUnref = (timer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(timer);
}

export interface AppDeps {
  supabase: SupabaseLike;
  genAI: GenAILike;
  genAI2?: GenAILike | null;
  allowedOrigins: string[];
  botActive: boolean;
  webhookPath?: string;
  webhookHandler?: RequestHandler;
  webhookSecret?: string;
  adminApiToken?: string;
  enableDangerousRoutes?: boolean;
  publicAppUrl?: string;
  telegramBotUsername?: string;
  resolveSession?: (token: string) => Promise<AppSession | null>;
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  googleDriveRedirectUri?: string;
  tokenEncryptionKey?: string;
  bot?: { api: { sendMessage(chatId: string | number, text: string, opts?: unknown): Promise<unknown> } } | null;
  cronSecret?: string;
}


function withCors(allowedOrigins: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Admin-Token");
    }
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  };
}

function hasValidAdminToken(req: express.Request, adminApiToken?: string) {
  if (!adminApiToken) return false;
  return req.header("X-Admin-Token") === adminApiToken;
}


const pendingDriveOAuthStates = new Map<string, { userId: string; expiresAt: number }>();

// WARNING-10: evict expired Drive OAuth states every 5 minutes
const pendingDriveOAuthStatesSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, v] of pendingDriveOAuthStates) {
    if (now > v.expiresAt) pendingDriveOAuthStates.delete(key);
  }
}, 5 * 60_000);
unrefInterval(pendingDriveOAuthStatesSweep);

export function createApp({
  supabase,
  genAI,
  genAI2 = null,
  allowedOrigins,
  botActive,
  webhookPath,
  webhookHandler,
  webhookSecret,
  adminApiToken,
  enableDangerousRoutes = false,
  publicAppUrl,
  telegramBotUsername,
  resolveSession,
  googleDriveClientId,
  googleDriveClientSecret,
  googleDriveRedirectUri,
  tokenEncryptionKey,
  bot,
  cronSecret,
}: AppDeps) {
  const app = express();

  const buildTelegramDeepLink = (token: string | null) =>
    token && telegramBotUsername
      ? `https://t.me/${telegramBotUsername}?start=${token}`
      : null;

  const effectiveResolveSession =
    resolveSession ||
    (async (token: string): Promise<AppSession | null> => {
      const authUserResponse = await (supabase as any).auth.getUser(token);
      const authUser = authUserResponse?.data?.user ?? null;
      if (!authUser?.id || !authUser?.email) return null;

      const { data, error } = await supabase
        .from("app_users")
        .select("user_id, email, role, status")
        .eq("user_id", authUser.id)
        .limit(1);
      if (error) throw error;
      const profile = data?.[0];
      if (!profile) return null;
      // blocked + suspended (legacy) users cannot session at all.
      // paused users keep their session but writes are rejected by enforceUserStatus.
      if (profile.status === "blocked" || profile.status === "suspended") return null;

      return {
        userId: profile.user_id,
        email: profile.email,
        role: profile.role,
        status: profile.status,
      };
    });

  // Bound adapters — routers call these with the same 1-arg / 2-arg signatures as before.
  // The module-level functions in dataScope.ts take supabase as explicit first param.
  const resolveDataAccessScope = (session: AppSession) =>
    resolveDataAccessScopeFn(supabase, session);

  const insertAuditLog = (payload: Record<string, unknown>) =>
    insertAuditLogFn(supabase, payload);

  const getScopeEntityById = (table: string, session: AppSession, scope: DataAccessScope, id: string) =>
    getScopeEntityByIdFn(supabase, table, session, scope, id);

  const fetchScopedMovimientos = (session: AppSession, scope: DataAccessScope) =>
    fetchScopedMovimientosFn(supabase, session, scope);

  const insertReportExport = (payload: Record<string, unknown>) =>
    insertReportExportFn(supabase, payload);

  const logEntityMutation = (args: {
    session: AppSession;
    scope: DataAccessScope;
    source: "web" | "telegram" | "system";
    action: "create" | "update" | "delete" | "restore_backup";
    entityType: "movimiento" | "empresa" | "movimientos_bulk";
    entityId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) => logEntityMutationFn(supabase, args);

  const createEmpresaDeleteBackup = (args: {
    session: AppSession;
    scope: DataAccessScope;
    empresa: Record<string, unknown>;
    movimientosSnapshot: unknown[];
    source: "web" | "telegram";
  }) => createEmpresaDeleteBackupFn(supabase, args);

  const getBotConnectionRecord = (session: AppSession, scope: DataAccessScope) =>
    getBotConnectionRecordFn(supabase, session, scope);

  const upsertBotConnectionRecord = (
    session: AppSession,
    scope: DataAccessScope,
    token: string,
    tokenExpiresAt: string,
  ) => upsertBotConnectionRecordFn(supabase, session, scope, token, tokenExpiresAt);

  const syncPendingDashboardInvitations = (session: AppSession) =>
    syncPendingDashboardInvitationsFn(supabase, session);

  const listDashboardMembers = (dashboardId: string) =>
    listDashboardMembersFn(supabase, dashboardId);

  app.use(withCors(allowedOrigins));
  app.use(express.json());

  // Global rate limiting by HTTP method tier
  app.get("/api/*", tierRead);
  app.post("/api/*", tierWrite);
  app.patch("/api/*", tierWrite);
  app.delete("/api/*", tierWrite);
  // Drive OAuth callback has no session — tighter IP-based limit
  app.get("/api/drive/callback", tierAuth);

  const isMutationMethod = (method: string) => {
    const m = method.toUpperCase();
    return m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE";
  };

  const requireSession: RequestHandler = async (req, res, next) => {
    try {
      const authorization = req.header("Authorization");
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!token) return res.status(401).json({ error: "unauthorized" });
      const session = await effectiveResolveSession(token);
      if (!session) return res.status(403).json({ error: "forbidden" });

      // Decode JWT payload to get session_id (no verification needed — token already verified above)
      try {
        const payloadB64 = token.split(".")[1];
        if (payloadB64) {
          const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
          if (typeof payload.session_id === "string") session.sessionId = payload.session_id;
        }
      } catch {
        // non-fatal — sessionId stays undefined
      }

      // paused users keep read access, mutations are blocked.
      if (session.status === "paused" && isMutationMethod(req.method)) {
        return res.status(423).json({ error: "user_paused" });
      }

      req.session = session;
      next();
    } catch (err) {
      console.error("Auth error:", err);
      res.status(401).json({ error: "unauthorized" });
    }
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    const session = req.session;
    if (!session) return res.status(401).json({ error: "unauthorized" });
    if (session.role !== "admin" && session.role !== "superadmin") {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };

  const requireSuperadmin: RequestHandler = (req, res, next) => {
    const session = req.session;
    if (!session) return res.status(401).json({ error: "unauthorized" });
    if (session.role !== "superadmin") {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };

  // Blocks mutations for paused users. Run AFTER requireSession on mutation routes.
  const enforceUserStatus: RequestHandler = (req, res, next) => {
    const session = req.session;
    if (!session) return res.status(401).json({ error: "unauthorized" });
    if (session.status === "paused") {
      return res.status(423).json({ error: "user_paused" });
    }
    next();
  };

  // Blocks all write methods during grace and active maintenance.
  // GET requests always pass. /api/maintenance/* and /api/health are exempt.
  const maintenanceWriteGuard: RequestHandler = (req, res, next) => {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "OPTIONS") return next();
    const path = req.path;
    if (path.startsWith("/api/maintenance/") || path === "/api/health") return next();
    if (isWriteBlocked()) {
      return res.status(503).json({
        code: "MAINTENANCE_ACTIVE",
        message: "El sistema está en mantenimiento. Intentá de nuevo en unos minutos.",
      });
    }
    next();
  };

  // Apply maintenance write guard globally — before any write routes.
  app.use(maintenanceWriteGuard);

  // Drive OAuth endpoints

  const driveEnabled = !!(googleDriveClientId && googleDriveClientSecret && googleDriveRedirectUri && tokenEncryptionKey);

  // WARNING-18: warn at startup if DASHBOARD_URL is missing — Drive OAuth callback will redirect incorrectly
  if (driveEnabled && !publicAppUrl) {
    console.warn("[drive] WARNING: DASHBOARD_URL is not set. Drive OAuth callback will redirect to backend root instead of frontend.");
  }

  const resolveDriveOwnerUserId = (session: AppSession, scope: DataAccessScope) =>
    resolveDriveOwnerUserIdFn(supabase, session, scope);

  const routeContext = {
    supabase,
    genAI,
    genAI2,
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
  };

  app.use(createMaintenanceRouter({
    supabase,
    requireSession,
    requireSuperadmin,
    getSession,
    getMaintenanceState,
    setMaintenanceStatus,
    notifyMaintenance,
    bot: bot ?? null,
  }));
  app.use(createMeRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    syncPendingDashboardInvitations,
    ensurePersonalDashboard,
    seedDemoData,
    purgeDemoData,
  }));
  app.use(createTelegramRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    getBotConnectionRecord,
    upsertBotConnectionRecord,
    buildTelegramDeepLink,
    randomBytes,
    webhookPath,
    webhookHandler,
    webhookSecret,
  }));
  app.use(createAdminRouter({
    supabase,
    requireSession,
    requireAdmin,
    requireSuperadmin,
    getSession,
    publicAppUrl,
    botActive,
    parseInvitationRequest,
    sendAppInvitationEmail,
  }));
  app.use(createMovimientosRouter({
    supabase,
    genAI,
    genAI2,
    adminApiToken,
    enableDangerousRoutes,
    requireSession,
    requireAdmin,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    applyDataScope,
    buildWriteOwnership,
    getScopeEntityById,
    logEntityMutation,
    canManageEmpresasOp,
    canDeleteOthers,
    canEditOthers,
    parseExtractRequest,
    parseSaveMovimientosRequest,
    parseUpdateMovimientoRequest,
    parseReconciliationRequest,
    parsePaginationQuery,
    parseRecurrenteRequest,
    SYSTEM_PROMPT,
    parseGeminiJsonResponse,
    computeNextRun,
    relativeRunLabel,
    hasValidAdminToken,
    tierStrict,
  }));
  app.use(createEmpresasRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canManageEmpresasOp,
    applyDataScope,
    buildWriteOwnership,
    getScopeEntityById,
    logEntityMutation,
    createEmpresaDeleteBackup,
    parseEmpresaRequest,
    parseUpdateEmpresaRequest,
  }));
  app.use(createCategoriasRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canManageCategoriasOp,
    applyDataScope,
  }));
  app.use(createPresupuestosRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    applyDataScope,
    buildWriteOwnership,
    parseBudgetRequest,
  }));
  app.use(createDriveRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canConnectDrive,
    canExportDrive,
    resolveDriveOwnerUserId,
    pendingDriveOAuthStates,
    driveEnabled,
    randomBytes,
    publicAppUrl,
    googleDriveClientId,
    googleDriveClientSecret,
    googleDriveRedirectUri,
    tokenEncryptionKey,
    getDriveAuthUrl,
    exchangeCodeForTokens,
    encryptToken,
  }));
  app.use(createInformesRouter({
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canExportDrive,
    canExportLocal,
    fetchScopedMovimientos,
    filterMovementsForReport,
    resolveReportDateRange,
    buildReportFile,
    insertReportExport,
    buildWriteOwnership,
    resolveDriveOwnerUserId,
    driveEnabled,
    googleDriveClientId,
    googleDriveClientSecret,
    googleDriveRedirectUri,
    tokenEncryptionKey,
    decryptToken,
    uploadFileToDrive,
    parseReportExportRequest,
    isMissingSchemaArtifactError,
    applyDataScope,
  }));
  app.use(createDashboardRouter({
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
  }));
  app.use(createCronsRouter({
    supabase,
    bot: bot ?? null,
    dashboardUrl: publicAppUrl ?? "",
    cronSecret,
  }));

  return app;
}
