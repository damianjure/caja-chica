import express, { type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike, GenAILike } from "../contracts.ts";
import { answerQuestion, fetchMovimientosForAsk, fetchRecurrentesForAsk } from "../askAgent.ts";
import { GeminiUnavailableError } from "../geminiWithFallback.ts";

export interface AskDeps {
  supabase: SupabaseLike;
  genAI: GenAILike;
  genAI2?: GenAILike | null;
  requireSession: RequestHandler;
  getSession: (req: express.Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  applyDataScope: (query: any, session: AppSession, scope: DataAccessScope) => any;
  parseAskRequest: (body: unknown) => { question: string; history: Array<{ role: "user" | "assistant"; content: string }> } | null;
  tierStrict: RequestHandler;
}

export function createAskRouter(deps: AskDeps) {
  const router = express.Router();
  const {
    supabase,
    genAI,
    genAI2 = null,
    requireSession,
    getSession,
    resolveDataAccessScope,
    applyDataScope,
    parseAskRequest,
    tierStrict,
  } = deps;

  router.post("/api/ask", requireSession, tierStrict, async (req, res) => {
    try {
      const payload = parseAskRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const applyScope = (query: any) => applyDataScope(query, session, scope);
      const [movimientos, recurrentes] = await Promise.all([
        fetchMovimientosForAsk(supabase, applyScope),
        fetchRecurrentesForAsk(supabase, applyScope),
      ]);

      const answer = await answerQuestion({
        genAI,
        genAI2,
        movimientos,
        recurrentes,
        question: payload.question,
        history: payload.history,
      });
      res.json({ answer });
    } catch (err) {
      if (err instanceof GeminiUnavailableError) {
        return res.status(503).json({ error: "ai_unavailable" });
      }
      console.error("Ask error:", err);
      res.status(500).json({ error: "failed_to_process" });
    }
  });

  return router;
}
