import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { clearChatSessions } from "../sessions.ts";

export function registerCancelHandler(bot: Bot, _deps: BotDeps): void {
  bot.command("cancel", async (ctx) => {
    clearChatSessions(ctx.chat!.id);
    await ctx.reply("✅ Listo, cancelé lo que estabas haciendo.");
  });
}
