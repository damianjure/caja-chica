import type { Bot, Context } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, sendTyping, splitForTelegram } from "../utils.ts";
import { applyTelegramDataScope, type TelegramLinkRecord } from "../../server/telegramAccess.ts";
import { answerQuestion, fetchMovimientosForAsk } from "../../server/askAgent.ts";
import { GeminiUnavailableError } from "../../server/geminiWithFallback.ts";

/**
 * Shared runner for /preguntar and the "consultar" voice/text intent.
 * Read-only: fetches the linked user's scoped movements and lets the ask
 * agent answer. Scope comes from applyTelegramDataScope — never global.
 */
export async function runAskQuestion(
  deps: Pick<BotDeps, "supabase" | "genAI" | "genAI2">,
  ctx: Context,
  linked: TelegramLinkRecord,
  question: string,
) {
  sendTyping(ctx);
  try {
    const movimientos = await fetchMovimientosForAsk(deps.supabase, (query) =>
      applyTelegramDataScope(query, linked),
    );
    const answer = await answerQuestion({
      genAI: deps.genAI,
      genAI2: deps.genAI2,
      movimientos,
      question,
    });
    for (const chunk of splitForTelegram(answer)) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      await ctx.reply("⚠️ La IA no está disponible ahora mismo (cuota agotada). Intentá en unos minutos.");
      return;
    }
    console.error("Telegram ask error:", err);
    await ctx.reply("❌ No pude responder la consulta. Intentá de nuevo.");
  }
}

export function registerAskHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  bot.command("preguntar", async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "read");
    if (!linked) return;
    const question = (ctx.match ?? "").toString().trim().slice(0, 500);
    if (!question) {
      await ctx.reply(
        "🤔 Escribí tu consulta después del comando.\nEj: `/preguntar cuánto gasté este mes en supermercado`",
        { parse_mode: "Markdown" },
      );
      return;
    }
    await runAskQuestion(deps, ctx, linked, question);
  });
}
