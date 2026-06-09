import type { Bot, Context } from "grammy";
import type { BotDeps } from "./deps.ts";
import { requireTelegramCan, sendTyping, escapeMd } from "./utils.ts";
import { assertBotWritable } from "./maintenance-gate.ts";
import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  canEditMovementViaTelegram,
  type TelegramLinkRecord,
} from "../server/telegramAccess.ts";
import { extractFromMultiplePhotos, extractReceiptWithItems, inferMediaMimeType, SUPPORTED_DOCUMENT_MIME_TYPES } from "../server/telegramMedia.ts";
import type { ReceiptItemsResult } from "../server/gemini.ts";
import {
  createPendingLineItems,
  getPendingLineItems,
  deletePendingLineItems,
  toggleLineItem,
  setAllLineItems,
  selectedLineItems,
  buildLineItemsCardText,
  buildLineItemsKeyboard,
  buildGroupingPromptText,
  buildGroupingKeyboard,
  type PendingLineItems,
} from "../server/lineItemsReview.ts";
import { MediaGroupBuffer } from "../server/mediaGroupBuffer.ts";
import {
  createPendingExtraction,
  getPendingExtraction,
  updatePendingExtraction,
  deletePendingExtraction,
  buildReviewCardText,
  buildReviewKeyboard,
  LOW_CONFIDENCE_THRESHOLD,
  type ExtractionField,
  type PendingExtraction,
} from "../server/extractionReview.ts";
import type { PendingExtractionData } from "../server/validation.ts";
import { getTopEmpresasForDashboard, resolveTelegramCompany } from "../server/telegramCompanyResolution.ts";
import { getTopCategoriasForDashboard } from "../server/telegramCategoryResolution.ts";
import { GeminiUnavailableError } from "../server/geminiWithFallback.ts";
import { buildUndoKeyboard } from "./quickActions.ts";
import { persistTelegramTicket, persistTelegramMovement, recomputeTelegramTicketTotal } from "./commands/movements.ts";

const mediaGroupBuffer = new MediaGroupBuffer<{ filePath: string; mimeType: string; chatCtx: any }>({ debounceMs: 1500 });

// G — single confirmation card. Instead of asking for the empresa in a separate
// step, go straight to the review card with every field editable inline. The
// empresa defaults to the detected one (or "Personal"), so it never blocks; the
// user adjusts it from the same card if needed.
async function showReviewCard(supabase: BotDeps["supabase"], ctx: Context, linked: any, data: PendingExtractionData, processingMsgId: number) {
  try { await ctx.api.deleteMessage(ctx.chat.id, processingMsgId); } catch (e) {}
  const scope = { dashboardId: linked.dashboardId ?? null, ownerUserId: linked.ownerUserId ?? null };
  const [empresas, categorias] = await Promise.all([
    getTopEmpresasForDashboard(supabase, scope),
    getTopCategoriasForDashboard(supabase, scope),
  ]);
  const normalized: PendingExtractionData = {
    ...data,
    empresa: data.empresa && data.empresa.trim() ? data.empresa : "Personal",
  };
  const entry = createPendingExtraction({
    chatId: ctx.chat.id,
    dashboardId: linked.dashboardId ?? null,
    userId: linked.userId ?? null,
    ownerUserId: linked.ownerUserId ?? null,
    data: normalized,
    messageId: 0,
    awaitingCompany: false,
    empresaOptions: empresas.length > 0 ? empresas : null,
    categoriaOptions: categorias.length > 0 ? categorias : null,
  });
  await ctx.reply(buildReviewCardText(normalized), {
    parse_mode: "Markdown",
    reply_markup: buildReviewKeyboard(entry.id, categorias.length > 0 ? categorias : null),
  });
}

// --- Album batch (spec H): one summary + "Guardar todos" instead of asking the
// empresa per ticket. Maps a batchId to its pending-extraction ids (in-memory,
// single-instance invariant). ---
const pendingBatches = new Map<string, string[]>();

function fmtMonto(d: PendingExtraction["data"]): string {
  return d.monto !== null ? `$${d.monto.toLocaleString("es-AR")} ${d.moneda}` : "❓";
}

function buildBatchSummaryText(ids: string[]): string {
  const entries = ids.map((id) => getPendingExtraction(id)).filter((e): e is PendingExtraction => e !== null);
  const total = entries.reduce((acc, e) => acc + Math.abs(e.data.monto ?? 0), 0);
  const lines = entries.map((e, i) => {
    const low = e.data.confidence < LOW_CONFIDENCE_THRESHOLD ? " ⚠️" : "";
    return `${i + 1}. ${fmtMonto(e.data)} · ${escapeMd(e.data.empresa ?? "Personal")} · ${escapeMd(e.data.categoria)}${low}`;
  });
  return (
    `🧾 *Detecté ${entries.length} ticket${entries.length !== 1 ? "s" : ""}* · Total $${total.toLocaleString("es-AR")}\n\n` +
    lines.join("\n") +
    `\n\n_Tocá "Guardar todos" o revisá los marcados con ⚠️._`
  );
}

