import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, requireLinkedAccount, escapeMd, formatMovementSummary, insertBotAuditLog, buildEmpresaSelectorKeyboard, splitForTelegram } from "../utils.ts";
import { setInputSession } from "../sessions.ts";
import { applyTelegramDataScope, buildTelegramWriteOwnership, type TelegramLinkRecord } from "../../server/telegramAccess.ts";
import { resolveTelegramCompany, getTopEmpresasForDashboard, type TelegramCompanyOption } from "../../server/telegramCompanyResolution.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "../../server/gemini.ts";
import {
  createPendingExtraction,
  getPendingExtraction,
  getPendingExtractionByChat,
  updatePendingExtraction,
  deletePendingExtraction,
  buildReviewCardText,
  buildReviewKeyboard,
} from "../../server/extractionReview.ts";
import type { PendingExtractionData } from "../../server/validation.ts";
import { transcribeTelegramAudioWithGemini } from "../../server/telegramAudio.ts";
import { getRecurrenceSession, pendingRecurrenceSessions } from "../sessions.ts";

type PendingMovementPayload = {
  item: {
    monto: number | null;
    tipo: "ingreso" | "egreso";
    moneda: "ARS" | "USD";
    categoria: string;
    empresa: string | null;
    descripcion: string;
  };
  originalText: string;
  options: Array<{ nombre: string }>;
  suggestedOptionIndex: number | null;
};

async function getLastMovementByType(
  supabase: BotDeps["supabase"],
  linked: TelegramLinkRecord,
  tipo: "ingreso" | "egreso",
) {
  const { data } = await applyTelegramDataScope(
    supabase.from("movimientos").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    linked,
  )
    .eq("tipo", tipo)
    .limit(1);
  return data?.[0] ?? null;
}

function parseTelegramMovementEditInput(input: string | undefined) {
  const raw = input?.trim() ?? "";
  if (!raw) return null;
  const [montoRaw, descripcionRaw, categoriaRaw, empresaRaw, monedaRaw] = raw.split("|").map((part) => part.trim());
  const monto = Number(montoRaw);
  if (!Number.isFinite(monto) || !descripcionRaw) return null;
  return {
    monto: Math.abs(monto),
    descripcion: descripcionRaw,
    categoria: categoriaRaw || "Otros",
    empresa: empresaRaw || "Personal",
    moneda: monedaRaw === "USD" ? "USD" : "ARS",
  };
}

async function listTelegramCompanies(supabase: BotDeps["supabase"], linked: TelegramLinkRecord): Promise<TelegramCompanyOption[]> {
  const { data, error } = await applyTelegramDataScope(
    supabase.from("empresas").select("id, nombre, deleted_at").order("nombre", { ascending: true }),
    linked,
  ).is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((entry: any) => ({ id: entry.id, nombre: entry.nombre }));
}

async function cancelPendingTelegramMovements(supabase: BotDeps["supabase"], chatId: number) {
  await supabase
    .from("telegram_pending_movements")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("status", "pending");
}

async function createPendingTelegramMovement(supabase: BotDeps["supabase"], args: {
  linked: TelegramLinkRecord;
  chatId: number;
  payload: PendingMovementPayload;
}) {
  await cancelPendingTelegramMovements(supabase, args.chatId);
  const { data, error } = await supabase
    .from("telegram_pending_movements")
    .insert([{
      chat_id: args.chatId,
      user_id: args.linked.userId,
      dashboard_id: args.linked.dashboardId,
      payload: args.payload,
      status: "pending",
    }])
    .select("id")
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id as string | undefined;
}

async function getPendingTelegramMovement(supabase: BotDeps["supabase"], pendingId: string, chatId: number) {
  const { data, error } = await supabase
    .from("telegram_pending_movements")
    .select("*")
    .eq("id", pendingId)
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .limit(1);
  if (error) throw error;
  return data?.[0] as { id: string; payload: PendingMovementPayload } | undefined;
}

async function resolvePendingTelegramMovement(supabase: BotDeps["supabase"], pendingId: string) {
  await supabase
    .from("telegram_pending_movements")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", pendingId);
}

