import express, { type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";

export interface CategoriasRouterDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canWriteToScope: (scope: DataAccessScope) => boolean;
  canManageCategoriasOp: (scope: DataAccessScope) => boolean;
  applyDataScope: (query: any, session: AppSession, scope: DataAccessScope) => any;
}

export function createCategoriasRouter(deps: CategoriasRouterDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canManageCategoriasOp,
    applyDataScope,
  } = deps;


  router.delete("/api/categorias/:id", requireSession, async (req, res) => {
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


  router.post("/api/categorias", requireSession, async (req, res) => {
    try {
      const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
      if (!nombre || nombre.length > 60) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope) || !canManageCategoriasOp(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      // Dedupe case-insensitive within scope — categorías también se materializan solas desde movimientos.
      // select("*") para devolver la fila completa (respeta el contrato Categoria, incl. created_at).
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const findMatch = async () => {
        const { data, error } = await applyDataScope(
          supabase.from("categorias").select("*"),
          session,
          scope,
        ).limit(500);
        if (error) throw error;
        return (data ?? []).find((c: { nombre: string }) => norm(c.nombre) === norm(nombre)) ?? null;
      };

      const existing = await findMatch();
      if (existing) return res.json(existing);

      const ownership = scope.dashboardId
        ? { owner_user_id: session.userId, dashboard_id: scope.dashboardId }
        : { owner_user_id: session.userId };
      const { data, error } = await supabase
        .from("categorias")
        .insert([{ nombre, ...ownership }])
        .select()
        .single();
      if (error) {
        // Carrera: otra request creó la misma categoría entre el check y el insert (unique violation 23505).
        // En vez de 500, devolvemos la existente (idempotente).
        if ((error as { code?: string }).code === "23505") {
          const dup = await findMatch();
          if (dup) return res.json(dup);
        }
        throw error;
      }
      res.json(data);
    } catch (_err) {
      res.status(500).json({ error: "failed_to_save" });
    }
  });


  router.get("/api/categorias", requireSession, async (_req, res) => {
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


  return router;
}
