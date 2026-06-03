import type { Bot, Context } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireLinkedAccount } from "../utils.ts";
import { readReminder, writeReminder } from "../reminderPrefs.ts";
import { buildReminderStatusText, buildReminderKeyboard } from "../reminderText.ts";

export function registerReminderHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  async function show(ctx: Context, edit: boolean) {
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const userId = linked.userId ?? linked.ownerUserId;
    if (!userId) {
      await ctx.reply("❌ No se pudo identificar tu cuenta. Intentá desvincular y volver a vincular.");
      return;
    }
    const state = await readReminder(supabase, userId);
    const text = buildReminderStatusText(state);
    const kb = buildReminderKeyboard(state);
    if (edit) {
      await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }).catch(() => {});
    } else {
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
    }
  }

  bot.command("recordatorio", (ctx) => show(ctx, false));

  bot.callbackQuery("rem_on", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const userId = linked.userId ?? linked.ownerUserId;
    if (!userId) return;
    await writeReminder(supabase, userId, { enabled: true });
    await show(ctx, true);
  });

  bot.callbackQuery("rem_off", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const userId = linked.userId ?? linked.ownerUserId;
    if (!userId) return;
    await writeReminder(supabase, userId, { enabled: false });
    await show(ctx, true);
  });

  bot.callbackQuery(/^rem_h:(\d{1,2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const userId = linked.userId ?? linked.ownerUserId;
    if (!userId) return;
    const h = Number(ctx.match[1]);
    if (h >= 0 && h <= 23) {
      await writeReminder(supabase, userId, { hour: h, minute: 0 });
    }
    await show(ctx, true);
  });
}
