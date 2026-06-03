import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { buildHelpMessage } from "../welcome.ts";

export function registerHelpHandlers(bot: Bot, _deps: BotDeps) {
  bot.command("ayuda", async (ctx) => {
    await ctx.reply(buildHelpMessage(ctx.from?.first_name), { parse_mode: "Markdown" });
  });
}
