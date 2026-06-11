import type { Bot, Context } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan } from "../utils.ts";
import { applyTelegramDataScope, type TelegramLinkRecord } from "../../server/telegramAccess.ts";
import { TelegramChannel } from "../../channels/telegram/adapter.ts";
import { runAskFlow } from "../../flows/ask.ts";

/**
 * Telegram entry to the channel-agnostic ask flow (src/flows/ask.ts). Builds a
 * TelegramChannel adapter + the Telegram-scoped data filter, then hands off.
 * Shared by /preguntar and the "consultar" voice/text intent.
 */
export async function runAskQuestion(
  deps: Pick<BotDeps, "supabase" | "genAI" | "genAI2"> & { botToken?: string },
  ctx: Context,
  linked: TelegramLinkRecord,
  question: string,
) {
  const ch = new TelegramChannel(ctx, { botToken: deps.botToken ?? "" });
  await runAskFlow(ch, deps, (query) => applyTelegramDataScope(query, linked), question);
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
