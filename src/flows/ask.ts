/**
 * flows/ask.ts — the "ask the agent" conversation flow, channel-agnostic.
 *
 * It talks to the user only through ChannelContext, so the same flow runs on
 * Telegram today and WhatsApp later. Scope resolution is channel-specific and
 * stays out: the caller passes `applyScope` (the already-resolved data filter).
 */

import type { ChannelContext } from "../channels/contract.ts";
import type { SupabaseLike, GenAILike } from "../server/contracts.ts";
import { answerQuestion, fetchMovimientosForAsk, fetchRecurrentesForAsk } from "../server/askAgent.ts";
import { GeminiUnavailableError } from "../server/geminiWithFallback.ts";

export interface AskFlowDeps {
  supabase: SupabaseLike;
  genAI: GenAILike;
  genAI2?: GenAILike | null;
}

/**
 * Read-only: fetch the caller's scoped movements + recurrentes and let the ask
 * agent answer. `applyScope` is the channel-resolved data filter (Telegram link,
 * WhatsApp link, HTTP session — the flow doesn't care which).
 */
export async function runAskFlow(
  ch: ChannelContext,
  deps: AskFlowDeps,
  applyScope: (query: any) => any,
  question: string,
): Promise<void> {
  try {
    await ch.typing();
    const [movimientos, recurrentes] = await Promise.all([
      fetchMovimientosForAsk(deps.supabase, applyScope),
      fetchRecurrentesForAsk(deps.supabase, applyScope),
    ]);
    const answer = await answerQuestion({
      genAI: deps.genAI,
      genAI2: deps.genAI2,
      movimientos,
      recurrentes,
      question,
    });
    await ch.reply(answer);
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      await ch.reply("⚠️ La IA no está disponible ahora mismo (cuota agotada). Intentá en unos minutos.");
      return;
    }
    console.error("ask flow error:", err);
    await ch.reply("❌ No pude responder la consulta. Intentá de nuevo.");
  }
}
