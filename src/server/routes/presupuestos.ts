import express, { type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";
import type { BudgetRequest } from "../validation.ts";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;

export interface PresupuestosDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canWriteToScope: (scope: DataAccessScope) => boolean;
  applyDataScope: (query: any, session: AppSession, scope: DataAccessScope) => any;
  buildWriteOwnership: (session: AppSession, scope: DataAccessScope) => Record<string, unknown>;
  parseBudgetRequest: (body: unknown) => BudgetRequest | null;
}

export function createPresupuestosRouter(deps: PresupuestosDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    applyDataScope,
    buildWriteOwnership,
    parseBudgetRequest,
  } = deps;


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
