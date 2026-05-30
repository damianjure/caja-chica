import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, requireLinkedAccount, escapeMd, formatMovementSummary, insertBotAuditLog, splitForTelegram, sendTyping } from "../utils.ts";
import { assertBotWritable } from "../maintenance-gate.ts";
import { setInputSession } from "../sessions.ts";
import { applyTelegramDataScope } from "../../server/telegramAccess.ts";
import { resolveTelegramCompany, getTopEmpresasForDashboard } from "../../server/telegramCompanyResolution.ts";
import { resolveTelegramCategory, getTopCategoriasForDashboard } from "../../server/telegramCategoryResolution.ts";
import {
  createPendingExtraction,
  getPendingExtractionByChat,
  updatePendingExtraction,
  buildReviewCardText,
  buildReviewKeyboard,
} from "../../server/extractionReview.ts";
import type { PendingExtractionData } from "../../server/validation.ts";
import { transcribeTelegramAudioWithGemini } from "../../server/telegramAudio.ts";
import { GeminiUnavailableError } from "../../server/geminiWithFallback.ts";
import { getRecurrenceSession, pendingRecurrenceSessions } from "../sessions.ts";
import {
  type PendingMovementPayload,
  persistTelegramMovement,
  runMovementSearch,
  processTelegramFinancialText,
  getLastMovementByType,
  getPendingTelegramMovement,
  resolvePendingTelegramMovement,
  getSaldosText,
  buildPendingCompanyKeyboardLocal,
} from "./movements.ts";
import { canUndoMovement, computeQuickBalance } from "../quickActions.ts";