export async function persistTelegramMovement(supabase: BotDeps["supabase"], args: {
  linked: TelegramLinkRecord;
  item: {
    monto: number | null;
    tipo: "ingreso" | "egreso";
    moneda: "ARS" | "USD";
    categoria: string;
    empresa: string | null;
    descripcion: string;
  };
  originalText: string;
}) {
  let finalCategory = args.item.categoria;
  if (!finalCategory || finalCategory === "Otros") {
    const desc = args.item.descripcion.toLowerCase();
    if (desc.includes("pan") || desc.includes("taller central") || desc.includes("comida")) finalCategory = "Alimentos";
    else if (desc.includes("nafta") || desc.includes("ypf") || desc.includes("estacion")) finalCategory = "Transporte";
    else if (desc.includes("luz") || desc.includes("gas") || desc.includes("internet")) finalCategory = "Servicios";
    else finalCategory = "Otros";
  }

  const empresaNombre = args.item.empresa?.trim() || "Personal";
  const { data, error } = await supabase
    .from("movimientos")
    .insert([{
      ...buildTelegramWriteOwnership(args.linked),
      tipo: args.item.tipo,
      moneda: args.item.moneda,
      monto: Math.abs(args.item.monto || 0),
      categoria: finalCategory,
      empresa_nombre: empresaNombre,
      descripcion: args.item.descripcion,
      original_text: args.originalText,
      conciliado: true,
      conciliado_notas: null,
    }])
    .select();

  if (error) throw error;
  const created = data?.[0];
  if (created?.id) {
    await insertBotAuditLog(supabase, {
      linked: args.linked,
      actorUserId: args.linked.userId,
      action: "create",
      entityType: "movimiento",
      entityId: created.id,
      afterData: created,
    });
  }

  return {
    created,
    finalCategory,
    empresaNombre,
    icon: args.item.tipo === "ingreso" ? "🟢" : "🔴",
  };
}

async function askTelegramCompanyAssignment(supabase: BotDeps["supabase"], args: {
  ctx: Context;
  linked: TelegramLinkRecord;
  item: PendingMovementPayload["item"];
  originalText: string;
  companies: TelegramCompanyOption[];
  suggestedCompanyIndex?: number | null;
}) {
  const payload: PendingMovementPayload = {
    item: { ...args.item, empresa: null },
    originalText: args.originalText,
    options: args.companies.map((company) => ({ nombre: company.nombre })),
    suggestedOptionIndex: args.suggestedCompanyIndex ?? null,
  };

  const pendingId = await createPendingTelegramMovement(supabase, {
    linked: args.linked,
    chatId: args.ctx.chat.id,
    payload,
  });

  if (!pendingId) {
    await args.ctx.reply("❌ No pude guardar la asignación pendiente de empresa.");
    return true;
  }

  if (
    typeof args.suggestedCompanyIndex === "number" &&
    payload.options[args.suggestedCompanyIndex]
  ) {
    const suggested = payload.options[args.suggestedCompanyIndex];
    await args.ctx.reply(
      `🤔 No estoy 100% seguro con la empresa.\n\n¿Quisiste decir *${suggested.nombre}*?`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text(`Sí, ${suggested.nombre}`, `tcp:${pendingId}:y`).row()
          .text("Elegir otra", `tcp:${pendingId}:o`)
          .text("Personal", `tcp:${pendingId}:p`),
      },
    );
    return true;
  }

  await args.ctx.reply(
    `🏢 No me quedó clara la empresa para *${args.item.descripcion}*.\n\n¿A qué empresa cargamos esto?`,
    {
      parse_mode: "Markdown",
      reply_markup: buildPendingCompanyKeyboardLocal(pendingId, payload.options),
    },
  );
  return true;
}

function buildPendingCompanyKeyboardLocal(pendingId: string, options: Array<{ nombre: string }>) {
  const kb = new InlineKeyboard();
  options.forEach((option, index) => {
    kb.text(option.nombre, `tca:${pendingId}:${index}`);
    if ((index + 1) % 2 === 0) kb.row();
  });
  kb.row().text("Personal", `tca:${pendingId}:p`);
  return kb;
}

