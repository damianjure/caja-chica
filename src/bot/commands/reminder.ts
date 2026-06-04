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

  // Apply a change; if the user has no app_users row yet (never logged into the
  // web app), the write affects 0 rows — tell them how to fix it instead of
  // silently pretending it saved.
  async function applyAndShow(ctx: Context, patch: Parameters<typeof writeReminder>[2]) {
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const userId = linked.userId ?? linked.ownerUserId;
    if (!userId) return;
    const saved = await writeReminder(supabase, userId, patch);
    if (!saved) {
      await ctx.reply("Para configurar el recordatorio, entrá una vez a la web con este mismo mail y volvé a probar acá.");
      return;
    }
    await show(ctx, true);
  }

  bot.command("recordatorio", (ctx) => show(ctx, false));

  bot.callbackQuery("rem_on", async (ctx) => {
    await ctx.answerCallbackQuery();
    await applyAndShow(ctx, { enabled: true });
  });

  bot.callbackQuery("rem_off", async (ctx) => {
    await ctx.answerCallbackQuery();
    await applyAndShow(ctx, { enabled: false });
  });

  bot.callbackQuery(/^rem_h:(\d{1,2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const h = Number(ctx.match[1]);
    if (h < 0 || h > 23) return;
    await applyAndShow(ctx, { hour: h, minute: 0 });
  });
}
