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
  AppRole,
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

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;

function getSession(req: Request): AppSession {
  if (!req.session) throw new Error("BUG: session middleware not applied");
  return req.session;
}

function unrefInterval(timer: ReturnType<typeof setInterval>) {
  const maybeUnref = (timer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(timer);
}

export interface SupabaseLike {
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{ error: any }>;
    };
  };
}

export interface GenAILike {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config: { systemInstruction: string };
    }): Promise<{
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>;
  };
}

export interface AppDeps {
  supabase: SupabaseLike;
  genAI: GenAILike;
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
}

export type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export interface AppSession {
  userId: string;
  email: string;
  role: AppRole;
  status: AppUserStatus;
  sessionId?: string; // JWT session_id claim — present on real Supabase tokens
}

type DashboardMemberRole = "owner" | "editor" | "viewer";

interface DataAccessScope {
  dashboardId: string | null;
  membershipRole: DashboardMemberRole | null;
  memberPermissions: Record<string, boolean>;
}

interface DashboardMemberSummary {
  id: string;
  user_id: string;
  email: string | null;
  role: DashboardMemberRole;
  status: string;
  created_at: string;
  permissions: Record<string, boolean>;
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

  const resolveDataAccessScope = async (
    session: AppSession,
  ): Promise<DataAccessScope> => {
    try {
      const { data, error } = await supabase
        .from("dashboard_members")
        .select("dashboard_id, role, status, permissions")
        .eq("user_id", session.userId)
        .eq("status", "active")
        .limit(1);

      if (error) throw error;
      const membership = data?.[0];

      if (membership?.dashboard_id) {
        return {
          dashboardId: membership.dashboard_id,
          membershipRole: membership.role ?? "viewer",
          memberPermissions: (membership.permissions as Record<string, boolean>) ?? {},
        };
      }
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }

    return { dashboardId: null, membershipRole: null, memberPermissions: {} };
  };

  const canWriteToScope = (scope: DataAccessScope) => scope.membershipRole !== "viewer";
  const canManageDashboardMembers = (session: AppSession, scope: DataAccessScope) =>
    session.role === "admin" ||
    session.role === "superadmin" ||
    scope.membershipRole === "owner";

  const applyDataScope = <T extends { eq: (column: string, value: string) => T }>(
    query: T,
    session: AppSession,
    scope: DataAccessScope,
  ) =>
    scope.dashboardId
      ? query.eq("dashboard_id", scope.dashboardId)
      : query.eq("owner_user_id", session.userId);

  const buildWriteOwnership = (session: AppSession, scope: DataAccessScope) =>
    scope.dashboardId
      ? {
          owner_user_id: session.userId,
          dashboard_id: scope.dashboardId,
          created_by_user_id: session.userId,
        }
      : {
          owner_user_id: session.userId,
        };

  const insertAuditLog = async (payload: Record<string, unknown>) => {
    try {
      await supabase.from("audit_logs").insert([payload]).select();
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }
  };

  const getScopeEntityById = async (
    table: string,
    session: AppSession,
    scope: DataAccessScope,
    id: string,
  ) => {
    const primaryQuery = scope.dashboardId
      ? supabase.from(table).select("*").eq("dashboard_id", scope.dashboardId)
      : supabase.from(table).select("*").eq("owner_user_id", session.userId);

    const { data, error } = await primaryQuery.eq("id", id).limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  };

  const fetchScopedMovimientos = async (
    session: AppSession,
    scope: DataAccessScope,
  ) => {
    const { data, error } = await applyDataScope(
      supabase
        .from("movimientos")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      session,
      scope,
    ).limit(2000);
    if (error) throw error;
    return (data ?? []) as any[];
  };