async function getSaldosText(supabase: BotDeps["supabase"], linked: TelegramLinkRecord): Promise<string | null> {
  const { data: emps, error: errEmps } = await applyTelegramDataScope(
    supabase.from("empresas").select("nombre").is("deleted_at", null),
    linked,
  );
  if (errEmps) {
    console.error("getSaldosText emps error:", errEmps);
    return null;
  }
  const { data: movs, error: errMovs } = await applyTelegramDataScope(
    supabase.from("movimientos").select("*").is("deleted_at", null),
    linked,
  );
  if (errMovs) {
    console.error("getSaldosText movs error:", errMovs);
    return null;
  }

  let text = "💰 *Saldos por Empresa:*\n\n";
  const companies = ["Personal", ...(emps?.map(e => e.nombre) || [])];

  companies.forEach(company => {
    const cMovs = movs?.filter(m => m.empresa_nombre === company) || [];
    const totalARS = cMovs.reduce((acc, m) => acc + (m.moneda === "ARS" ? (m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto)) : 0), 0);
    const totalUSD = cMovs.reduce((acc, m) => acc + (m.moneda === "USD" ? (m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto)) : 0), 0);

    if (totalARS !== 0 || totalUSD !== 0) {
      text += `🏢 *${escapeMd(company)}*\n`;
      text += `   🇦🇷 ARS: $${totalARS.toLocaleString()}\n`;
      text += `   🇺🇸 USD: u$s${totalUSD.toLocaleString()}\n\n`;
    }
  });
  return text;
}

const SEARCH_PAGE_SIZE = 10;

export async function runMovementSearch(supabase: BotDeps["supabase"], ctx: Context, linked: TelegramLinkRecord, query: string, offset = 0) {
  const { data: results, error } = await applyTelegramDataScope(
    supabase.from("movimientos").select("*").is("deleted_at", null),
    linked,
  )
    .ilike("descripcion", `%${query}%`)
    .order("created_at", { ascending: false })
    .range(offset, offset + SEARCH_PAGE_SIZE); // +1 to peek "has more"
  if (error) {
    console.error("runMovementSearch error:", error);
    return ctx.reply("❌ Error buscando movimientos. Intentá de nuevo.");
  }
  if (!results || results.length === 0) {
    return ctx.reply(offset === 0 ? "No se encontraron movimientos." : "No hay más resultados.");
  }
  const hasMore = results.length > SEARCH_PAGE_SIZE;
  const page = hasMore ? results.slice(0, SEARCH_PAGE_SIZE) : results;
  let text = `🔍 *Resultados para "${escapeMd(query)}"* (${offset + 1}–${offset + page.length}):\n\n`;
  page.forEach((m: any) => {
    const icon = m.tipo === "ingreso" ? "🟢" : "🔴";
    text += `${icon} ${m.monto} ${m.moneda} - ${escapeMd(m.descripcion ?? "")} (${escapeMd(m.categoria ?? "")})\n`;
  });
  const opts: any = { parse_mode: "Markdown" };
  if (hasMore) {
    // Telegram callback_data 64-byte limit — keep query short
    const safeQ = query.slice(0, 40);
    opts.reply_markup = new InlineKeyboard().text("Mostrar más", `srch:${offset + SEARCH_PAGE_SIZE}:${safeQ}`);
  }
  return ctx.reply(text, opts);
}

