import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, replyExpiredSession } from "../utils.ts";
import { pendingRecurrenceSessions, getRecurrenceSession } from "../sessions.ts";

export function registerRecurringHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  async function startRecurringFlow(ctx: Context) {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    pendingRecurrenceSessions.set(ctx.chat.id, {
      step: "monto",
      linked,
      expiresAt: Date.now() + 10 * 60_000,
    });
    await ctx.reply("🔄 *Nuevo recurrente*\n\nMandame el *monto* (ej: `1500` o `50`):", { parse_mode: "Markdown" });
  }

  bot.command("recurrente", (ctx) => startRecurringFlow(ctx));
  bot.callbackQuery("rec_start", async (ctx) => {
    ctx.answerCallbackQuery();
    await startRecurringFlow(ctx);
  });

  bot.callbackQuery(/^rec_tipo:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session || session.step !== "tipo") return replyExpiredSession(ctx, "rec_start", "🔄 Empezar de nuevo");
    session.tipo = ctx.match[1] as "ingreso" | "egreso";
    session.step = "moneda";
    pendingRecurrenceSessions.set(ctx.chat.id, session);
    await ctx.reply("💱 ¿En qué moneda?", {
      reply_markup: new InlineKeyboard()
        .text("🇦🇷 ARS", "rec_moneda:ARS").text("🇺🇸 USD", "rec_moneda:USD").row()
        .text("← Atrás", "rec_back:tipo"),
    });
  });

  bot.callbackQuery(/^rec_moneda:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session || session.step !== "moneda") return replyExpiredSession(ctx, "rec_start", "🔄 Empezar de nuevo");
    session.moneda = ctx.match[1] as "ARS" | "USD";
    session.step = "frecuencia";
    pendingRecurrenceSessions.set(ctx.chat.id, session);
    await ctx.reply("📅 ¿Con qué frecuencia?", {
      reply_markup: new InlineKeyboard()
        .text("📆 Diario", "rec_frec:diario").text("📆 Semanal", "rec_frec:semanal").row()
        .text("📆 Quincenal", "rec_frec:quincenal").text("📆 Mensual", "rec_frec:mensual").text("📆 Anual", "rec_frec:anual").row()
        .text("← Atrás", "rec_back:moneda"),
    });
  });

  bot.callbackQuery(/^rec_frec:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session || session.step !== "frecuencia") return replyExpiredSession(ctx, "rec_start", "🔄 Empezar de nuevo");
    session.frecuencia = ctx.match[1] as "diario" | "semanal" | "quincenal" | "mensual" | "anual";
    session.step = "descripcion";
    pendingRecurrenceSessions.set(ctx.chat.id, session);
    await ctx.reply("📝 Por último, mandame una *descripción* corta (ej: `Alquiler`, `Netflix`):", { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^rec_back:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session) return replyExpiredSession(ctx, "rec_start", "🔄 Empezar de nuevo");
    const target = ctx.match[1];
    if (target === "tipo") {
      session.step = "tipo";
      pendingRecurrenceSessions.set(ctx.chat.id, session);
      await ctx.reply("↕️ ¿Es un ingreso o un gasto?", {
        reply_markup: new InlineKeyboard()
          .text("💚 Ingreso", "rec_tipo:ingreso").text("🔴 Gasto", "rec_tipo:egreso"),
      });
    } else if (target === "moneda") {
      session.step = "moneda";
      pendingRecurrenceSessions.set(ctx.chat.id, session);
      await ctx.reply("💱 ¿En qué moneda?", {
        reply_markup: new InlineKeyboard()
          .text("🇦🇷 ARS", "rec_moneda:ARS").text("🇺🇸 USD", "rec_moneda:USD").row()
          .text("← Atrás", "rec_back:tipo"),
      });
    }
  });
}
