import type { Bot, Context } from "grammy";
import type { BotDeps } from "./deps.ts";
import { requireTelegramCan, sendTyping, buildEmpresaSelectorKeyboard } from "./utils.ts";
import { assertBotWritable } from "./maintenance-gate.ts";
import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  canEditMovementViaTelegram,
  type TelegramLinkRecord,
} from "../server/telegramAccess.ts";
import { extractFromPhoto, extractFromMultiplePhotos, inferMediaMimeType, SUPPORTED_DOCUMENT_MIME_TYPES } from "../server/telegramMedia.ts";
import { MediaGroupBuffer } from "../server/mediaGroupBuffer.ts";
import {
  createPendingExtraction,
  getPendingExtraction,
  updatePendingExtraction,
  deletePendingExtraction,
  buildReviewCardText,
  buildReviewKeyboard,
  type ExtractionField,
} from "../server/extractionReview.ts";
import type { PendingExtractionData } from "../server/validation.ts";
import { getTopEmpresasForDashboard, resolveTelegramCompany } from "../server/telegramCompanyResolution.ts";
import { getTopCategoriasForDashboard } from "../server/telegramCategoryResolution.ts";
import { GeminiUnavailableError } from "../server/geminiWithFallback.ts";
import { buildUndoKeyboard } from "./quickActions.ts";

const mediaGroupBuffer = new MediaGroupBuffer<{ filePath: string; mimeType: string; chatCtx: any }>({ debounceMs: 1500 });

async function showEmpresaSelector(supabase: BotDeps["supabase"], ctx: Context, linked: any, data: PendingExtractionData, processingMsgId: number) {
  try { await ctx.api.deleteMessage(ctx.chat.id, processingMsgId); } catch (e) {}
  const scope = { dashboardId: linked.dashboardId ?? null, ownerUserId: linked.ownerUserId ?? null };
  const [empresas, categorias] = await Promise.all([
    getTopEmpresasForDashboard(supabase, scope),
    getTopCategoriasForDashboard(supabase, scope),
  ]);
  const entry = createPendingExtraction({
    chatId: ctx.chat.id,
    dashboardId: linked.dashboardId ?? null,
    userId: linked.userId ?? null,
    ownerUserId: linked.ownerUserId ?? null,
    data,
    messageId: 0,
    awaitingCompany: true,
    empresaOptions: empresas,
    categoriaOptions: categorias.length > 0 ? categorias : null,
  });
  if (empresas.length === 0) {
    updatePendingExtraction(entry.id, { editingField: "empresa" });
    await ctx.reply("🏢 ¿A qué empresa corresponde este ticket? (escribí el nombre o 'ninguna'):", { parse_mode: "Markdown" });
    return;
  }
  await ctx.reply("🏢 ¿A qué empresa corresponde este ticket?", {
    reply_markup: buildEmpresaSelectorKeyboard(entry.id, empresas),
  });
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
              const { result, sourceType } = await extractFromPhoto({
                genAI,
                botToken,
                filePath: files[0].filePath,
                mimeType: files[0].mimeType,
              });
              await showEmpresaSelector(supabase, firstCtx, linked2, { ...result, sourceType }, processingMsg.message_id);
            } else {
              const results = await extractFromMultiplePhotos({ genAI, botToken, files });
              try { await firstCtx.api.deleteMessage(firstCtx.chat.id, processingMsg.message_id); } catch (e) {}
              const multiScope = { dashboardId: linked2.dashboardId ?? null, ownerUserId: linked2.ownerUserId ?? null };
              const [topEmpresas, topCategorias] = await Promise.all([
                getTopEmpresasForDashboard(supabase, multiScope),
                getTopCategoriasForDashboard(supabase, multiScope),
              ]);
              for (const result of results) {
                const data: PendingExtractionData = { ...result, sourceType: "multi" };
                const eEntry = createPendingExtraction({
                  chatId: firstCtx.chat.id,
                  dashboardId: linked2.dashboardId ?? null,
                  userId: linked2.userId ?? null,
                  ownerUserId: linked2.ownerUserId ?? null,
                  data,
                  messageId: 0,
                  awaitingCompany: true,
                  empresaOptions: topEmpresas,
                  categoriaOptions: topCategorias.length > 0 ? topCategorias : null,
                });
                if (topEmpresas.length === 0) {
                  updatePendingExtraction(eEntry.id, { editingField: "empresa" });
                  await firstCtx.reply("🏢 ¿A qué empresa corresponde este ticket? (escribí el nombre o 'ninguna'):");
                } else {
                  await firstCtx.reply(`🏢 Ticket ${results.indexOf(result) + 1} — ¿A qué empresa?`, {
                    reply_markup: buildEmpresaSelectorKeyboard(eEntry.id, topEmpresas),
                  });
                }
              }
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
      const { result, sourceType } = await extractFromPhoto({
        genAI,
        botToken,
        filePath: file.file_path,
        mimeType: "image/jpeg",
      });
      await showEmpresaSelector(supabase, ctx, linked, { ...result, sourceType }, processingMsg.message_id);
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
      const { result, sourceType } = await extractFromPhoto({
        genAI,
        botToken,
        filePath: file.file_path,
        mimeType,
        displayName: doc.file_name ?? "document",
      });
      await showEmpresaSelector(supabase, ctx, linked, { ...result, sourceType }, processingMsg.message_id);
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
      await ctx.editMessageText(`✅ *Movimiento actualizado:* ${editMontoStr} — ${e.descripcion}`, { parse_mode: "Markdown" });
      return;
    }

    await ctx.answerCallbackQuery("✅ Guardando...");
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
    const { data: insertedRows, error } = await supabase.from("movimientos").insert([{
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
    deletePendingExtraction(extractionId);
    if (error) {
      console.error("extractionReview confirm insert error:", error);
      await ctx.editMessageText("❌ Error al guardar. Intentá de nuevo.", { parse_mode: "Markdown" });
      return;
    }
    const insertedId = insertedRows?.[0]?.id as string | undefined;
    const montoStr = d.monto !== null ? `$${d.monto.toLocaleString("es-AR")} ${d.moneda}` : "monto desconocido";
    await ctx.editMessageText(`✅ *Guardado:* ${montoStr} — ${d.descripcion}`, {
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
      tipo: "✏️ ¿Es `ingreso` o `egreso`?",
      moneda: "✏️ ¿`ARS` o `USD`?",
    };
    await ctx.reply(prompts[field] ?? "✏️ Mandame el nuevo valor:", { parse_mode: "Markdown" });
  });

  return { mediaGroupBuffer };
}
