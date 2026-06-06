import express, { type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";
import type { UpdateEmpresaRequest } from "../validation.ts";
import { warnIfListCapped } from "../listCap.ts";

export interface EmpresasDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canWriteToScope: (scope: DataAccessScope) => boolean;
  canManageEmpresasOp: (scope: DataAccessScope) => boolean;
  applyDataScope: (query: any, session: AppSession, scope: DataAccessScope) => any;
  buildWriteOwnership: (session: AppSession, scope: DataAccessScope) => Record<string, unknown>;
  getScopeEntityById: (table: string, session: AppSession, scope: DataAccessScope, id: string) => Promise<unknown>;
  logEntityMutation: (args: {
    session: AppSession;
    scope: DataAccessScope;
    source: "web" | "telegram" | "system";
    action: "create" | "update" | "delete" | "restore_backup";
    entityType: "movimiento" | "empresa" | "movimientos_bulk";
    entityId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) => Promise<void>;
  createEmpresaDeleteBackup: (args: {
    session: AppSession;
    scope: DataAccessScope;
    empresa: Record<string, unknown>;
    movimientosSnapshot: unknown[];
    source: "web" | "telegram";
  }) => Promise<void>;
  parseEmpresaRequest: (body: unknown) => { nombre: string } | null;
  parseUpdateEmpresaRequest: (body: unknown) => UpdateEmpresaRequest | null;
}

export function createEmpresasRouter(deps: EmpresasDeps) {
  const router = express.Router();
  const {
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
  } = deps;


  router.post("/api/empresas", requireSession, async (req, res) => {
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

      const empresaOwnership = scope.dashboardId
        ? { owner_user_id: session.userId, dashboard_id: scope.dashboardId }
        : { owner_user_id: session.userId };
      const { data, error } = await supabase
        .from("empresas")
        .insert([{ nombre: payload.nombre, ...empresaOwnership }])
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


  router.delete("/api/empresas/:id", requireSession, async (req, res) => {
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
        empresa: existing as Record<string, unknown>,
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


  router.patch("/api/empresas/:id", requireSession, async (req, res) => {
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


  router.get("/api/empresas", requireSession, async (_req, res) => {
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
      warnIfListCapped(data, "GET /api/empresas");
      res.json(data);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  return router;
}
