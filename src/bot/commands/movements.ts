import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, requireLinkedAccount, escapeMd, formatMovementSummary, insertBotAuditLog, buildEmpresaSelectorKeyboard, splitForTelegram } from "../utils.ts";
import { applyTelegramDataScope, buildTelegramWriteOwnership, type TelegramLinkRecord } from "../../server/telegramAccess.ts";
import { resolveTelegramCompany, type TelegramCompanyOption } from "../../server/telegramCompanyResolution.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "../../server/gemini.ts";
import { registerMovementCallbacks } from "./movements-callbacks.ts";
import { assertBotWritable } from "../maintenance-gate.ts";

export type PendingMovementPayload = {
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

export async function getLastMovementByType(
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

export async function listTelegramCompanies(supabase: BotDeps["supabase"], linked: TelegramLinkRecord): Promise<TelegramCompanyOption[]> {
  const { data, error } = await applyTelegramDataScope(
    supabase.from("empresas").select("id, nombre, cuit, deleted_at").order("nombre", { ascending: true }),
    linked,
  ).is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((entry: any) => ({ id: entry.id, nombre: entry.nombre, cuit: entry.cuit ?? null }));
}

export async function cancelPendingTelegramMovements(supabase: BotDeps["supabase"], chatId: number) {
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

export async function getPendingTelegramMovement(supabase: BotDeps["supabase"], pendingId: string, chatId: number) {
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

export async function resolvePendingTelegramMovement(supabase: BotDeps["supabase"], pendingId: string) {
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

export function buildPendingCompanyKeyboardLocal(pendingId: string, options: Array<{ nombre: string }>) {
  const kb = new InlineKeyboard();
  options.forEach((option, index) => {
    kb.text(option.nombre, `tca:${pendingId}:${index}`);
    if ((index + 1) % 2 === 0) kb.row();
  });
  kb.row().text("Personal", `tca:${pendingId}:p`);
  return kb;
}

export async function getSaldosText(supabase: BotDeps["supabase"], linked: TelegramLinkRecord): Promise<string | null> {
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
  const { supabase, genAI } = deps;

  bot.command("borrar", async (ctx) => {
    ctx.reply("Usá `/borrar_ultimo_ingreso` o `/borrar_ultimo_egreso`.", { parse_mode: "Markdown" });
  });

  bot.command("borrar_ultimo_ingreso", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
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

  bot.command("editar_ultimo_ingreso", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
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
    if (!await assertBotWritable(ctx)) return;
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

  registerMovementCallbacks(bot, deps);
}