export async function processTelegramFinancialText(supabase: BotDeps["supabase"], genAI: BotDeps["genAI"], ctx: Context, args: {
  text: string;
  originalText: string;
}) {
  const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
  if (!linked) return;

  try {
    const { data: currentCats } = await applyTelegramDataScope(
      supabase.from("categorias").select("nombre"),
      linked,
    );
    const catList = currentCats?.map(c => c.nombre).join(", ") || "Otros";

    const prompt = `Extraé los datos de este mensaje: "${args.text}"`;
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT + `\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".`,
      },
    });
    const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const extracted = parseGeminiJsonResponse(textResponse);

    if (!extracted) {
      await ctx.reply("No pude entender el mensaje, probá reformularlo.");
      return;
    }

    if (extracted.intent === "REGISTRAR" && extracted.items) {
      const companies = await listTelegramCompanies(supabase, linked);
      for (const rawItem of extracted.items) {
        const item = rawItem as { monto: number; tipo: "ingreso" | "egreso"; moneda: "ARS" | "USD"; categoria: string; empresa: string | null; descripcion: string };
        const companyResolution = resolveTelegramCompany(item, companies);
        if (companyResolution.kind === "exact") {
          item.empresa = companyResolution.company.nombre;
        }

        const needsCompanyPrompt =
          extracted.items.length === 1 &&
          (companyResolution.kind === "missing" || companyResolution.kind === "suggest" || companyResolution.kind === "unresolved");

        if (needsCompanyPrompt) {
          const suggestedIndex =
            companyResolution.kind === "suggest"
              ? companies.findIndex((company) => company.nombre === companyResolution.company.nombre)
              : null;

          await askTelegramCompanyAssignment(supabase, {
            ctx,
            linked,
            item,
            originalText: args.originalText,
            companies,
            suggestedCompanyIndex: suggestedIndex,
          });
          return;
        }

        const { created, finalCategory, empresaNombre, icon } = await persistTelegramMovement(supabase, {
          linked,
          item,
          originalText: args.originalText,
        });

        await ctx.reply(`${icon} *Registrado:* ${item.descripcion}\n💰 ${item.monto} ${item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${empresaNombre}`, {
          parse_mode: "Markdown",
          reply_markup: created?.id ? new InlineKeyboard().text("✏️ Cambiar Categoría", `change_cat_${created.id}`) : undefined,
        });
      }
    } else if (extracted.intent === "GESTIONAR_EMPRESA" && extracted.action === "ADD") {
      const { data } = await supabase.from("empresas").insert([{ nombre: extracted.companyName, ...buildTelegramWriteOwnership(linked) }]).select();
      const created = data?.[0];
      if (created?.id) {
        await insertBotAuditLog(supabase, {
          linked,
          actorUserId: linked.userId,
          action: "create",
          entityType: "empresa",
          entityId: created.id,
          afterData: created,
        });
      }
      await ctx.reply(`✅ Empresa *${escapeMd(extracted.companyName)}* agregada con éxito.`, { parse_mode: "Markdown" });
    } else {
      await ctx.reply("⚠️ No pude entender bien ese movimiento. ¿Podrás ser más específico?");
    }
  } catch (err) {
    console.error(err);
    await ctx.reply("❌ Hubo un error procesando tu mensaje.");
  }
}