function buildBatchKeyboard(batchId: string, ids: string[]): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [
    [{ text: "✅ Guardar todos", callback_data: `eb:save:${batchId}` }],
  ];
  const lowButtons: Array<{ text: string; callback_data: string }> = [];
  ids.forEach((id, i) => {
    const e = getPendingExtraction(id);
    if (e && e.data.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowButtons.push({ text: `✏️ Revisar #${i + 1}`, callback_data: `eb:rev:${id}` });
    }
  });
  for (let i = 0; i < lowButtons.length; i += 2) rows.push(lowButtons.slice(i, i + 2));
  rows.push([{ text: "❌ Cancelar", callback_data: `eb:cancel:${batchId}` }]);
  return { inline_keyboard: rows };
}

async function insertExtractionMovement(supabase: BotDeps["supabase"], entry: PendingExtraction): Promise<{ id?: string; error?: unknown }> {
  const d = entry.data;
  const ownership = buildTelegramWriteOwnership({
    userId: entry.userId,
    dashboardId: entry.dashboardId,
    ownerUserId: entry.ownerUserId,
    role: null,
    permissions: {},
    username: null,
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  });
  const { data, error } = await supabase.from("movimientos").insert([{
    ...ownership,
    monto: Math.abs(d.monto ?? 0),
    tipo: d.tipo,
    moneda: d.moneda,
    categoria: d.categoria,
    empresa_nombre: d.empresa,
    descripcion: d.descripcion,
    original_text: `[${d.sourceType}] ${d.descripcion}`,
    conciliado: true,
    conciliado_notas: null,
  }]).select("id");
  if (error) return { error };
  return { id: (data?.[0]?.id as string | undefined) };
}

// Branch after an item-aware extraction: if the receipt has ≥2 line items show
// the interactive selection card; otherwise fall back to the single review card
// (built from the receipt total / first item), keeping the existing UX intact.
function truncateLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildTicketCardText(merchant: string, total: number, moneda: string, lineCount: number): string {
  return (
    `🔴 *Gasto:* ${escapeMd(merchant)}\n` +
    `💰 ${total.toLocaleString("es-AR")} ${moneda}\n` +
    `🧾 ${lineCount} renglón${lineCount !== 1 ? "es" : ""} · 🏢 Personal`
  );
}

function buildTicketCardKeyboard(movId: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: [
      [
        { text: "✏️ Categoría", callback_data: `change_cat_${movId}` },
        { text: "🏢 Empresa", callback_data: `change_emp_${movId}` },
      ],
      [{ text: "🧾 Modificar renglones", callback_data: `modlin:${movId}` }],
      ...buildUndoKeyboard(movId).inline_keyboard,
    ],
  };
}

/**
 * Save-first: the ticket is persisted immediately (parent total + lines), then
 * the confirmation card with Categoría / Empresa / Deshacer / Modificar is
 * shown. Editing happens AFTER saving. No upfront review or item selection.
 */
async function showReceiptReview(
  supabase: BotDeps["supabase"],
  ctx: Context,
  linked: any,
  result: ReceiptItemsResult,
  sourceType: PendingExtractionData["sourceType"],
  processingMsgId: number,
) {
  try { await ctx.api.deleteMessage(ctx.chat.id, processingMsgId); } catch (e) {}

  const payable = result.items.filter((it) => it.monto !== null);
  if (payable.length >= 1) {
    const saved = await persistTelegramTicket(supabase, { linked, meta: result, sourceType });
    if (saved) {
      await ctx.reply(buildTicketCardText(saved.merchant, saved.total, result.moneda, saved.lineCount), {
        parse_mode: "Markdown",
        reply_markup: buildTicketCardKeyboard(saved.movId),
      });
      return;
    }
  }

  // No payable lines (handwritten / total-only): save the total as a single
  // movement. Empresa = Personal; the merchant only flavors the description.
  const merchant = result.empresa?.trim() || null;
  const { created, finalCategory, empresaNombre, icon } = await persistTelegramMovement(supabase, {
    linked,
    item: {
      monto: result.total,
      tipo: "egreso",
      moneda: result.moneda,
      categoria: "Varios",
      empresa: null,
      descripcion: merchant ?? "Gasto registrado desde foto",
    },
    originalText: `[${sourceType}] ${merchant ?? "ticket"}`,
  });
  const movId = created?.id as string | undefined;
  const kb = movId
    ? { inline_keyboard: [
        [
          { text: "✏️ Categoría", callback_data: `change_cat_${movId}` },
          { text: "🏢 Empresa", callback_data: `change_emp_${movId}` },
        ],
        ...buildUndoKeyboard(movId).inline_keyboard,
      ] }
    : undefined;
  await ctx.reply(
    `${icon} *Gasto:* ${escapeMd(merchant ?? "Gasto")}\n💰 ${created?.monto ?? result.total ?? 0} ${result.moneda}\n📁 Categoría: ${escapeMd(finalCategory ?? "")}\n🏢 Empresa: ${escapeMd(empresaNombre ?? "")}`,
    { parse_mode: "Markdown", reply_markup: kb },
  );
}