export function registerMovementCallbacks(bot: Bot, deps: BotDeps) {
  const { supabase, genAI, genAI2 = null, botToken } = deps;

  bot.callbackQuery("del_last", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🗑️ ¿Qué último movimiento querés borrar?", {
      reply_markup: new InlineKeyboard()
        .text("💚 Ingreso", "del_last:ingreso").text("🔴 Gasto", "del_last:egreso"),
    });
  });

  bot.callbackQuery(/^del_last:(ingreso|egreso)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const tipo = ctx.match[1] as "ingreso" | "egreso";
    const last = await getLastMovementByType(supabase, linked, tipo);
    if (!last) {
      await ctx.reply(`No hay ${tipo}s para borrar.`);
      return;
    }
    await ctx.reply(
      `🗑️ *¿Borrar este ${tipo}?*\n\n${formatMovementSummary(last)}\n\n⚠️ No se puede deshacer.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_mov_${last.id}`)
          .text("❌ Cancelar", `cancel_delete_mov_${last.id}`),
      },
    );
  });

  bot.callbackQuery("edit_last", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("✏️ ¿Qué último movimiento querés editar?", {
      reply_markup: new InlineKeyboard()
        .text("💚 Ingreso", "edit_last:ingreso").text("🔴 Gasto", "edit_last:egreso"),
    });
  });

  bot.callbackQuery(/^edit_last:(ingreso|egreso)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const tipo = ctx.match[1] as "ingreso" | "egreso";
    const last = await getLastMovementByType(supabase, linked, tipo);
    if (!last) {
      await ctx.reply(`No hay ${tipo}s para editar.`);
      return;
    }
    const data: PendingExtractionData = {
      monto: typeof last.monto === "number" ? last.monto : Number(last.monto) || 0,
      moneda: last.moneda === "USD" ? "USD" : "ARS",
      tipo,
      empresa: last.empresa_nombre ?? null,
      cuit: null,
      categoria: last.categoria ?? "Otros",
      descripcion: last.descripcion ?? "",
      fecha: null,
      confidence: 1,
      sourceType: "photo",
    };
    const entry = createPendingExtraction({
      chatId: ctx.chat.id,
      dashboardId: linked.dashboardId ?? null,
      userId: linked.userId ?? null,
      ownerUserId: linked.ownerUserId ?? null,
      data,
      messageId: 0,
      editMovementId: last.id,
    });
    await ctx.reply(buildReviewCardText(data), {
      parse_mode: "Markdown",
      reply_markup: buildReviewKeyboard(entry.id),
    });
  });

  bot.callbackQuery("saldos", async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const text = await getSaldosText(supabase, linked);
    if (text === null) return ctx.reply("❌ No pude calcular los saldos. Intentá de nuevo.");
    for (const chunk of splitForTelegram(text)) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  });

  // Quick balance — today
  bot.callbackQuery("qs:hoy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await applyTelegramDataScope(
      supabase.from("movimientos").select("tipo, monto, moneda, created_at, deleted_at").is("deleted_at", null),
      linked,
    ).gte("created_at", `${today}T00:00:00.000Z`).lte("created_at", `${today}T23:59:59.999Z`);
    if (error) return ctx.reply("❌ No pude calcular el saldo. Intentá de nuevo.");
    const { netARS, netUSD } = computeQuickBalance(data ?? []);
    const sign = (n: number) => n >= 0 ? "🟢" : "🔴";
    await ctx.reply(
      `💰 *Saldo de hoy (${today})*\n\n${sign(netARS)} ARS: $${netARS.toLocaleString("es-AR")}\n${sign(netUSD)} USD: u$s${netUSD.toLocaleString("es-AR")}`,
      { parse_mode: "Markdown" },
    );
  });

  // Quick balance — last 7 days
  bot.callbackQuery("qs:sem", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setUTCDate(now.getUTCDate() - 6);
    const fromDate = weekAgo.toISOString().slice(0, 10);
    const toDate = now.toISOString().slice(0, 10);
    const { data, error } = await applyTelegramDataScope(
      supabase.from("movimientos").select("tipo, monto, moneda, created_at, deleted_at").is("deleted_at", null),
      linked,
    ).gte("created_at", `${fromDate}T00:00:00.000Z`).lte("created_at", `${toDate}T23:59:59.999Z`);
    if (error) return ctx.reply("❌ No pude calcular el saldo. Intentá de nuevo.");
    const { netARS, netUSD } = computeQuickBalance(data ?? []);
    const sign = (n: number) => n >= 0 ? "🟢" : "🔴";
    await ctx.reply(
      `📅 *Saldo últimos 7 días* (${fromDate} → ${toDate})\n\n${sign(netARS)} ARS: $${netARS.toLocaleString("es-AR")}\n${sign(netUSD)} USD: u$s${netUSD.toLocaleString("es-AR")}`,
      { parse_mode: "Markdown" },
    );
  });

  // Undo — soft-delete the movement whose id is encoded in callback_data
  bot.callbackQuery(/^undo:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Deshaciendo...");
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "delete_own_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];

    // Fetch to verify scope
    const { data: rows, error: fetchErr } = await applyTelegramDataScope(
      supabase.from("movimientos").select("id, dashboard_id, owner_user_id, deleted_at, tipo, monto, moneda, descripcion, empresa_nombre, categoria").is("deleted_at", null),
      linked,
    ).eq("id", movId).limit(1);

    if (fetchErr || !rows?.[0]) {
      await ctx.editMessageText("❌ El movimiento ya fue borrado o no existe.");
      return;
    }
    const mov = rows[0];
    if (!canUndoMovement(mov, linked)) {
      await ctx.editMessageText("🚫 Sin permiso para deshacer este movimiento.");
      return;
    }

    let delQuery = supabase.from("movimientos").update({
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: linked.userId,
    }).eq("id", movId);
    if (linked.dashboardId) delQuery = delQuery.eq("dashboard_id", linked.dashboardId);
    else delQuery = delQuery.eq("owner_user_id", linked.ownerUserId as string);

    const { error: delErr } = await delQuery;
    if (delErr) {
      console.error("undo soft-delete error:", delErr);
      await ctx.editMessageText("❌ No pude deshacer. Intentá de nuevo.");
      return;
    }

    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "delete",
      entityType: "movimiento",
      entityId: movId,
      beforeData: mov,
    });

    await ctx.editMessageText(`↩️ *Deshecho:* ${escapeMd(mov.descripcion ?? "")}\n💰 ${mov.monto} ${mov.moneda}`, { parse_mode: "Markdown", reply_markup: { inline_keyboard: [] } });
  });

  bot.callbackQuery("buscar_mode", async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    setInputSession(ctx.chat.id, "buscar", linked);
    await ctx.reply("🔍 Escribí qué querés buscar:");
  });

  bot.callbackQuery("borrar_last", async (ctx) => {
    ctx.answerCallbackQuery("Usá los botones nuevos");
    ctx.reply("Usá `/borrar_ultimo_ingreso` o `/borrar_ultimo_egreso`.", { parse_mode: "Markdown" });
  });

  bot.callbackQuery("borrar_last_egreso", async (ctx) => {
    ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "delete_own_movimiento");
    if (!linked) return;
    const last = await getLastMovementByType(supabase, linked, "egreso");
    if (!last) return ctx.reply("No hay gastos para borrar.");
    await ctx.reply(
      `Vas a borrar este último gasto:\n\n${formatMovementSummary(last)}`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_mov_${last.id}`)
          .text("❌ Cancelar", `cancel_delete_mov_${last.id}`),
      },
    );
  });

  bot.callbackQuery(/^set_cat_([\w-]+)_(.+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];
    const category = ctx.match[2];
    const { data: targetRows } = await applyTelegramDataScope(
      supabase.from("movimientos").select("id"),
      linked,
    ).eq("id", movId).limit(1);
    if (!targetRows?.[0]) return ctx.answerCallbackQuery("Movimiento no encontrado.");
    await supabase.from("movimientos").update({ categoria: category }).eq("id", movId);
    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "update",
      entityType: "movimiento",
      entityId: movId,
      beforeData: { id: movId },
      afterData: { id: movId, categoria: category },
    });
    ctx.answerCallbackQuery(`Categoría actualizada: ${category}`);
    ctx.editMessageText(`✅ Categoría actualizada a *${category}*`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^change_cat_([\w-]+)$/, async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];
    const { data: targetRows } = await applyTelegramDataScope(
      supabase.from("movimientos").select("id"),
      linked,
    ).eq("id", movId).limit(1);
    if (!targetRows?.[0]) return ctx.answerCallbackQuery("Movimiento no encontrado.");
    const { data: cats } = await applyTelegramDataScope(
      supabase.from("categorias").select("nombre"),
      linked,
    );
    const kb = new InlineKeyboard();
    cats?.forEach((c, i) => {
      kb.text(c.nombre, `set_cat_${movId}_${c.nombre}`);
      if ((i + 1) % 3 === 0) kb.row();
    });
    ctx.editMessageText("Seleccioná la categoría correcta:", { reply_markup: kb });
  });

  bot.callbackQuery(/^confirm_delete_mov_(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery("Borrando...");
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "delete_own_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];
    const { data: rows } = await applyTelegramDataScope(
      supabase.from("movimientos").select("*").is("deleted_at", null),
      linked,
    ).eq("id", movId).limit(1);
    const movement = rows?.[0];
    if (!movement) return ctx.reply("Movimiento no encontrado.");
    let delQuery = supabase.from("movimientos").update({
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: linked.userId,
    }).eq("id", movId);
    if (linked.dashboardId) delQuery = delQuery.eq("dashboard_id", linked.dashboardId);
    else delQuery = delQuery.eq("owner_user_id", linked.ownerUserId as string);
    await delQuery;
    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "delete",
      entityType: "movimiento",
      entityId: movId,
      beforeData: movement,
    });
    await ctx.editMessageText(`🗑️ Eliminado.\n\n${formatMovementSummary(movement)}`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^cancel_delete_mov_(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("Operación cancelada.");
  });

  bot.callbackQuery(/^tcp:([\w-]+):(y|o|p)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const pendingId = ctx.match[1];
    const action = ctx.match[2];
    const pending = await getPendingTelegramMovement(supabase, pendingId, ctx.chat.id);
    if (!pending) {
      await ctx.answerCallbackQuery("Esta asignación ya venció o fue resuelta.");
      return;
    }

    const payload = pending.payload;
    if (action === "o") {
      await ctx.answerCallbackQuery("Elegí la empresa correcta");
      await ctx.editMessageText(
        `🏢 ¿A qué empresa cargamos *${payload.item.descripcion}*?`,
        {
          parse_mode: "Markdown",
          reply_markup: buildPendingCompanyKeyboardLocal(pendingId, payload.options),
        },
      );
      return;
    }

    const selectedCompany =
      action === "p"
        ? "Personal"
        : payload.suggestedOptionIndex !== null
          ? payload.options[payload.suggestedOptionIndex]?.nombre ?? "Personal"
          : "Personal";

    const { finalCategory, empresaNombre } = await persistTelegramMovement(supabase, {
      linked,
      item: { ...payload.item, empresa: selectedCompany },
      originalText: payload.originalText,
    });
    await resolvePendingTelegramMovement(supabase, pendingId);
    await ctx.answerCallbackQuery("Movimiento guardado");
    await ctx.editMessageText(
      `✅ *Registrado:* ${payload.item.descripcion}\n💰 ${payload.item.monto} ${payload.item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${empresaNombre}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery(/^tca:([\w-]+):(p|\d+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const pendingId = ctx.match[1];
    const rawSelection = ctx.match[2];
    const pending = await getPendingTelegramMovement(supabase, pendingId, ctx.chat.id);
    if (!pending) {
      await ctx.answerCallbackQuery("Esta asignación ya venció o fue resuelta.");
      return;
    }

    const payload = pending.payload;
    const selectedCompany =
      rawSelection === "p"
        ? "Personal"
        : payload.options[Number(rawSelection)]?.nombre;

    if (!selectedCompany) {
      await ctx.answerCallbackQuery("No encontré esa empresa.");
      return;
    }

    const { finalCategory, empresaNombre } = await persistTelegramMovement(supabase, {
      linked,
      item: { ...payload.item, empresa: selectedCompany },
      originalText: payload.originalText,
    });
    await resolvePendingTelegramMovement(supabase, pendingId);
    await ctx.answerCallbackQuery("Movimiento guardado");
    await ctx.editMessageText(
      `✅ *Registrado:* ${payload.item.descripcion}\n💰 ${payload.item.monto} ${payload.item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${empresaNombre}`,
      { parse_mode: "Markdown" },
    );
  });

  // Text message handler (main input + guided flows)
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const { getInputSession, pendingInputSessions } = await import("../sessions.ts");
    const inputSession = getInputSession(ctx.chat.id);
    if (inputSession) {
      pendingInputSessions.delete(ctx.chat.id);
      const value = text.trim();
      if (!value) {
        await ctx.reply("Texto vacío. Probá de nuevo desde el botón.");
        return;
      }
      if (inputSession.kind === "empresa") {
        if (!await assertBotWritable(ctx)) return;
        const { createEmpresaFromBot } = await import("./entities.ts");
        const result = await createEmpresaFromBot(supabase, inputSession.linked, value);
        await ctx.reply(result.ok ? `✅ Empresa *${escapeMd(value)}* agregada.` : "❌ No se pudo agregar la empresa. Intentá de nuevo.", { parse_mode: "Markdown" });
      } else if (inputSession.kind === "categoria") {
        if (!await assertBotWritable(ctx)) return;
        const { createCategoriaFromBot } = await import("./entities.ts");
        const result = await createCategoriaFromBot(supabase, inputSession.linked, value);
        await ctx.reply(result.ok ? `✅ Categoría *${escapeMd(value)}* agregada.` : "❌ No se pudo agregar la categoría. Intentá de nuevo.", { parse_mode: "Markdown" });
      } else {
        await runMovementSearch(supabase, ctx, inputSession.linked, value);
      }
      return;
    }

    // Handle pending extraction field edits
    const editingEntry = getPendingExtractionByChat(ctx.chat.id);
    if (editingEntry && editingEntry.editingField) {
      const field = editingEntry.editingField;
      const val = text.trim();
      const patch: Partial<PendingExtractionData> = {};

      if (field === "monto") {
        const n = parseFloat(val.replace(",", "."));
        if (!isNaN(n) && n > 0) patch.monto = n;
        else { await ctx.reply("❌ Monto inválido. Mandame un número positivo:"); return; }
      } else if (field === "empresa") {
        if (val.toLowerCase() === "ninguna" || val === "") {
          patch.empresa = null;
        } else if (editingEntry.awaitingCompany) {
          const scope = { dashboardId: editingEntry.dashboardId, ownerUserId: editingEntry.ownerUserId };
          const allEmpresas = await getTopEmpresasForDashboard(supabase, scope, 50);
          const resolution = resolveTelegramCompany({ empresa: val }, allEmpresas);
          if (resolution.kind === "exact") {
            patch.empresa = resolution.company.nombre;
          } else if (resolution.kind === "suggest") {
            updatePendingExtraction(editingEntry.id, { editingField: null, pendingNewCompanyName: val, pendingSuggestNombre: resolution.company.nombre });
            await ctx.reply(
              `🤔 ¿Quisiste decir *${resolution.company.nombre}*?`,
              {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [
                  [
                    { text: `✅ Usar ${resolution.company.nombre}`, callback_data: `er:co:${editingEntry.id}:confirm` },
                    { text: "❌ Sin empresa", callback_data: `er:co:${editingEntry.id}:none` },
                  ],
                  [{ text: `➕ Crear "${val}"`, callback_data: `er:co:${editingEntry.id}:create` }],
                ]},
              },
            );
            return;
          } else {
            updatePendingExtraction(editingEntry.id, { editingField: null, pendingNewCompanyName: val });
            await ctx.reply(
              `🆕 No encontré una empresa con ese nombre.\n¿Qué hacemos con *${val}*?`,
              {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [
                  [
                    { text: `➕ Crear "${val}"`, callback_data: `er:co:${editingEntry.id}:create` },
                    { text: "❌ Sin empresa", callback_data: `er:co:${editingEntry.id}:none` },
                  ],
                ]},
              },
            );
            return;
          }
        } else {
          patch.empresa = val;
        }
      } else if (field === "categoria") {
        if (editingEntry.awaitingCategoria) {
          const scope = { dashboardId: editingEntry.dashboardId, ownerUserId: editingEntry.ownerUserId };
          const allCategorias = await getTopCategoriasForDashboard(supabase, scope, 50);
          const resolution = resolveTelegramCategory({ categoria: val }, allCategorias);
          if (resolution.kind === "exact") {
            patch.categoria = resolution.category.nombre;
          } else if (resolution.kind === "suggest") {
            updatePendingExtraction(editingEntry.id, { editingField: null, pendingNewCategoriaName: val, pendingSuggestCategoria: resolution.category.nombre });
            await ctx.reply(
              `🤔 ¿Quisiste decir *${escapeMd(resolution.category.nombre)}*?`,
              {
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: [
                  [
                    { text: `✅ Usar ${resolution.category.nombre}`, callback_data: `er:ca:${editingEntry.id}:confirm` },
                    { text: "❌ Sin cambio", callback_data: `er:ca:${editingEntry.id}:none` },
                  ],
                  [{ text: `➕ Crear "${val}"`, callback_data: `er:ca:${editingEntry.id}:create` }],
                ]},
              },
            );
            return;
          } else if (resolution.kind === "unresolved") {
            updatePendingExtraction(editingEntry.id, { editingField: null, pendingNewCategoriaName: val });
            await ctx.reply(
              `🆕 No encontré una categoría con ese nombre\\.\n¿Qué hacemos con *${escapeMd(val)}*?`,
              {
                parse_mode: "MarkdownV2",
                reply_markup: { inline_keyboard: [
                  [
                    { text: `➕ Crear "${val}"`, callback_data: `er:ca:${editingEntry.id}:create` },
                    { text: "❌ Sin cambio", callback_data: `er:ca:${editingEntry.id}:none` },
                  ],
                ]},
              },
            );
            return;
          } else {
            // missing — prompt again
            await ctx.reply("❌ Escribí el nombre de la categoría:");
            return;
          }
        } else {
          patch.categoria = val;
        }
      } else if (field === "descripcion") {
        patch.descripcion = val;
      } else if (field === "tipo") {
        if (val !== "ingreso" && val !== "egreso") { await ctx.reply("❌ Mandame `ingreso` o `egreso`."); return; }
        patch.tipo = val;
      } else if (field === "moneda") {
        if (val !== "ARS" && val !== "USD") { await ctx.reply("❌ Mandame `ARS` o `USD`."); return; }
        patch.moneda = val;
      }

      const updated = updatePendingExtraction(editingEntry.id, { data: patch as PendingExtractionData, editingField: null });
      if (!updated) { await ctx.reply("❌ La sesión de edición venció. Mandá la foto de nuevo."); return; }
      const reviewText = buildReviewCardText(updated.data);
      await ctx.reply(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(updated.id) });
      return;
    }

    // Handle pending recurrente text inputs (monto + descripcion)
    const recSession = getRecurrenceSession(ctx.chat.id);
    if (recSession) {
      if (recSession.step === "monto") {
        const monto = parseFloat(text.trim().replace(",", "."));
        if (isNaN(monto) || monto <= 0) {
          return ctx.reply("❌ Monto inválido. Mandame un número positivo (ej: `1500` o `50.50`):", { parse_mode: "Markdown" });
        }
        recSession.monto = monto;
        recSession.step = "tipo";
        pendingRecurrenceSessions.set(ctx.chat.id, recSession);
        return ctx.reply("↕️ ¿Es un ingreso o un gasto?", {
          reply_markup: new InlineKeyboard()
            .text("💚 Ingreso", "rec_tipo:ingreso").text("🔴 Gasto", "rec_tipo:egreso"),
        });
      }
      if (recSession.step === "descripcion") {
        const descripcion = text.trim();
        if (!descripcion) {
          return ctx.reply("❌ La descripción no puede estar vacía. Mandame una descripción corta:");
        }
        if (!await assertBotWritable(ctx)) return;
        pendingRecurrenceSessions.delete(ctx.chat.id);
        const linked = recSession.linked;
        const { error } = await supabase.from("recurrentes").insert([{
          ...(linked.dashboardId && linked.userId
            ? { dashboard_id: linked.dashboardId, created_by_user_id: linked.userId }
            : { owner_user_id: linked.ownerUserId }),
          monto: recSession.monto!,
          tipo: recSession.tipo!,
          moneda: recSession.moneda!,
          frecuencia: recSession.frecuencia!,
          descripcion,
          categoria: recSession.tipo === "ingreso" ? "Ingresos" : "Varios",
          empresa_nombre: null,
          chat_id: ctx.chat.id,
          last_processed: null,
        }]);
        if (error) {
          console.error("Error saving recurrente:", error);
          return ctx.reply("❌ No pude guardar el recurrente. Intentá de nuevo.");
        }
        const frecLabel = { diario: "cada día", semanal: "cada semana", mensual: "cada mes" }[recSession.frecuencia!];
        return ctx.reply(
          `✅ *Recurrente guardado*\n\n💰 ${recSession.monto} ${recSession.moneda} (${recSession.tipo})\n📅 ${frecLabel}\n📝 ${descripcion}`,
          { parse_mode: "Markdown" },
        );
      }
    }

    // Handle pending report date inputs
    const { getReportSession, pendingReportSessions } = await import("../sessions.ts");
    const { advanceToAlcance } = await import("../commands/reports.ts");
    const reportSession = getReportSession(ctx.chat.id);
    if (reportSession && (reportSession.step === "date_pick" || reportSession.step === "date_from" || reportSession.step === "date_to")) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const trimmed = text.trim();
      if (!datePattern.test(trimmed)) {
        return ctx.reply("Formato inválido. Mandá la fecha como YYYY-MM-DD (ej: 2026-01-15):");
      }
      if (reportSession.step === "date_pick") {
        reportSession.anchorDate = trimmed;
        reportSession.period = "day";
        await advanceToAlcance(supabase, ctx, reportSession);
        return;
      }
      if (reportSession.step === "date_from") {
        reportSession.from = trimmed;
        reportSession.step = "date_to";
        pendingReportSessions.set(ctx.chat.id, reportSession);
        return ctx.reply("📅 Ahora mandame la *fecha de fin* (YYYY-MM-DD):", { parse_mode: "Markdown" });
      }
      if (reportSession.step === "date_to") {
        if (reportSession.from && trimmed < reportSession.from) {
          return ctx.reply(`❌ La fecha de fin no puede ser anterior a ${reportSession.from}. Mandá la fecha de fin nuevamente:`);
        }
        reportSession.to = trimmed;
        await advanceToAlcance(supabase, ctx, reportSession);
        return;
      }
    }

    if (!await assertBotWritable(ctx)) return;
    sendTyping(ctx);
    const processingMsg = await ctx.reply("⏳ Procesando transacción...");
    try {
      await processTelegramFinancialText(supabase, genAI, genAI2, ctx, {
        text,
        originalText: text,
      });
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
    }
  });

  // Audio handlers
  bot.on("message:voice", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    sendTyping(ctx);
    const processingMsg = await ctx.reply("⏳ Procesando transacción...");
    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener el archivo de audio desde Telegram.");
        return;
      }
      const audioMessage = ctx.message.voice;
      const transcript = await transcribeTelegramAudioWithGemini({
        genAI,
        botToken,
        filePath: file.file_path,
        fileName: `voice-${ctx.message.message_id}`,
        mimeType: audioMessage?.mime_type ?? null,
        kind: "voice",
      });
      await processTelegramFinancialText(supabase, genAI, genAI2, ctx, {
        text: transcript,
        originalText: `[audio] ${transcript}`,
      });
    } catch (error) {
      if (error instanceof GeminiUnavailableError) {
        await ctx.reply("⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)\\. Intentá en unos minutos\\.", { parse_mode: "MarkdownV2" });
      } else {
        console.error("Telegram audio processing error:", error);
        await ctx.reply("❌ No pude procesar ese audio. Probá con un audio más corto o mandamelo como texto.");
      }
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
    }
  });

  bot.on("message:audio", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    sendTyping(ctx);
    const processingMsg = await ctx.reply("⏳ Procesando transacción...");
    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener el archivo de audio desde Telegram.");
        return;
      }
      const audioMessage = ctx.message.audio;
      const transcript = await transcribeTelegramAudioWithGemini({
        genAI,
        botToken,
        filePath: file.file_path,
        fileName: audioMessage?.file_name ?? `audio-${ctx.message.message_id}`,
        mimeType: audioMessage?.mime_type ?? null,
        kind: "audio",
      });
      await processTelegramFinancialText(supabase, genAI, genAI2, ctx, {
        text: transcript,
        originalText: `[audio] ${transcript}`,
      });
    } catch (error) {
      if (error instanceof GeminiUnavailableError) {
        await ctx.reply("⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)\\. Intentá en unos minutos\\.", { parse_mode: "MarkdownV2" });
      } else {
        console.error("Telegram audio processing error:", error);
        await ctx.reply("❌ No pude procesar ese audio. Probá con un audio más corto o mandamelo como texto.");
      }
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
    }
  });
}
