import express, { RequestHandler } from "express";
import { randomBytes } from "node:crypto";

import { filterMovementsForReport, resolveReportDateRange } from "../reports/shared.ts";
import { buildReportFile } from "./reportExports.ts";
import { getDriveAuthUrl, exchangeCodeForTokens, uploadFileToDrive, encryptToken, decryptToken } from "./drive.ts";
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

export interface SupabaseLike {
  from(table: string): any;
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

export interface AppSession {
  userId: string;
  email: string;
  role: AppRole;
  status: "active" | "suspended";
}

type DashboardMemberRole = "owner" | "editor" | "viewer";

interface DataAccessScope {
  dashboardId: string | null;
  membershipRole: DashboardMemberRole | null;
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

const extractRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const EXTRACT_RATE_LIMIT = 30;
const EXTRACT_RATE_WINDOW_MS = 60_000;

function checkExtractRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = extractRateLimitMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    extractRateLimitMap.set(userId, { count: 1, resetAt: now + EXTRACT_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= EXTRACT_RATE_LIMIT) return false;
  entry.count++;
  return true;
}


const pendingDriveOAuthStates = new Map<string, { userId: string; expiresAt: number }>();

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
      if (!profile || profile.status !== "active") return null;

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
        .select("dashboard_id, role, status")
        .eq("user_id", session.userId)
        .eq("status", "active")
        .limit(1);

      if (error) throw error;
      const membership = data?.[0];

      if (membership?.dashboard_id) {
        return {
          dashboardId: membership.dashboard_id,
          membershipRole: membership.role ?? "viewer",
        };
      }
    } catch (error) {
      if (!isMissingSchemaArtifactError(error)) throw error;
    }

    return { dashboardId: null, membershipRole: null };
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
    entityType: "movimiento" | "empresa";
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
    const enriched = await Promise.all(
      members.map(async (member: any) => {
        const { data: userRows, error: userError } = await supabase
          .from("app_users")
          .select("user_id, email")
          .eq("user_id", member.user_id)
          .limit(1);
        if (userError) throw userError;
        const user = userRows?.[0] ?? null;
        return {
          id: member.id,
          user_id: member.user_id,
          email: user?.email ?? null,
          role: member.role,
          status: member.status,
          created_at: member.created_at,
          permissions: (member.permissions as Record<string, boolean>) ?? {},
        } as DashboardMemberSummary;
      }),
    );

    return enriched;
  };

  app.use(withCors(allowedOrigins));
  app.use(express.json());

  const requireSession: RequestHandler = async (req, res, next) => {
    try {
      const authorization = req.header("Authorization");
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!token) return res.status(401).json({ error: "unauthorized" });
      const session = await effectiveResolveSession(token);
      if (!session) return res.status(403).json({ error: "forbidden" });
      await syncPendingDashboardInvitations(session);

      (req as any).session = session;
      next();
    } catch (err) {
      console.error("Auth error:", err);
      res.status(401).json({ error: "unauthorized" });
    }
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    const session = (req as any).session as AppSession | undefined;
    if (!session) return res.status(401).json({ error: "unauthorized" });
    if (session.role !== "admin" && session.role !== "superadmin") {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };

  app.get("/api/me", requireSession, (req, res) => {
    const session = (req as any).session as AppSession;
    res.json({
      id: session.userId,
      email: session.email,
      role: session.role,
      status: session.status,
    });
  });

  app.get("/api/bot/connection", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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

  app.post("/api/extract", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      if (!checkExtractRateLimit(session.userId)) {
        return res.status(429).json({ error: "rate_limit_exceeded" });
      }

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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
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
      const session = (_req as any).session as AppSession;
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
      await supabase
        .from("movimientos")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      res.json({ ok: true });
    } catch (_err) {
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.delete("/api/movimientos/:id", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const existing = await getScopeEntityById("empresas", session, scope, req.params.id);
      if (!existing) return res.status(404).json({ error: "not_found" });

      const { data: relatedMovimientos, error: movimientosError } = await applyDataScope(
        supabase.from("movimientos").select("*"),
        session,
        scope,
      )
        .eq("empresa_nombre", (existing as any).nombre)
        .limit(500);
      if (movimientosError) throw movimientosError;

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
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  app.delete("/api/categorias/:id", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const existing = await getScopeEntityById("empresas", session, scope, req.params.id);
      if (!existing) return res.status(404).json({ error: "not_found" });

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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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

  const canUseDrive = (scope: DataAccessScope) =>
    scope.membershipRole === null || scope.membershipRole === "owner";

  app.get("/api/drive/status", requireSession, async (req, res) => {
    if (!driveEnabled) return res.json({ connected: false, enabled: false });
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canUseDrive(scope)) return res.json({ connected: false, enabled: false });
      const { data, error } = await supabase
        .from("drive_connections")
        .select("id")
        .eq("owner_user_id", session.userId)
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
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canUseDrive(scope)) return res.status(403).json({ error: "forbidden" });
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
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!canUseDrive(scope)) return res.status(403).json({ error: "forbidden" });
      await supabase.from("drive_connections").delete().eq("owner_user_id", session.userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed_to_disconnect" });
    }
  });

  app.get("/api/report-exports", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
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

      const session = (req as any).session as AppSession;
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

      const wantsDrive = req.body.destination === "drive" && driveEnabled && canUseDrive(scope);
      let driveFileId: string | null = null;
      let driveUrl: string | null = null;

      if (wantsDrive) {
        const { data: connData } = await supabase
          .from("drive_connections")
          .select("refresh_token_enc")
          .eq("owner_user_id", session.userId)
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
      const session = (_req as any).session as AppSession;
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
      const session = (_req as any).session as AppSession;
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

      const session = (req as any).session as AppSession;
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

      res.status(201).json({
        ...data,
        invite_url: `${publicAppUrl || ""}/?invite=${data.invite_token}`,
      });
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

  app.get("/api/dashboard/members", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
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

      const session = (req as any).session as AppSession;
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

      res.status(201).json({
        ...data,
        invite_url: `${publicAppUrl || ""}/?invite=${data.invite_token}`,
      });
    } catch (err) {
      console.error("Dashboard invitation error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  app.post("/api/dashboard/invitations/:id/revoke", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
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
      const session = (req as any).session as AppSession;
      const scope = await resolveDataAccessScope(session);
      if (!scope.dashboardId || scope.membershipRole !== "owner") {
        return res.status(403).json({ error: "solo owner puede cambiar permisos" });
      }

      const { id } = req.params;
      const { permissions } = req.body as { permissions?: Record<string, boolean> };
      if (!permissions || typeof permissions !== "object") {
        return res.status(400).json({ error: "permissions requerido (objeto)" });
      }

      const allowed = ["delete_any", "export_drive", "invite_telegram"] as const;
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
