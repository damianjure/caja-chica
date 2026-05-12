import express, { type Request, RequestHandler } from "express";
import { tierRead, tierWrite, tierAuth, tierStrict } from "./rateLimit.ts";
import { randomBytes } from "node:crypto";

import { filterMovementsForReport, resolveReportDateRange } from "../reports/shared.ts";
import { buildReportFile } from "./reportExports.ts";
import { getDriveAuthUrl, exchangeCodeForTokens, uploadFileToDrive, encryptToken, decryptToken } from "./drive.ts";
import { sendAppInvitationEmail, sendDashboardInvitationEmail } from "./email.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "./gemini.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";
import {
  AppRole,
  parseBudgetRequest,
  parseDashboardInvitationRequest,
  parseEmpresaRequest,
  parseExtractRequest,
  parseInvitationRequest,
  parsePaginationQuery,
  parseReconciliationRequest,
  parseReportExportRequest,
  parseSaveMovimientosRequest,
  parseUpdateEmpresaRequest,
  parseUpdateMovimientoRequest,
} from "./validation.ts";

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
}: AppDeps) {
  const app = express();

  // WARNING-7: track which users were already synced in this process lifetime.
  // Tradeoff: process restart re-syncs all users (acceptable — invitations sync is idempotent).
  // Declared inside createApp so tests get a fresh Set per app instance.
  const syncedUserKeys = new Set<string>();

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
        .select("id, dashboard_id, role")
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
      .select("id, user_id, role, status, created_at, permissions")
      .eq("dashboard_id", dashboardId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;

    const members = data ?? [];
    if (members.length === 0) return [];

    // WARNING-12: batch fetch all users in a single query instead of N+1
    const userIds = members.map((m: any) => m.user_id);
    const { data: userRows, error: userError } = await supabase
      .from("app_users")
      .select("user_id, email")
      .in("user_id", userIds)
      .limit(userIds.length);
    if (userError) throw userError;

    const userById = new Map<string, { email: string | null }>();
    for (const u of userRows ?? []) {
      userById.set(u.user_id, { email: u.email ?? null });
    }

    return members.map((member: any) => ({
      id: member.id,
      user_id: member.user_id,
      email: userById.get(member.user_id)?.email ?? null,
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

      // WARNING-7: skip sync if already done for this user in this process lifetime
      const syncKey = `${session.userId}:${session.email}`;
      if (!syncedUserKeys.has(syncKey)) {
        await syncPendingDashboardInvitations(session);
        syncedUserKeys.add(syncKey);
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

  app.get("/api/me", requireSession, async (req, res) => {
    const session = getSession(req);
    const { data } = await supabase
      .from("app_users")
      .select("display_name, notification_hour")
      .eq("user_id", session.userId)
      .single();
    res.json({
      id: session.userId,
      email: session.email,
      role: session.role,
      status: session.status,
      display_name: data?.display_name ?? null,
      notification_hour: data?.notification_hour ?? 21,
    });
  });

  app.patch("/api/me", requireSession, async (req, res) => {
    const session = getSession(req);
    const body = req.body as { display_name?: string | null; notification_hour?: number };
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

  app.get("/api/me/export", requireSession, async (req, res) => {
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

  app.get("/api/me/sessions", requireSession, async (req, res) => {
    const session = getSession(req);
    const { data, error } = await supabase.rpc("get_my_sessions", { target_user_id: session.userId });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ sessions: data ?? [], currentSessionId: session.sessionId ?? null });
  });

  app.delete("/api/me/sessions/:sessionId", requireSession, async (req, res) => {
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

  app.delete("/api/me", requireSession, async (req, res) => {
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

  app.get("/api/bot/connection", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const connection = await getBotConnectionRecord(session, scope);
      const token = connection?.link_token ?? null;
      res.json({
        connected: Boolean(connection?.chat_id),
        chatId: connection?.chat_id ?? null,
        telegramUsername: connection?.username ?? null,
        linkedAt: connection?.linked_at ?? null,
        remindersEnabled: connection?.reminders_enabled ?? true,
        pendingToken: token,
        pendingTokenExpiresAt: connection?.link_token_expires_at ?? null,
        telegramDeepLink: buildTelegramDeepLink(token),
        manualStartCode: token ? `/start ${token}` : null,
      });
    } catch (err) {
      console.error("Bot connection fetch error:", err);
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  app.post("/api/bot/connection/link-token", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const token = randomBytes(24).toString("hex");
      const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const data = await upsertBotConnectionRecord(session, scope, token, tokenExpiresAt);

      res.status(201).json({
        connected: Boolean(data?.chat_id),
        chatId: data?.chat_id ?? null,
        telegramUsername: data?.username ?? null,
        linkedAt: data?.linked_at ?? null,
        remindersEnabled: data?.reminders_enabled ?? true,
        pendingToken: data?.link_token ?? token,
        pendingTokenExpiresAt: data?.link_token_expires_at ?? tokenExpiresAt,
        telegramDeepLink: buildTelegramDeepLink(data?.link_token ?? token),
        manualStartCode: `/start ${data?.link_token ?? token}`,
      });
    } catch (err) {
      console.error("Bot connection token error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", botActive });
  });

  app.post("/api/extract", requireSession, tierStrict, async (req, res) => {
    try {
      const payload = parseExtractRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const catList =
        payload.categories.map((category) => category.nombre).join(", ") || "Otros";

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: payload.text,
        config: {
          systemInstruction: `${SYSTEM_PROMPT}\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".`,
        },
      });

      const textResponse =
        result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const extracted = parseGeminiJsonResponse(textResponse);
      if (!extracted) {
        return res.status(422).json({ error: "invalid_extraction" });
      }
      res.json(extracted);
    } catch (err) {
      console.error("Extract error:", err);
      res.status(500).json({ error: "failed_to_process" });
    }
  });

  app.post("/api/movimientos", requireSession, async (req, res) => {
    try {
      const payload = parseSaveMovimientosRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const saved: any[] = [];
      for (const item of payload.items) {
        const { data, error } = await supabase
          .from("movimientos")
          .insert([
            {
              ...buildWriteOwnership(session, scope),
              tipo: item.tipo,
              moneda: item.moneda,
              monto: Math.abs(item.monto || 0),
              categoria: item.categoria || "Otros",
              empresa_nombre: item.empresa || "Personal",
              descripcion: item.descripcion,
              original_text: payload.originalText,
              conciliado: true,
              conciliado_notas: null,
            },
          ])
          .select();
        if (error) throw error;
        const created = data?.[0];
        saved.push(created);
        if (created?.id) {
          await logEntityMutation({
            session,
            scope,
            source: "web",
            action: "create",
            entityType: "movimiento",
            entityId: created.id,
            afterData: created,
          });
        }
      }
      res.json(saved);
    } catch (err) {
      console.error("Save error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.post("/api/empresas", requireSession, async (req, res) => {
    try {
      const payload = parseEmpresaRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (!canManageEmpresasOp(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const { data, error } = await supabase
        .from("empresas")
        .insert([{ nombre: payload.nombre, ...buildWriteOwnership(session, scope) }])
        .select()
        .single();
      if (error) throw error;
      if (data?.id) {
        await logEntityMutation({
          session,
          scope,
          source: "web",
          action: "create",
          entityType: "empresa",
          entityId: data.id,
          afterData: data,
        });
      }
      res.json(data);
    } catch (err) {
      console.error("Empresa error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.delete("/api/movimientos/last", requireSession, async (_req, res) => {
    try {
      const session = getSession(_req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const query = applyDataScope(
        supabase
          .from("movimientos")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        session,
        scope,
      );
      const { data, error } = await query.limit(1);
      if (error) throw error;

      const last = data?.[0] ?? null;
      if (!last) return res.json({ ok: true, id: null });

      const beforeData = [last];

      await supabase
        .from("movimientos")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: session.userId,
        })
        .eq("id", last.id);

      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "movimiento",
        entityId: last.id,
        beforeData: beforeData?.[0] ?? null,
      });

      res.json({ ok: true, id: last.id });
    } catch (err) {
      console.error("Delete last movimiento error:", err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.delete("/api/movimientos/all", requireSession, requireAdmin, async (req, res) => {
    if (!enableDangerousRoutes || !hasValidAdminToken(req, adminApiToken)) {
      return res.status(403).json({ error: "forbidden" });
    }

    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      // CRITICAL-3: soft delete — never hard delete movimientos
      // CRITICAL: scope filter — only delete within the caller's dashboard/owner
      const bulkUpdate = applyDataScope(
        supabase
          .from("movimientos")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by_user_id: session.userId,
          })
          .is("deleted_at", null),
        session,
        scope,
      );
      const { error: bulkErr } = await bulkUpdate;
      if (bulkErr) throw bulkErr;
      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "movimientos_bulk",
        entityId: "00000000-0000-0000-0000-000000000000",
        beforeData: { note: "bulk soft-delete via dangerous route" },
      });
      res.json({ ok: true });
    } catch (_err) {
      console.error("[DELETE /api/movimientos/all]", _err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.delete("/api/movimientos/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const { data: existingRows, error: fetchErr } = await applyDataScope(
        supabase.from("movimientos").select("*").is("deleted_at", null),
        session,
        scope,
      ).eq("id", req.params.id).limit(1);
      if (fetchErr) throw fetchErr;
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ error: "not_found" });

      if (existing.owner_user_id !== session.userId && !canDeleteOthers(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const { error } = await supabase
        .from("movimientos")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: session.userId,
        })
        .eq("id", req.params.id);
      if (error) throw error;
      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "movimiento",
        entityId: req.params.id,
        beforeData: existing,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Movimiento delete error:", err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.delete("/api/empresas/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope) || !canManageEmpresasOp(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const existing = await getScopeEntityById("empresas", session, scope, req.params.id);
      if (!existing) return res.status(404).json({ error: "not_found" });
      // WARNING-20: reject if already soft-deleted to prevent duplicate backup and misleading success
      if ((existing as any).deleted_at) return res.status(404).json({ error: "not_found" });

      const { data: relatedMovimientos, error: movimientosError } = await applyDataScope(
        supabase.from("movimientos").select("*"),
        session,
        scope,
      )
        .eq("empresa_nombre", (existing as any).nombre)
        .is("deleted_at", null)
        .limit(500);
      if (movimientosError) throw movimientosError;
      // WARNING-16: warn if snapshot may be incomplete due to limit
      if (relatedMovimientos && relatedMovimientos.length === 500) {
        console.warn("[empresa backup] snapshot may be incomplete — 500 limit reached for empresa", req.params.id);
      }

      await createEmpresaDeleteBackup({
        session,
        scope,
        empresa: existing,
        movimientosSnapshot: relatedMovimientos ?? [],
        source: "web",
      });

      const softDeletePayload = {
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: session.userId,
      };
      const { error } = await supabase
        .from("empresas")
        .update(softDeletePayload)
        .eq("id", req.params.id);
      if (error) throw error;
      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "empresa",
        entityId: req.params.id,
        beforeData: existing,
        afterData: { ...(existing as any), ...softDeletePayload },
      });
      res.json({ ok: true });
    } catch (_err) {
      console.error("[DELETE /api/empresas/:id]", _err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.delete("/api/categorias/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope) || !canManageCategoriasOp(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const { data: existing, error: fetchError } = await applyDataScope(
        supabase.from("categorias").select("id"),
        session,
        scope,
      )
        .eq("id", req.params.id)
        .limit(1);
      if (fetchError) throw fetchError;
      if (!existing?.[0]) return res.status(404).json({ error: "not_found" });

      const { error } = await supabase
        .from("categorias")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (_err) {
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.post("/api/movimientos/:id/conciliar", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const payload = parseReconciliationRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const { data: existing, error: fetchError } = await applyDataScope(
        supabase.from("movimientos").select("id").is("deleted_at", null),
        session,
        scope,
      )
        .eq("id", req.params.id)
        .limit(1);
      if (fetchError) throw fetchError;
      if (!existing?.[0]) return res.status(404).json({ error: "not_found" });

      const { error } = await supabase
        .from("movimientos")
        .update({
          conciliado: payload.conciliado,
          conciliado_at: payload.conciliado ? new Date().toISOString() : null,
          conciliado_notas: payload.notas || null,
        })
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (_err) {
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.patch("/api/movimientos/:id", requireSession, async (req, res) => {
    try {
      const payload = parseUpdateMovimientoRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const { data: existingRows, error: fetchErr } = await applyDataScope(
        supabase.from("movimientos").select("*").is("deleted_at", null),
        session,
        scope,
      ).eq("id", req.params.id).limit(1);
      if (fetchErr) throw fetchErr;
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ error: "not_found" });

      if (existing.owner_user_id !== session.userId && !canEditOthers(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const updatePayload: Record<string, unknown> = {};
      if (payload.monto !== undefined) updatePayload.monto = payload.monto;
      if (payload.categoria !== undefined) updatePayload.categoria = payload.categoria;
      if (payload.empresa !== undefined) updatePayload.empresa_nombre = payload.empresa || "Personal";
      if (payload.descripcion !== undefined) updatePayload.descripcion = payload.descripcion;
      if (payload.tipo !== undefined) updatePayload.tipo = payload.tipo;
      if (payload.moneda !== undefined) updatePayload.moneda = payload.moneda;

      const { error } = await supabase
        .from("movimientos")
        .update(updatePayload)
        .eq("id", req.params.id);
      if (error) throw error;

      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "update",
        entityType: "movimiento",
        entityId: req.params.id,
        beforeData: existing,
        afterData: { ...(existing as any), ...updatePayload },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("Movimiento update error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.patch("/api/empresas/:id", requireSession, async (req, res) => {
    try {
      const payload = parseUpdateEmpresaRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope) || !canManageEmpresasOp(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const existing = await getScopeEntityById("empresas", session, scope, req.params.id);
      if (!existing) return res.status(404).json({ error: "not_found" });
      if ((existing as any).deleted_at) return res.status(404).json({ error: "not_found" });

      const updatePayload = { nombre: payload.nombre };
      const { error } = await supabase
        .from("empresas")
        .update(updatePayload)
        .eq("id", req.params.id);
      if (error) throw error;

      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "update",
        entityType: "empresa",
        entityId: req.params.id,
        beforeData: existing,
        afterData: { ...(existing as any), ...updatePayload },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("Empresa update error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.post("/api/presupuestos", requireSession, async (req, res) => {
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

  app.get("/api/movimientos", requireSession, async (req, res) => {
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

  app.get("/api/presupuestos", requireSession, async (req, res) => {
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

  app.get("/api/drive/status", requireSession, async (req, res) => {
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

  app.get("/api/drive/auth-url", requireSession, async (req, res) => {
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

  app.get("/api/drive/callback", async (req, res) => {
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
      await supabase.from("drive_connections").upsert(
        [{ owner_user_id: pending.userId, refresh_token_enc: encryptedToken, updated_at: new Date().toISOString() }],
        { onConflict: "owner_user_id" },
      );
      res.redirect(`${fallbackUrl}?driveConnected=true`);
    } catch {
      res.redirect(`${fallbackUrl}?driveError=exchange_failed`);
    }
  });

  app.delete("/api/drive/disconnect", requireSession, async (req, res) => {
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

  app.get("/api/report-exports", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const { data, error } = await applyDataScope(
        supabase
          .from("report_exports")
          .select("*")
          .order("created_at", { ascending: false }),
        session,
        scope,
      ).limit(100);
      if (error) throw error;
      res.json(data ?? []);
    } catch (error) {
      if (isMissingSchemaArtifactError(error)) {
        return res.json([]);
      }
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  app.post("/api/report-exports", requireSession, async (req, res) => {
    try {
      const payload = parseReportExportRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const range = resolveReportDateRange(payload);
      if (!range) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const scopedMovements = await fetchScopedMovimientos(session, scope);
      const filteredMovements = filterMovementsForReport(scopedMovements, payload, range);
      const dateSlug =
        payload.period === "month"
          ? payload.month
          : payload.period === "range"
            ? `${payload.from}_${payload.to}`
            : payload.anchorDate;
      const fileName = `informe_${payload.period}_${dateSlug || new Date().toISOString().slice(0, 10)}.${payload.format}`;
      const file = buildReportFile({
        format: payload.format,
        fileName,
        periodLabel: range.label,
        filters: payload,
        movements: filteredMovements as any[],
      });

      // WARNING-19: use validated destination from payload, not raw req.body
      if (!canExportLocal(scope) && payload.destination === "local") {
        return res.status(403).json({ error: "forbidden" });
      }
      const wantsDrive = payload.destination === "drive" && driveEnabled && canExportDrive(scope);
      let driveFileId: string | null = null;
      let driveUrl: string | null = null;

      if (wantsDrive) {
        const driveOwnerUserId = await resolveDriveOwnerUserId(session, scope);
        if (!driveOwnerUserId) return res.status(400).json({ error: "drive_not_connected" });
        const { data: connData } = await supabase
          .from("drive_connections")
          .select("refresh_token_enc")
          .eq("owner_user_id", driveOwnerUserId)
          .limit(1);
        const connection = connData?.[0];
        if (!connection) return res.status(400).json({ error: "drive_not_connected" });
        const refreshToken = decryptToken(connection.refresh_token_enc, tokenEncryptionKey!);
        const uploaded = await uploadFileToDrive({
          refreshToken,
          clientId: googleDriveClientId!,
          clientSecret: googleDriveClientSecret!,
          redirectUri: googleDriveRedirectUri!,
          fileName,
          mimeType: file.mimeType,
          buffer: file.buffer,
        });
        driveFileId = uploaded.fileId;
        driveUrl = uploaded.webViewLink;
      }

      const recordPayload = {
        ...buildWriteOwnership(session, scope),
        exported_by_user_id: session.userId,
        format: payload.format,
        period_type: payload.period,
        period_label: range.label,
        period_anchor_date: payload.anchorDate ?? null,
        period_month: payload.month ?? null,
        period_from: payload.from ?? null,
        period_to: payload.to ?? null,
        company: payload.company,
        tipo: payload.tipo,
        moneda: payload.moneda,
        total_movements: filteredMovements.length,
        file_name: fileName,
        destination: wantsDrive ? "drive" : "local",
        drive_file_id: driveFileId,
        drive_url: driveUrl,
      };
      const record = await insertReportExport(recordPayload);

      res.status(201).json({
        format: payload.format,
        mimeType: file.mimeType,
        fileName,
        contentBase64: wantsDrive ? null : file.buffer.toString("base64"),
        driveUrl,
        record: {
          id: record?.id ?? null,
          created_at: record?.created_at ?? new Date().toISOString(),
          totalMovements: filteredMovements.length,
          periodLabel: range.label,
          company: payload.company,
          tipo: payload.tipo,
          moneda: payload.moneda,
          destination: wantsDrive ? "drive" : "local",
          driveUrl,
        },
      });
    } catch (err) {
      console.error("Report export error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.get("/api/empresas", requireSession, async (_req, res) => {
    try {
      const session = getSession(_req);
      const scope = await resolveDataAccessScope(session);
      const { data, error } = await applyDataScope(
        supabase.from("empresas").select("*").order("nombre", { ascending: true }),
        session,
        scope,
      )
        .is("deleted_at", null)
        .limit(500);
      if (error) throw error;
      res.json(data);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  app.get("/api/categorias", requireSession, async (_req, res) => {
    try {
      const session = getSession(_req);
      const scope = await resolveDataAccessScope(session);
      const { data, error } = await applyDataScope(
        supabase.from("categorias").select("*").order("nombre", { ascending: true }),
        session,
        scope,
      ).limit(500);
      if (error) throw error;
      res.json(data);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  app.get("/api/admin/users", requireSession, requireAdmin, async (_req, res) => {
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

  app.get("/api/admin/invitations", requireSession, requireAdmin, async (_req, res) => {
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

  app.post("/api/admin/invitations", requireSession, requireAdmin, async (req, res) => {
    try {
      const payload = parseInvitationRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      if (payload.role === "superadmin" && session.role !== "superadmin") {
        return res.status(403).json({ error: "forbidden" });
      }

      const invitationPayload = {
        email: payload.email,
        role: payload.role,
        status: "pending",
        invited_by: session.userId,
        expires_at: null,
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

  app.post(
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

  app.get(
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

  app.post(
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

  app.post(
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

  app.post(
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

  app.post(
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

  app.get("/api/dashboard/members", requireSession, async (req, res) => {
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
        invitations = (data ?? []).map((invitation: any) => ({
          ...invitation,
          invite_url: `${publicAppUrl || ""}/?invite=${invitation.invite_token}`,
        }));
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

  app.post("/api/dashboard/invitations", requireSession, async (req, res) => {
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

      const invitationPayload = {
        dashboard_id: scope.dashboardId,
        email: payload.email,
        role: payload.role,
        status: acceptedNow ? "accepted" : "pending",
        invited_by_user_id: session.userId,
        accepted_user_id: acceptedNow ? existingUser.user_id : null,
        accepted_at: acceptedNow ? now : null,
        expires_at: null,
        invite_token: inviteToken,
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
              expires_at: null,
            },
            { onConflict: "email" },
          );
        if (globalInviteError) throw globalInviteError;
      }

      const inviteUrl = `${publicAppUrl || ""}/?invite=${data.invite_token}`;
      res.status(201).json({ ...data, invite_url: inviteUrl });
      void sendDashboardInvitationEmail(data.email, inviteUrl, data.role, session.email);
    } catch (err) {
      console.error("Dashboard invitation error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.post("/api/dashboard/invitations/:id/revoke", requireSession, async (req, res) => {
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

  app.post("/api/telegram/invite-token", requireSession, async (req, res) => {
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

  app.get("/api/telegram/links", requireSession, async (req, res) => {
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

      return res.json({ links: data ?? [] });
    } catch (err) {
      console.error("GET /api/telegram/links:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  app.post("/api/telegram/links/:id/confirm", requireSession, async (req, res) => {
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
        .select("id")
        .limit(1);
      if (error) throw error;
      if (!data?.[0]) return res.status(404).json({ error: "link no encontrado o no pendiente" });

      return res.json({ confirmed: true });
    } catch (err) {
      console.error("POST /api/telegram/links/:id/confirm:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  app.delete("/api/telegram/links/:id", requireSession, async (req, res) => {
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

  app.patch("/api/dashboard/members/:id/permissions", requireSession, async (req, res) => {
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

  app.post("/api/dashboard/members/:id/revoke", requireSession, async (req, res) => {
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

  app.post("/api/dashboard/leave", requireSession, async (req, res) => {
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

  if (webhookPath && webhookHandler) {
    app.post(webhookPath, (req, res, next) => {
      if (webhookSecret) {
        const incoming = req.headers["x-telegram-bot-api-secret-token"];
        if (incoming !== webhookSecret) {
          res.sendStatus(403);
          return;
        }
      }
      next();
    }, webhookHandler);
  }

  return app;
}