/** Renders the line editor (delete-per-line; amount edits live in the web dashboard). */
async function renderLineEditor(
  ctx: Context,
  supabase: BotDeps["supabase"],
  linked: any,
  movId: string,
  edit = false,
) {
  const { data: lines } = await applyTelegramDataScope(
    supabase.from("movimiento_lineas").select("id, descripcion, monto").is("deleted_at", null).order("created_at", { ascending: true }),
    linked,
  ).eq("movimiento_id", movId);
  const rows = (lines ?? []) as Array<{ id: string; descripcion: string; monto: number | string }>;

  if (rows.length === 0) {
    const text = "🧾 Sin renglones. Editá el movimiento con los botones de la tarjeta.";
    if (edit) { try { await ctx.editMessageText(text); } catch (e) {} } else { await ctx.reply(text); }
    return;
  }

  const total = rows.reduce((acc, l) => acc + Number(l.monto || 0), 0);
  const text =
    `🧾 *Renglones del ticket* · Total $${total.toLocaleString("es-AR")}\n` +
    `Tocá 🗑️ para borrar un renglón. Para cambiar montos, editalo desde el dashboard web.`;
  const kb = {
    inline_keyboard: [
      ...rows.map((l) => [{ text: `🗑️ ${truncateLabel(l.descripcion, 20)} · $${Number(l.monto).toLocaleString("es-AR")}`, callback_data: `mldel:${l.id}` }]),
      [{ text: "✅ Listo", callback_data: `mldone:${movId}` }],
    ],
  };
  if (edit) { try { await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb }); } catch (e) {} }
  else await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
}

// Insert the selected line items, either as one movement per item ("sep") or a
// single summed movement ("sum"). Merchant metadata applies to every item.
// Items without a readable amount are skipped — they can't be a movement.
async function insertLineItemMovements(
  supabase: BotDeps["supabase"],
  entry: PendingLineItems,
  mode: "sep" | "sum",
): Promise<{ saved: number; total: number; error?: unknown }> {
  const payable = selectedLineItems(entry).filter((it) => it.monto !== null);
  if (payable.length === 0) return { saved: 0, total: 0 };

  const ownership = buildTelegramWriteOwnership({
    userId: entry.userId,
    dashboardId: entry.dashboardId,
    ownerUserId: entry.ownerUserId,
    role: null,
    permissions: {},
    username: null,
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  });
  const total = payable.reduce((acc, it) => acc + Math.abs(it.monto ?? 0), 0);
  const empresa = entry.empresa;

  if (mode === "sum") {
    const desc =
      empresa && empresa !== "Personal"
        ? `Compra en ${empresa} (${payable.length} ítems)`
        : `Compra (${payable.length} ítems)`;
    const { error } = await supabase.from("movimientos").insert([{
      ...ownership,
      monto: total,
      tipo: "egreso",
      moneda: entry.moneda,
      categoria: "Varios",
      empresa_nombre: empresa,
      descripcion: desc,
      original_text: `[${entry.sourceType}] ${desc}`,
      conciliado: true,
      conciliado_notas: null,
    }]);
    if (error) return { saved: 0, total: 0, error };
    return { saved: 1, total };
  }

  const rows = payable.map((it) => ({
    ...ownership,
    monto: Math.abs(it.monto ?? 0),
    tipo: "egreso" as const,
    moneda: entry.moneda,
    categoria: it.categoria,
    empresa_nombre: empresa,
    descripcion: it.descripcion,
    original_text: `[${entry.sourceType}] ${it.descripcion}`,
    conciliado: true,
    conciliado_notas: null,
  }));
  const { error } = await supabase.from("movimientos").insert(rows);
  if (error) return { saved: 0, total: 0, error };
  return { saved: rows.length, total };
}

