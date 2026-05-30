import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, replyExpiredSession, sendTyping, splitForTelegram } from "../utils.ts";
import { pendingRecurrenceSessions, getRecurrenceSession } from "../sessions.ts";
import { assertBotWritable } from "../maintenance-gate.ts";
import { applyTelegramDataScope } from "../../server/telegramAccess.ts";
import { computeNextRun, relativeRunLabel } from "../../server/recurrentes.ts";
import type { Frecuencia } from "../../server/recurrentes.ts";
import {
  buildRecurrentesListText,
  buildRecurrenteActionKeyboard,
  canToggleRecurrente,
  RECURRENTE_PAUSE_PREFIX,
  RECURRENTE_ON_PREFIX,
} from "../recurrentesMgmt.ts";

export function registerRecurringHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  async function startRecurringFlow(ctx: Context) {
    if (!await assertBotWritable(ctx)) return;
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

  // ---------------------------------------------------------------------------
  // /recurrentes — list all recurrentes with pause/reactivate actions
  // ---------------------------------------------------------------------------

  async function handleListRecurrentes(ctx: Context) {
    const linked = await requireTelegramCan(supabase, ctx, "read");
    if (!linked) return;

    sendTyping(ctx);

    const query = applyTelegramDataScope(
      supabase.from("recurrentes").select("*"),
      linked,
    ).is("deleted_at", null).order("created_at", { ascending: true });

    const { data, error } = await query;
    if (error) {
      console.error("[/recurrentes] fetch error:", error);
      await ctx.reply("❌ No pude cargar los recurrentes. Intentá de nuevo.");
      return;
    }

    const now = new Date();
    const recs = (data ?? []).map((r: any) => {
      const lastProcessed = r.last_processed ? new Date(r.last_processed) : null;
      const dayOfMonth = typeof r.day_of_month === "number" ? r.day_of_month : null;
      const nextRun = computeNextRun(r.frecuencia as Frecuencia, lastProcessed, dayOfMonth, now);
      return {
        ...r,
        next_run_at: nextRun ? nextRun.toISOString() : null,
        next_run_label: relativeRunLabel(nextRun, now),
      };
    });

    const listText = buildRecurrentesListText(recs);

    // If list is empty, send single message without keyboards
    if (recs.length === 0) {
      await ctx.reply(listText);
      return;
    }

    // Send list header (chunked if needed)
    const chunks = splitForTelegram(listText);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }

    // Send one message per recurrente with its action keyboard
    for (const rec of recs) {
      const kb = buildRecurrenteActionKeyboard({ id: rec.id, is_active: rec.is_active });
      const label = rec.descripcion ?? `${rec.monto} ${rec.moneda}`;
      await ctx.reply(`📌 *${label.replace(/[_*`\[]/g, "\\$&")}*`, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: kb.inline_keyboard },
      });
    }
  }

  bot.command("recurrentes", (ctx) => handleListRecurrentes(ctx));

  // ---------------------------------------------------------------------------
  // rec_pause:<id> — pause an active recurrente
  // ---------------------------------------------------------------------------

  bot.callbackQuery(new RegExp(`^${RECURRENTE_PAUSE_PREFIX}(.+)$`), async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;

    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;

    const recId = ctx.match[1];

    // Fetch the record first — scope-guarded on the SELECT too
    const { data: rows, error: fetchErr } = await applyTelegramDataScope(
      supabase.from("recurrentes").select("id, dashboard_id, owner_user_id, deleted_at, is_active, descripcion, monto, moneda").eq("id", recId),
      linked,
    );
    if (fetchErr) {
      console.error("[rec_pause] fetch error:", fetchErr);
      await ctx.reply("❌ Error al buscar el recurrente.");
      return;
    }

    const rec = rows?.[0];
    if (!rec || !canToggleRecurrente(rec, linked)) {
      await ctx.reply("❌ No encontré ese recurrente o no tenés permiso.");
      return;
    }

    if (!rec.is_active) {
      await ctx.editMessageReplyMarkup({
        reply_markup: { inline_keyboard: buildRecurrenteActionKeyboard({ id: recId, is_active: false }).inline_keyboard },
      }).catch(() => {});
      await ctx.reply("ℹ️ Ese recurrente ya estaba pausado.");
      return;
    }

    // UPDATE scoped — only updates within caller's scope (defense-in-depth)
    const { error: updateErr } = await applyTelegramDataScope(
      supabase.from("recurrentes").update({ is_active: false }).eq("id", recId),
      linked,
    );
    if (updateErr) {
      console.error("[rec_pause] update error:", updateErr);
      await ctx.reply("❌ No pude pausar el recurrente.");
      return;
    }

    await ctx.editMessageReplyMarkup({
      reply_markup: { inline_keyboard: buildRecurrenteActionKeyboard({ id: recId, is_active: false }).inline_keyboard },
    }).catch(() => {});

    const label = rec.descripcion ?? `${rec.monto} ${rec.moneda}`;
    await ctx.reply(`⏸ *${label.replace(/[_*`\[]/g, "\\$&")}* pausado.`, { parse_mode: "Markdown" });
  });

  // ---------------------------------------------------------------------------
  // rec_on:<id> — reactivate a paused recurrente
  // ---------------------------------------------------------------------------

  bot.callbackQuery(new RegExp(`^${RECURRENTE_ON_PREFIX}(.+)$`), async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;

    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;

    const recId = ctx.match[1];

    const { data: rows, error: fetchErr } = await applyTelegramDataScope(
      supabase.from("recurrentes").select("id, dashboard_id, owner_user_id, deleted_at, is_active, descripcion, monto, moneda").eq("id", recId),
      linked,
    );
    if (fetchErr) {
      console.error("[rec_on] fetch error:", fetchErr);
      await ctx.reply("❌ Error al buscar el recurrente.");
      return;
    }

    const rec = rows?.[0];
    if (!rec || !canToggleRecurrente(rec, linked)) {
      await ctx.reply("❌ No encontré ese recurrente o no tenés permiso.");
      return;
    }

    if (rec.is_active) {
      await ctx.editMessageReplyMarkup({
        reply_markup: { inline_keyboard: buildRecurrenteActionKeyboard({ id: recId, is_active: true }).inline_keyboard },
      }).catch(() => {});
      await ctx.reply("ℹ️ Ese recurrente ya estaba activo.");
      return;
    }

    const { error: updateErr } = await applyTelegramDataScope(
      supabase.from("recurrentes").update({ is_active: true }).eq("id", recId),
      linked,
    );
    if (updateErr) {
      console.error("[rec_on] update error:", updateErr);
      await ctx.reply("❌ No pude reactivar el recurrente.");
      return;
    }

    await ctx.editMessageReplyMarkup({
      reply_markup: { inline_keyboard: buildRecurrenteActionKeyboard({ id: recId, is_active: true }).inline_keyboard },
    }).catch(() => {});

    const label = rec.descripcion ?? `${rec.monto} ${rec.moneda}`;
    await ctx.reply(`▶️ *${label.replace(/[_*`\[]/g, "\\$&")}* reactivado.`, { parse_mode: "Markdown" });
  });
}
