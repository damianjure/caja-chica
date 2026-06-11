import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, replyExpiredSession, sendTyping, splitForTelegram } from "../utils.ts";
import { pendingRecurrenceSessions, getRecurrenceSession } from "../sessions.ts";
import { assertBotWritable } from "../maintenance-gate.ts";
import { applyTelegramDataScope, type TelegramLinkRecord } from "../../server/telegramAccess.ts";
import type { RecurrenteSlots } from "../intentSlots.ts";
import { listRecurrentesWithNextRun, createRecurrente, toggleRecurrente } from "../../flows/recurring.ts";
import {
  buildRecurrentesListText,
  buildRecurrenteActionKeyboard,
  canToggleRecurrente,
  RECURRENTE_PAUSE_PREFIX,
  RECURRENTE_ON_PREFIX,
} from "../recurrentesMgmt.ts";

/** Start the guided "new recurrente" flow. Shared by /recurrente, the rec_start button, and the voice intent router. */
export async function startRecurringFlow(supabase: BotDeps["supabase"], ctx: Context) {
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

/** List all recurrentes with pause/reactivate actions. Shared by /recurrentes and the voice intent router. */
export async function handleListRecurrentes(supabase: BotDeps["supabase"], ctx: Context) {
  const linked = await requireTelegramCan(supabase, ctx, "read");
  if (!linked) return;

  sendTyping(ctx);

  let recs;
  try {
    recs = await listRecurrentesWithNextRun(supabase, (q) => applyTelegramDataScope(q, linked));
  } catch (error) {
    console.error("[/recurrentes] fetch error:", error);
    await ctx.reply("❌ No pude cargar los recurrentes. Intentá de nuevo.");
    return;
  }

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

/**
 * Insert a recurrente directly from slots understood by the voice/text intent router.
 * Returns false if any required slot is missing or the insert fails.
 * The caller is responsible for the write-permission + maintenance gates.
 */
export async function createRecurrenteFromBot(
  supabase: BotDeps["supabase"],
  ctx: Context,
  linked: TelegramLinkRecord,
  s: RecurrenteSlots,
): Promise<boolean> {
  if (s.monto === null || s.tipo === null || s.frecuencia === null || !s.descripcion) return false;
  return createRecurrente(supabase, {
    ownership: linked.dashboardId && linked.userId
      ? { dashboard_id: linked.dashboardId, created_by_user_id: linked.userId }
      : { owner_user_id: linked.ownerUserId },
    monto: s.monto,
    tipo: s.tipo,
    moneda: s.moneda,
    frecuencia: s.frecuencia,
    descripcion: s.descripcion,
    categoria: s.categoria,
    dayOfMonth: s.dia ?? null,
    notifyChatId: ctx.chat?.id ?? null,
  });
}

export function registerRecurringHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  bot.command("recurrente", (ctx) => startRecurringFlow(supabase, ctx));
  bot.callbackQuery("rec_start", async (ctx) => {
    ctx.answerCallbackQuery();
    await startRecurringFlow(supabase, ctx);
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

  bot.command("recurrentes", (ctx) => handleListRecurrentes(supabase, ctx));

  // ---------------------------------------------------------------------------
  // rec_pause:<id> — pause an active recurrente
  // ---------------------------------------------------------------------------

  bot.callbackQuery(new RegExp(`^${RECURRENTE_PAUSE_PREFIX}(.+)$`), async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;

    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;

    const recId = ctx.match[1];

    const result = await toggleRecurrente(
      supabase,
      (q) => applyTelegramDataScope(q, linked),
      recId,
      false,
      (rec) => canToggleRecurrente(rec, linked),
    );
    if (result.status === "fetch_error") return void await ctx.reply("❌ Error al buscar el recurrente.");
    if (result.status === "not_found") return void await ctx.reply("❌ No encontré ese recurrente o no tenés permiso.");
    if (result.status === "update_error") return void await ctx.reply("❌ No pude pausar el recurrente.");

    await ctx.editMessageReplyMarkup({
      reply_markup: { inline_keyboard: buildRecurrenteActionKeyboard({ id: recId, is_active: false }).inline_keyboard },
    }).catch(() => {});

    if (result.status === "already") return void await ctx.reply("ℹ️ Ese recurrente ya estaba pausado.");

    const label = result.rec.descripcion ?? `${result.rec.monto} ${result.rec.moneda}`;
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

    const result = await toggleRecurrente(
      supabase,
      (q) => applyTelegramDataScope(q, linked),
      recId,
      true,
      (rec) => canToggleRecurrente(rec, linked),
    );
    if (result.status === "fetch_error") return void await ctx.reply("❌ Error al buscar el recurrente.");
    if (result.status === "not_found") return void await ctx.reply("❌ No encontré ese recurrente o no tenés permiso.");
    if (result.status === "update_error") return void await ctx.reply("❌ No pude reactivar el recurrente.");

    await ctx.editMessageReplyMarkup({
      reply_markup: { inline_keyboard: buildRecurrenteActionKeyboard({ id: recId, is_active: true }).inline_keyboard },
    }).catch(() => {});

    if (result.status === "already") return void await ctx.reply("ℹ️ Ese recurrente ya estaba activo.");

    const label = result.rec.descripcion ?? `${result.rec.monto} ${result.rec.moneda}`;
    await ctx.reply(`▶️ *${label.replace(/[_*`\[]/g, "\\$&")}* reactivado.`, { parse_mode: "Markdown" });
  });
}