export function registerExtractionHandlers(bot: Bot, deps: BotDeps) {
  const { supabase, genAI, botToken } = deps;

  bot.on("message:photo", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;

    const mediaGroupId: string | undefined = ctx.message.media_group_id;

    if (mediaGroupId) {
      const photo = ctx.message.photo?.[ctx.message.photo.length - 1];
      if (!photo) return;
      const file = await ctx.getFile();
      if (!file?.file_path) return;

      mediaGroupBuffer.add(
        mediaGroupId,
        { filePath: file.file_path, mimeType: "image/jpeg", chatCtx: ctx },
        async (items) => {
          const firstCtx = items[0].chatCtx;
          const linked2 = await requireTelegramCan(supabase, firstCtx, "write_movimiento");
          if (!linked2) return;
          sendTyping(firstCtx);
          const processingMsg = await firstCtx.reply("⏳ Procesando fotos...");
          try {
            const files = items.map((item, i) => ({
              filePath: item.filePath,
              mimeType: item.mimeType,
              displayName: `ticket-${i + 1}.jpg`,
            }));
            if (files.length === 1) {
              const { result, sourceType } = await extractReceiptWithItems({
                genAI,
                botToken,
                filePath: files[0].filePath,
                mimeType: files[0].mimeType,
              });
              await showReceiptReview(supabase, firstCtx, linked2, result, sourceType, processingMsg.message_id);
            } else {
              const results = await extractFromMultiplePhotos({ genAI, botToken, files });
              try { await firstCtx.api.deleteMessage(firstCtx.chat.id, processingMsg.message_id); } catch (e) {}
              const multiScope = { dashboardId: linked2.dashboardId ?? null, ownerUserId: linked2.ownerUserId ?? null };
              const [topEmpresas, topCategorias] = await Promise.all([
                getTopEmpresasForDashboard(supabase, multiScope),
                getTopCategoriasForDashboard(supabase, multiScope),
              ]);
              // H — no per-ticket empresa prompt: default empresa, collect into a
              // batch, and show ONE summary with "Guardar todos" + review for the
              // low-confidence ones.
              const batchIds: string[] = [];
              for (const result of results) {
                const data: PendingExtractionData = {
                  ...result,
                  sourceType: "multi",
                  empresa: result.empresa && String(result.empresa).trim() ? result.empresa : "Personal",
                };
                const eEntry = createPendingExtraction({
                  chatId: firstCtx.chat.id,
                  dashboardId: linked2.dashboardId ?? null,
                  userId: linked2.userId ?? null,
                  ownerUserId: linked2.ownerUserId ?? null,
                  data,
                  messageId: 0,
                  awaitingCompany: false,
                  empresaOptions: topEmpresas.length > 0 ? topEmpresas : null,
                  categoriaOptions: topCategorias.length > 0 ? topCategorias : null,
                });
                batchIds.push(eEntry.id);
              }
              const batchId = `b_${firstCtx.chat.id}_${Date.now()}`;
              pendingBatches.set(batchId, batchIds);
              await firstCtx.reply(buildBatchSummaryText(batchIds), {
                parse_mode: "Markdown",
                reply_markup: buildBatchKeyboard(batchId, batchIds),
              });
            }
          } catch (err) {
            try { await firstCtx.api.deleteMessage(firstCtx.chat.id, processingMsg.message_id); } catch (e) {}
            if (err instanceof GeminiUnavailableError) {
              await firstCtx.reply("⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)\\. Intentá en unos minutos\\.", { parse_mode: "MarkdownV2" });
            } else {
              console.error("Telegram photo processing error:", err);
              await firstCtx.reply("❌ No pude procesar las fotos. Mandá una por vez o probá con mejor iluminación.");
            }
          }
        },
      );
      return;
    }

    const photo = ctx.message.photo?.[ctx.message.photo.length - 1];
    if (!photo) return;
    sendTyping(ctx);
    const processingMsg = await ctx.reply("⏳ Procesando ticket...");
    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener la imagen.");
        return;
      }
      const { result, sourceType } = await extractReceiptWithItems({
        genAI,
        botToken,
        filePath: file.file_path,
        mimeType: "image/jpeg",
      });
      await showReceiptReview(supabase, ctx, linked, result, sourceType, processingMsg.message_id);
    } catch (err) {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
      if (err instanceof GeminiUnavailableError) {
        await ctx.reply("⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)\\. Intentá en unos minutos\\.", { parse_mode: "MarkdownV2" });
      } else {
        console.error("Telegram photo processing error:", err);
        await ctx.reply("❌ No pude procesar la foto. Probá con mejor iluminación o mandá el texto directamente.");
      }
    }
  });

  bot.on("message:document", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;

    const doc = ctx.message.document;
    if (!doc) return;

    const mimeType = inferMediaMimeType({ mimeType: doc.mime_type, filePath: doc.file_name, isDocument: true });
    if (!mimeType || !SUPPORTED_DOCUMENT_MIME_TYPES.has(mimeType)) {
      await ctx.reply("❌ Tipo de archivo no soportado. Mandá una imagen (JPG, PNG, WEBP) o PDF.");
      return;
    }

    if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
      await ctx.reply("❌ El archivo es demasiado grande (máximo 20MB).");
      return;
    }

    sendTyping(ctx);
    const processingMsg = await ctx.reply("⏳ Procesando documento...");
    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener el archivo.");
        return;
      }
      const { result, sourceType } = await extractReceiptWithItems({
        genAI,
        botToken,
        filePath: file.file_path,
        mimeType,
        displayName: doc.file_name ?? "document",
      });
      await showReceiptReview(supabase, ctx, linked, result, sourceType, processingMsg.message_id);
    } catch (err) {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
      if (err instanceof GeminiUnavailableError) {
        await ctx.reply("⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)\\. Intentá en unos minutos\\.", { parse_mode: "MarkdownV2" });
      } else {
        console.error("Telegram document processing error:", err);
        await ctx.reply("❌ No pude procesar el documento.");
      }
    }
  });

  // Extraction review callbacks
  bot.callbackQuery(/^er:confirm:(.+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const extractionId = ctx.match[1];
    const entry = getPendingExtraction(extractionId);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta confirmación ya venció o fue usada.");
      return;
    }

    if (entry.editMovementId) {
      await ctx.answerCallbackQuery("✅ Guardando cambios...");
      const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
      if (!linked) return;
      const { data: rows, error: fetchError } = await applyTelegramDataScope(
        supabase
          .from("movimientos")
          .select("id, owner_user_id, created_by_user_id")
          .is("deleted_at", null),
        linked,
      ).eq("id", entry.editMovementId).limit(1);
      if (fetchError || !rows?.[0]) {
        deletePendingExtraction(extractionId);
        await ctx.editMessageText("❌ El movimiento ya fue borrado o no existe.", { parse_mode: "Markdown" });
        return;
      }
      if (!canEditMovementViaTelegram(rows[0], linked)) {
        deletePendingExtraction(extractionId);
        await ctx.editMessageText("🚫 Sin permiso para editar movimientos de otros.", { parse_mode: "Markdown" });
        return;
      }
      const e = entry.data;
      let updateQuery = supabase.from("movimientos").update({
        monto: Math.abs(e.monto ?? 0),
        tipo: e.tipo,
        moneda: e.moneda,
        categoria: e.categoria,
        empresa_nombre: e.empresa,
        descripcion: e.descripcion,
      }).eq("id", entry.editMovementId);
      if (entry.dashboardId) updateQuery = updateQuery.eq("dashboard_id", entry.dashboardId);
      const { error: updateError } = await updateQuery;
      deletePendingExtraction(extractionId);
      if (updateError) {
        console.error("editLast update error:", updateError);
        await ctx.editMessageText("❌ Error al guardar los cambios. Intentá de nuevo.", { parse_mode: "Markdown" });
        return;
      }
      const editMontoStr = e.monto !== null ? `$${e.monto.toLocaleString("es-AR")} ${e.moneda}` : "monto desconocido";
      await ctx.editMessageText(`✅ *Movimiento actualizado:* ${editMontoStr} — ${escapeMd(e.descripcion ?? "")}`, { parse_mode: "Markdown" });
      return;
    }

    await ctx.answerCallbackQuery("✅ Guardando...");
    const d = entry.data;
    const { id: insertedId, error } = await insertExtractionMovement(supabase, entry);
    deletePendingExtraction(extractionId);
    if (error) {
      console.error("extractionReview confirm insert error:", error);
      await ctx.editMessageText("❌ Error al guardar. Intentá de nuevo.", { parse_mode: "Markdown" });
      return;
    }
    const montoStr = d.monto !== null ? `$${d.monto.toLocaleString("es-AR")} ${d.moneda}` : "monto desconocido";
    await ctx.editMessageText(`✅ *Guardado:* ${montoStr} — ${escapeMd(d.descripcion ?? "")}`, {
      parse_mode: "Markdown",
      reply_markup: insertedId ? buildUndoKeyboard(insertedId) : undefined,
    });
  });

  bot.callbackQuery(/^er:cancel:(.+)$/, async (ctx) => {
    const extractionId = ctx.match[1];
    deletePendingExtraction(extractionId);
    await ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("❌ Registro cancelado.");
  });

  // --- Album batch (spec H) ---
  bot.callbackQuery(/^eb:save:(.+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const batchId = ctx.match[1];
    const ids = pendingBatches.get(batchId);
    if (!ids) { await ctx.answerCallbackQuery("Este lote ya venció o fue guardado."); return; }
    await ctx.answerCallbackQuery("✅ Guardando...");
    let saved = 0;
    let total = 0;
    for (const id of ids) {
      const entry = getPendingExtraction(id);
      if (!entry || entry.chatId !== ctx.chat.id) continue; // already saved/reviewed/expired
      const { error } = await insertExtractionMovement(supabase, entry);
      if (!error) {
        saved += 1;
        total += Math.abs(entry.data.monto ?? 0);
        deletePendingExtraction(id);
      }
    }
    pendingBatches.delete(batchId);
    await ctx.editMessageText(
      saved > 0
        ? `✅ *Guardé ${saved} movimiento${saved !== 1 ? "s" : ""}* · Total $${total.toLocaleString("es-AR")}`
        : "No quedaba nada para guardar.",
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery(/^eb:rev:(.+)$/, async (ctx) => {
    const extractionId = ctx.match[1];
    const entry = getPendingExtraction(extractionId);
    if (!entry || entry.chatId !== ctx.chat.id) { await ctx.answerCallbackQuery("Este ticket ya venció."); return; }
    await ctx.answerCallbackQuery();
    await ctx.reply(buildReviewCardText(entry.data), {
      parse_mode: "Markdown",
      reply_markup: buildReviewKeyboard(extractionId, entry.categoriaOptions ?? undefined),
    });
  });

  bot.callbackQuery(/^eb:cancel:(.+)$/, async (ctx) => {
    const batchId = ctx.match[1];
    const ids = pendingBatches.get(batchId) ?? [];
    for (const id of ids) deletePendingExtraction(id);
    pendingBatches.delete(batchId);
    await ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("❌ Lote cancelado.");
  });

  bot.callbackQuery(/^er:co:([^:]+):(.+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const extractionId = ctx.match[1];
    const action = ctx.match[2];
    const entry = getPendingExtraction(extractionId);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta sesión ya venció.");
      return;
    }

    if (action === "search") {
      updatePendingExtraction(extractionId, { editingField: "empresa" });
      await ctx.answerCallbackQuery();
      await ctx.reply("🔍 Escribí el nombre de la empresa (o 'ninguna'):", { parse_mode: "Markdown" });
      return;
    }

    if (action === "none") {
      updatePendingExtraction(extractionId, { awaitingCompany: false, editingField: null });
      const updated = getPendingExtraction(extractionId)!;
      updated.data.empresa = null;
      await ctx.answerCallbackQuery("Sin empresa");
      const reviewText = buildReviewCardText(updated.data);
      await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId) });
      return;
    }

    if (action === "create") {
      const nameToCreate = entry.pendingNewCompanyName;
      if (!nameToCreate) {
        await ctx.answerCallbackQuery("Error: nombre no disponible.");
        return;
      }
      await ctx.answerCallbackQuery("➕ Creando empresa...");
      const scope: Record<string, string> = {};
      if (entry.dashboardId) scope.dashboard_id = entry.dashboardId;
      else if (entry.ownerUserId) scope.owner_user_id = entry.ownerUserId;
      const { data: newEmp, error: empError } = await supabase
        .from("empresas")
        .insert([{ nombre: nameToCreate, ...scope }])
        .select("id, nombre")
        .limit(1);
      if (empError || !newEmp?.[0]) {
        await ctx.reply("❌ No se pudo crear la empresa. Intentá de nuevo.");
        return;
      }
      updatePendingExtraction(extractionId, { awaitingCompany: false, editingField: null, pendingNewCompanyName: null });
      const updated = getPendingExtraction(extractionId)!;
      updated.data.empresa = newEmp[0].nombre;
      const reviewText = buildReviewCardText(updated.data);
      await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId) });
      return;
    }

    if (action === "confirm") {
      const nombre = entry.pendingSuggestNombre;
      updatePendingExtraction(extractionId, { awaitingCompany: false, editingField: null, pendingSuggestNombre: null });
      const updated = getPendingExtraction(extractionId)!;
      updated.data.empresa = nombre;
      await ctx.answerCallbackQuery(nombre ? `✅ ${nombre}` : "✅ Empresa seleccionada");
      const reviewText = buildReviewCardText(updated.data);
      await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId) });
      return;
    }

    // numeric index — empresa selected from empresaOptions list
    const idx = parseInt(action, 10);
    const empresaNombre = (!isNaN(idx) && entry.empresaOptions?.[idx]?.nombre) ? entry.empresaOptions[idx].nombre : null;
    updatePendingExtraction(extractionId, { awaitingCompany: false, editingField: null });
    const updated = getPendingExtraction(extractionId)!;
    updated.data.empresa = empresaNombre;
    await ctx.answerCallbackQuery(empresaNombre ? `✅ ${empresaNombre}` : "✅ Empresa seleccionada");
    const reviewText = buildReviewCardText(updated.data);
    await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId) });
  });

  bot.callbackQuery(/^er:ca:([^:]+):(.+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const extractionId = ctx.match[1];
    const action = ctx.match[2];
    const entry = getPendingExtraction(extractionId);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta sesión ya venció.");
      return;
    }

    if (action === "search") {
      updatePendingExtraction(extractionId, { editingField: "categoria", awaitingCategoria: true });
      await ctx.answerCallbackQuery();
      await ctx.reply("🔍 Escribí el nombre de la categoría:", { parse_mode: "Markdown" });
      return;
    }

    if (action === "none") {
      updatePendingExtraction(extractionId, { awaitingCategoria: false, editingField: null });
      const updated = getPendingExtraction(extractionId)!;
      await ctx.answerCallbackQuery("Sin cambio de categoría");
      const reviewText = buildReviewCardText(updated.data);
      await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId, updated.categoriaOptions ?? undefined) });
      return;
    }

    if (action === "create") {
      const nameToCreate = entry.pendingNewCategoriaName;
      if (!nameToCreate) {
        await ctx.answerCallbackQuery("Error: nombre no disponible.");
        return;
      }
      await ctx.answerCallbackQuery("➕ Creando categoría...");
      const { createCategoriaFromBot } = await import("./commands/entities.ts");
      const linked = {
        dashboardId: entry.dashboardId,
        ownerUserId: entry.ownerUserId,
        userId: entry.userId,
        role: null,
        permissions: {},
        username: null,
        remindersEnabled: true,
        linkTokenExpiresAt: null,
      } as any;
      const result = await createCategoriaFromBot(supabase, linked, nameToCreate);
      if (!result.ok) {
        await ctx.reply("❌ No se pudo crear la categoría. Intentá de nuevo.");
        return;
      }
      updatePendingExtraction(extractionId, { awaitingCategoria: false, editingField: null, pendingNewCategoriaName: null });
      const updated = getPendingExtraction(extractionId)!;
      updated.data.categoria = nameToCreate;
      const reviewText = buildReviewCardText(updated.data);
      await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId, updated.categoriaOptions ?? undefined) });
      return;
    }

    if (action === "confirm") {
      const nombre = entry.pendingSuggestCategoria;
      updatePendingExtraction(extractionId, { awaitingCategoria: false, editingField: null, pendingSuggestCategoria: null });
      const updated = getPendingExtraction(extractionId)!;
      if (nombre) updated.data.categoria = nombre;
      await ctx.answerCallbackQuery(nombre ? `✅ ${nombre}` : "✅ Categoría seleccionada");
      const reviewText = buildReviewCardText(updated.data);
      await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId, updated.categoriaOptions ?? undefined) });
      return;
    }

    // numeric index — categoría selected from categoriaOptions list
    const idx = parseInt(action, 10);
    const categoriaNombre = (!isNaN(idx) && entry.categoriaOptions?.[idx]?.nombre) ? entry.categoriaOptions[idx].nombre : null;
    updatePendingExtraction(extractionId, { awaitingCategoria: false, editingField: null });
    const updated = getPendingExtraction(extractionId)!;
    if (categoriaNombre) updated.data.categoria = categoriaNombre;
    await ctx.answerCallbackQuery(categoriaNombre ? `✅ ${categoriaNombre}` : "✅ Categoría seleccionada");
    const reviewText = buildReviewCardText(updated.data);
    await ctx.editMessageText(reviewText, { parse_mode: "Markdown", reply_markup: buildReviewKeyboard(extractionId, updated.categoriaOptions ?? undefined) });
  });

  bot.callbackQuery(/^er:edit:(.+):(.+)$/, async (ctx) => {
    const extractionId = ctx.match[1];
    const field = ctx.match[2] as ExtractionField;
    const entry = getPendingExtraction(extractionId);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta sesión ya venció.");
      return;
    }
    updatePendingExtraction(extractionId, { editingField: field });
    await ctx.answerCallbackQuery();

    const prompts: Record<ExtractionField, string> = {
      monto: "✏️ Mandame el nuevo monto (ej: `1500`):",
      empresa: "✏️ Mandame el nombre de la empresa (o `ninguna`):",
      categoria: "✏️ Mandame la categoría:",
      descripcion: "✏️ Mandame la nueva descripción:",
      tipo: "✏️ ¿Es `ingreso` o `gasto`?",
      moneda: "✏️ ¿`ARS` o `USD`?",
    };
    await ctx.reply(prompts[field] ?? "✏️ Mandame el nuevo valor:", { parse_mode: "Markdown" });
  });

  // --- Line-item selection (interactive ticket items) ---
  bot.callbackQuery(/^li:t:([^:]+):(\d+)$/, async (ctx) => {
    const id = ctx.match[1];
    const idx = parseInt(ctx.match[2], 10);
    const entry = getPendingLineItems(id);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta selección ya venció.");
      return;
    }
    toggleLineItem(id, idx);
    await ctx.answerCallbackQuery();
    const updated = getPendingLineItems(id);
    if (!updated) return;
    await ctx.editMessageText(buildLineItemsCardText(updated), {
      parse_mode: "Markdown",
      reply_markup: buildLineItemsKeyboard(updated),
    });
  });

  bot.callbackQuery(/^li:all:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const entry = getPendingLineItems(id);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta selección ya venció.");
      return;
    }
    const allSelected = entry.items.every((it) => it.selected);
    setAllLineItems(id, !allSelected);
    await ctx.answerCallbackQuery();
    const updated = getPendingLineItems(id);
    if (!updated) return;
    await ctx.editMessageText(buildLineItemsCardText(updated), {
      parse_mode: "Markdown",
      reply_markup: buildLineItemsKeyboard(updated),
    });
  });

  bot.callbackQuery(/^li:save:(.+)$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const id = ctx.match[1];
    const entry = getPendingLineItems(id);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta selección ya venció.");
      return;
    }
    const payableCount = selectedLineItems(entry).filter((it) => it.monto !== null).length;
    if (payableCount === 0) {
      await ctx.answerCallbackQuery("Tildá al menos un ítem con monto.");
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(buildGroupingPromptText(entry), {
      parse_mode: "Markdown",
      reply_markup: buildGroupingKeyboard(id),
    });
  });

  bot.callbackQuery(/^li:g:([^:]+):([su])$/, async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const id = ctx.match[1];
    const mode: "sep" | "sum" = ctx.match[2] === "s" ? "sep" : "sum";
    const entry = getPendingLineItems(id);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta selección ya venció.");
      return;
    }
    await ctx.answerCallbackQuery("✅ Guardando...");
    const { saved, total, error } = await insertLineItemMovements(supabase, entry, mode);
    deletePendingLineItems(id);
    if (error) {
      console.error("lineItems insert error:", error);
      await ctx.editMessageText("❌ Error al guardar. Intentá de nuevo.", { parse_mode: "Markdown" });
      return;
    }
    if (saved === 0) {
      await ctx.editMessageText("No quedaba nada para guardar.", { parse_mode: "Markdown" });
      return;
    }
    const totalStr = `$${total.toLocaleString("es-AR")} ${entry.moneda}`;
    const summary =
      mode === "sum"
        ? `✅ *Guardé 1 movimiento* · ${totalStr}`
        : `✅ *Guardé ${saved} movimiento${saved !== 1 ? "s" : ""}* · Total ${totalStr}`;
    await ctx.editMessageText(summary, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^li:cancel:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    deletePendingLineItems(id);
    await ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("❌ Cancelado.");
  });

  // --- Modificar: line editor for a saved ticket (delete-per-line) ---
  bot.callbackQuery(/^modlin:(.+)$/, async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    await ctx.answerCallbackQuery();
    await renderLineEditor(ctx, supabase, linked, ctx.match[1]);
  });

  // Only the lineId travels in callback_data (Telegram's 64-byte limit can't
  // hold two UUIDs); the parent is looked up from the line.
  bot.callbackQuery(/^mldel:(.+)$/, async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const lineId = ctx.match[1];
    const { data: lrows } = await applyTelegramDataScope(
      supabase.from("movimiento_lineas").select("id, movimiento_id").is("deleted_at", null),
      linked,
    ).eq("id", lineId).limit(1);
    const line = lrows?.[0];
    if (!line) { await ctx.answerCallbackQuery("Renglón no encontrado."); return; }
    await applyTelegramDataScope(
      supabase.from("movimiento_lineas").update({ deleted_at: new Date().toISOString() }).eq("id", lineId),
      linked,
    );
    await recomputeTelegramTicketTotal(supabase, line.movimiento_id, linked);
    await ctx.answerCallbackQuery("Renglón borrado.");
    await renderLineEditor(ctx, supabase, linked, line.movimiento_id, true);
  });

  bot.callbackQuery(/^mldone:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Listo.");
    try { await ctx.editMessageText("🧾 Renglones actualizados."); } catch (e) {}
  });

  return { mediaGroupBuffer };
}