  const insertReportExport = async (payload: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase
        .from("report_exports")
        .insert([payload])
        .select();
      if (error) throw error;
      return data?.[0] ?? null;
    } catch (error) {
      if (isMissingSchemaArtifactError(error)) return null;
      throw error;
    }
  };

  const logEntityMutation = async (args: {
    session: AppSession;
    scope: DataAccessScope;
    source: "web" | "telegram" | "system";
    action: "create" | "update" | "delete" | "restore_backup";
    entityType: "movimiento" | "empresa" | "movimientos_bulk";
    entityId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) => {
    await insertAuditLog({
      dashboard_id: args.scope.dashboardId,
      actor_user_id: args.session.userId,
      source: args.source,
      action: args.action,
      entity_type: args.entityType,
      entity_id: args.entityId,
      before_data: args.beforeData ?? null,
      after_data: args.afterData ?? null,
      created_at: new Date().toISOString(),
    });
  };

  const createEmpresaDeleteBackup = async (args: {
    session: AppSession;
    scope: DataAccessScope;
    empresa: Record<string, unknown>;
    movimientosSnapshot: unknown[];
    source: "web" | "telegram";
  }) => {
    try {
      await supabase
        .from("empresa_delete_backups")
        .insert([
          {
            dashboard_id: args.scope.dashboardId,
            empresa_id: args.empresa.id,
            empresa_data: args.empresa,
            related_movimientos_snapshot: args.movimientosSnapshot,
            deleted_by_user_id: args.session.userId,
            source: args.source,
            created_at: new Date().toISOString(),
          },
        ])
        .select();
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }
  };

  const getBotConnectionRecord = async (session: AppSession, scope: DataAccessScope) => {
    if (scope.dashboardId) {
      try {
        const { data, error } = await supabase
          .from("usuarios")
          .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled")
          .eq("user_id", session.userId)
          .limit(1);
        if (error) throw error;
        return data?.[0] ?? null;
      } catch (error) {
        if (!isMissingSchemaArtifactError(error)) throw error;
      }
    }

    const { data, error } = await supabase
      .from("usuarios")
      .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled")
      .eq("owner_user_id", session.userId)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  };

  const upsertBotConnectionRecord = async (
    session: AppSession,
    scope: DataAccessScope,
    token: string,
    tokenExpiresAt: string,
  ) => {
    if (scope.dashboardId) {
      try {
        const { data: existingRows, error: fetchError } = await supabase
          .from("usuarios")
          .select("id")
          .eq("user_id", session.userId)
          .limit(1);
        if (fetchError) throw fetchError;

        const payload = {
          user_id: session.userId,
          owner_user_id: session.userId,
          dashboard_id: scope.dashboardId,
          link_token: token,
          link_token_expires_at: tokenExpiresAt,
          reminders_enabled: true,
        };

        if (existingRows?.[0]?.id) {
          const { error } = await supabase
            .from("usuarios")
            .update(payload)
            .eq("id", existingRows[0].id);
          if (error) throw error;
          return await getBotConnectionRecord(session, scope);
        }

        const { data, error } = await supabase
          .from("usuarios")
          .insert([payload])
          .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled");
        if (error) throw error;
        return data?.[0] ?? (await getBotConnectionRecord(session, scope));
      } catch (error) {
        if (!isMissingSchemaArtifactError(error)) throw error;
      }
    }

    const { data, error } = await supabase
      .from("usuarios")
      .upsert(
        {
          owner_user_id: session.userId,
          link_token: token,
          link_token_expires_at: tokenExpiresAt,
          reminders_enabled: true,
        },
        { onConflict: "owner_user_id" },
      )
      .select("chat_id, username, linked_at, link_token, link_token_expires_at, reminders_enabled")
      .single();
    if (error) throw error;
    return data;
  };

  const syncPendingDashboardInvitations = async (session: AppSession) => {
    try {
      const { data, error } = await supabase
        .from("dashboard_invitations")
        .select("id, dashboard_id, role, invited_by_user_id")
        .eq("email", session.email.toLowerCase())
        .eq("status", "pending")
        .limit(50);
      if (error) throw error;

      const invitations = data ?? [];
      for (const invitation of invitations) {
        await supabase
          .from("dashboard_members")
          .upsert(
            {
              dashboard_id: invitation.dashboard_id,
              user_id: session.userId,
              role: invitation.role,
              status: "active",
              invited_by_user_id: invitation.invited_by_user_id ?? null,
            },
            { onConflict: "dashboard_id,user_id" },
          );

        await supabase
          .from("dashboard_invitations")
          .update({
            status: "accepted",
            accepted_user_id: session.userId,
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", invitation.id);
      }
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }
  };

  const listDashboardMembers = async (dashboardId: string): Promise<DashboardMemberSummary[]> => {
    const { data, error } = await supabase
      .from("dashboard_members")
      .select("id, user_id, role, status, created_at, permissions, app_users!dashboard_members_user_id_fkey(email)")
      .eq("dashboard_id", dashboardId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;

    const members = data ?? [];
    if (members.length === 0) return [];

    return members.map((member: any) => ({
      id: member.id,
      user_id: member.user_id,
      email: member.app_users?.email ?? null,
      role: member.role,
      status: member.status,
      created_at: member.created_at,
      permissions: (member.permissions as Record<string, boolean>) ?? {},
    }));
  };

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

  const isOwnerLike = (scope: DataAccessScope) =>
    scope.membershipRole === null || scope.membershipRole === "owner";

  // Check a granular permission for the current editor. defaultOn = true for backwards-compatible perms.
  const scopePerm = (scope: DataAccessScope, key: string, defaultOn: boolean): boolean => {
    if (scope.membershipRole !== "editor") return false;
    const val = scope.memberPermissions[key];
    return val !== undefined ? !!val : defaultOn;
  };

  const canConnectDrive = (scope: DataAccessScope) => isOwnerLike(scope);

  const canExportDrive = (scope: DataAccessScope): boolean =>
    isOwnerLike(scope) || scopePerm(scope, "export_drive", false);

  const canExportLocal = (scope: DataAccessScope): boolean =>
    isOwnerLike(scope) || scopePerm(scope, "export_local", true);

  const canManageEmpresasOp = (scope: DataAccessScope): boolean =>
    isOwnerLike(scope) || scopePerm(scope, "manage_empresas", true);

  const canManageCategoriasOp = (scope: DataAccessScope): boolean =>
    isOwnerLike(scope) || scopePerm(scope, "manage_categorias", true);

  const canDeleteOthers = (scope: DataAccessScope): boolean =>
    isOwnerLike(scope) || scopePerm(scope, "delete_any", false);

  const canEditOthers = (scope: DataAccessScope): boolean =>
    isOwnerLike(scope) || scopePerm(scope, "edit_any", false);

  const resolveDriveOwnerUserId = async (session: AppSession, scope: DataAccessScope) => {
    if (!scope.dashboardId || scope.membershipRole === "owner" || scope.membershipRole === null) {
      return session.userId;
    }
    const { data, error } = await supabase
      .from("dashboard_members")
      .select("user_id")
      .eq("dashboard_id", scope.dashboardId)
      .eq("role", "owner")
      .eq("status", "active")
      .limit(1);
    if (error) throw error;
    return data?.[0]?.user_id ?? null;
  };

  const routeContext = {
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
  };

  app.use(createMaintenanceRouter(routeContext));
  app.use(createMeRouter(routeContext));
  app.use(createTelegramRouter(routeContext));
  app.use(createAdminRouter(routeContext));
  app.use(createMovimientosRouter(routeContext));
  app.use(createEmpresasRouter(routeContext));
  app.use(createCategoriasRouter(routeContext));
  app.use(createPresupuestosRouter(routeContext));
  app.use(createDriveRouter(routeContext));
  app.use(createInformesRouter(routeContext));
  app.use(createDashboardRouter(routeContext));

  return app;
}