export function registerMovementHandlers(bot: Bot, deps: BotDeps) {
  const { supabase, genAI, botToken } = deps;

  bot.command("borrar", async (ctx) => {
    ctx.reply("Usá `/borrar_ultimo_ingreso` o `/borrar_ultimo_egreso`.", { parse_mode: "Markdown" });
  });

  bot.command("borrar_ultimo_ingreso", async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "delete_own_movimiento");
    if (!linked) return;
    const last = await getLastMovementByType(supabase, linked, "ingreso");
    if (!last) return ctx.reply("No hay ingresos para borrar.");
    await ctx.reply(
      `Vas a borrar este último ingreso:\n\n${formatMovementSummary(last)}`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_mov_${last.id}`)
          .text("❌ Cancelar", `cancel_delete_mov_${last.id}`),
      },
    );
  });

  bot.command("borrar_ultimo_egreso", async (ctx) => {
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

  bot.command("editar_ultimo_ingreso", async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const parsed = parseTelegramMovementEditInput(ctx.match);
    if (!parsed) {
      return ctx.reply(
        "Uso: `/editar_ultimo_ingreso monto | descripcion | categoria | empresa | moneda`\nEj: `/editar_ultimo_ingreso 50000 | Venta mostrador | Ventas | Taller | ARS`",
        { parse_mode: "Markdown" },
      );
    }
    const last = await getLastMovementByType(supabase, linked, "ingreso");
    if (!last) return ctx.reply("No hay ingresos para editar.");
    let updateQuery = supabase.from("movimientos").update({
      monto: parsed.monto,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      empresa_nombre: parsed.empresa,
      moneda: parsed.moneda,
    }).eq("id", last.id);
    if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
    await updateQuery;
    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "update",
      entityType: "movimiento",
      entityId: last.id,
      beforeData: last,
      afterData: { ...last, monto: parsed.monto, descripcion: parsed.descripcion, categoria: parsed.categoria, empresa_nombre: parsed.empresa, moneda: parsed.moneda },
    });
    ctx.reply(`✅ Último ingreso actualizado.\n\n${formatMovementSummary({ ...last, tipo: "ingreso", monto: parsed.monto, descripcion: parsed.descripcion, categoria: parsed.categoria, empresa_nombre: parsed.empresa, moneda: parsed.moneda })}`, { parse_mode: "Markdown" });
  });

  bot.command("editar_ultimo_egreso", async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const parsed = parseTelegramMovementEditInput(ctx.match);
    if (!parsed) {
      return ctx.reply(
        "Uso: `/editar_ultimo_egreso monto | descripcion | categoria | empresa | moneda`\nEj: `/editar_ultimo_egreso 12000 | Compra insumos | Compras | Taller | ARS`",
        { parse_mode: "Markdown" },
      );
    }
    const last = await getLastMovementByType(supabase, linked, "egreso");
    if (!last) return ctx.reply("No hay gastos para editar.");
    let updateQuery = supabase.from("movimientos").update({
      monto: parsed.monto,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      empresa_nombre: parsed.empresa,
      moneda: parsed.moneda,
    }).eq("id", last.id);
    if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
    await updateQuery;
    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "update",
      entityType: "movimiento",
      entityId: last.id,
      beforeData: last,
      afterData: { ...last, monto: parsed.monto, descripcion: parsed.descripcion, categoria: parsed.categoria, empresa_nombre: parsed.empresa, moneda: parsed.moneda },
    });
    ctx.reply(`✅ Último egreso actualizado.\n\n${formatMovementSummary({ ...last, tipo: "egreso", monto: parsed.monto, descripcion: parsed.descripcion, categoria: parsed.categoria, empresa_nombre: parsed.empresa, moneda: parsed.moneda })}`, { parse_mode: "Markdown" });
  });

  bot.command("buscar", async (ctx) => {
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const query = ctx.match;
    if (!query) return ctx.reply("Indicá qué buscar. Ej: `/buscar pan`", { parse_mode: "Markdown" });
    await runMovementSearch(supabase, ctx, linked, query);
  });

  bot.callbackQuery(/^srch:(\d+):(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const offset = parseInt(ctx.match[1], 10);
    const query = ctx.match[2];
    await runMovementSearch(supabase, ctx, linked, query, offset);
  });

  bot.command("saldos", async (ctx) => {
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const text = await getSaldosText(supabase, linked);
    if (text === null) return ctx.reply("❌ No pude calcular los saldos. Intentá de nuevo.");
    for (const chunk of splitForTelegram(text)) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  });

  bot.callbackQuery("del_last", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🗑️ ¿Qué último movimiento querés borrar?", {
      reply_markup: new InlineKeyboard()
        .text("💚 Ingreso", "del_last:ingreso").text("🔴 Gasto", "del_last:egreso"),
    });
  });

  bot.callbackQuery(/^del_last:(ingreso|egreso)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
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
    const linked = await requireTelegramCan(supabase, ctx, "delete_own_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];
    const { data: rows } = await applyTelegramDataScope(
      supabase.from("movimientos").select("*").is("deleted_at", null),
      linked,
    ).eq("id", movId).limit(1);
    const movement = rows?.[0];
    if (!movement) return ctx.reply("Movimiento no encontrado.");
    await supabase.from("movimientos").update({
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: linked.userId,
    }).eq("id", movId);
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
        const { createEmpresaFromBot } = await import("./entities.ts");
        const result = await createEmpresaFromBot(supabase, inputSession.linked, value);
        await ctx.reply(result.ok ? `✅ Empresa *${escapeMd(value)}* agregada.` : "❌ No se pudo agregar la empresa. Intentá de nuevo.", { parse_mode: "Markdown" });
      } else if (inputSession.kind === "categoria") {
        const { createCategoriaFromBot } = await import("./entities.ts");
        const ok = await createCategoriaFromBot(supabase, inputSession.linked, value);
        await ctx.reply(ok ? `✅ Categoría *${escapeMd(value)}* agregada.` : "❌ No se pudo agregar la categoría. Intentá de nuevo.", { parse_mode: "Markdown" });
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
        patch.categoria = val;
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

    const processingMsg = await ctx.reply("⏳ Procesando transacción...");
    try {
      await processTelegramFinancialText(supabase, genAI, ctx, {
        text,
        originalText: text,
      });
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
    }
  });

  // Audio handlers
  bot.on("message:voice", async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
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
      await processTelegramFinancialText(supabase, genAI, ctx, {
        text: transcript,
        originalText: `[audio] ${transcript}`,
      });
    } catch (error) {
      console.error("Telegram audio processing error:", error);
      await ctx.reply("❌ No pude procesar ese audio. Probá con un audio más corto o mandamelo como texto.");
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
    }
  });

  bot.on("message:audio", async (ctx) => {
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
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
      await processTelegramFinancialText(supabase, genAI, ctx, {
        text: transcript,
        originalText: `[audio] ${transcript}`,
      });
    } catch (error) {
      console.error("Telegram audio processing error:", error);
      await ctx.reply("❌ No pude procesar ese audio. Probá con un audio más corto o mandamelo como texto.");
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
    }
  });
}
