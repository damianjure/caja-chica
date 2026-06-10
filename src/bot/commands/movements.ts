import { InlineKeyboard, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, requireLinkedAccount, escapeMd, formatMovementSummary, insertBotAuditLog, splitForTelegram } from "../utils.ts";
import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  canEditMovementViaTelegram,
  type TelegramLinkRecord,
} from "../../server/telegramAccess.ts";
import { resolveTelegramCompany, normalizeEmpresaName, type TelegramCompanyOption } from "../../server/telegramCompanyResolution.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse, type ReceiptItemsResult } from "../../server/gemini.ts";
import { geminiGenerateText, GeminiUnavailableError } from "../../server/geminiWithFallback.ts";
import { registerMovementCallbacks } from "./movements-callbacks.ts";
import { assertBotWritable } from "../maintenance-gate.ts";
import { buildUndoKeyboard } from "../quickActions.ts";
import { parseIntentResult, resolveIntentAction, parseReminderSlots } from "../voiceIntent.ts";
import { readReminder, writeReminder } from "../reminderPrefs.ts";
import { buildReminderStatusText, buildReminderKeyboard } from "../reminderText.ts";
import { buildGestionarKeyboard, buildMainKeyboard, buildIntentConfirmKeyboard } from "../keyboards.ts";
import { startReportFlow } from "./reports.ts";
import { startRecurringFlow, handleListRecurrentes } from "./recurring.ts";
import { createEmpresaFromBot, createCategoriaFromBot, sendEmpresasList, sendCategoriasList } from "./entities.ts";
import {
  normalizeReportSlots, normalizeRecurrenteSlots, normalizeEditSlots,
  buildReportEcho, buildRecurrenteEcho, buildEditEcho, type EditSlots,
} from "../intentSlots.ts";
import { setIntentConfirmSession } from "../sessions.ts";
import { runAskQuestion } from "./ask.ts";

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

/**
 * Reply with a confirm/cancel card for deleting the most recent movement (any type).
 * Reuses the existing `confirm_delete_mov_<id>` / `cancel_delete_mov_<id>` callbacks,
 * which perform the actual delete-permission gate. Used by the "borrar_ultimo" voice intent.
 */
export async function replyDeleteLastConfirm(
  supabase: BotDeps["supabase"],
  ctx: Context,
  linked: TelegramLinkRecord,
) {
  const { data } = await applyTelegramDataScope(
    supabase.from("movimientos").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    linked,
  ).limit(1);
  const last = data?.[0];
  if (!last) {
    await ctx.reply("No hay movimientos para borrar.");
    return;
  }
  await ctx.reply(
    `Vas a borrar este último movimiento:\n\n${formatMovementSummary(last)}`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Confirmar", `confirm_delete_mov_${last.id}`)
        .text("❌ Cancelar", `cancel_delete_mov_${last.id}`),
    },
  );
}

/**
 * Apply a single-field edit to the most recent movement (any type), from slots
 * understood by the voice/text intent router. Audited. Caller gates write permission.
 */
export async function applyEditLast(
  supabase: BotDeps["supabase"],
  ctx: Context,
  linked: TelegramLinkRecord,
  s: EditSlots,
) {
  if (!s.campo || s.valor === null) {
    await ctx.reply("No entendí qué querés cambiar. Probá de nuevo.");
    return;
  }
  const patch: Record<string, unknown> = {};
  if (s.campo === "monto") {
    const n = parseFloat(String(s.valor).replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) { await ctx.reply("❌ Monto inválido."); return; }
    patch.monto = n;
  } else if (s.campo === "moneda") {
    patch.moneda = s.valor === "USD" ? "USD" : "ARS";
  } else if (s.campo === "categoria") {
    patch.categoria = s.valor;
  } else if (s.campo === "empresa") {
    patch.empresa_nombre = s.valor;
  } else if (s.campo === "descripcion") {
    patch.descripcion = s.valor;
  }

  const { data } = await applyTelegramDataScope(
    supabase.from("movimientos").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    linked,
  ).limit(1);
  const last = data?.[0];
  if (!last) { await ctx.reply("No hay movimientos para editar."); return; }
  if (!canEditMovementViaTelegram(last, linked)) {
    await ctx.reply("🚫 Sin permiso para editar movimientos de otros.");
    return;
  }

  let updateQuery = supabase.from("movimientos").update(patch).eq("id", last.id);
  if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
  else updateQuery = updateQuery.eq("owner_user_id", linked.ownerUserId as string);
  const { error } = await updateQuery;
  if (error) {
    console.error("applyEditLast error:", error);
    await ctx.reply("❌ No pude aplicar el cambio. Intentá de nuevo.");
    return;
  }

  await insertBotAuditLog(supabase, {
    linked,
    actorUserId: linked.userId,
    action: "update",
    entityType: "movimiento",
    entityId: last.id,
    beforeData: last,
    afterData: { ...last, ...patch },
  });
  await ctx.reply(`✅ Listo.\n\n${formatMovementSummary({ ...last, ...patch })}`, { parse_mode: "Markdown" });
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

  const empresaNombre = normalizeEmpresaName(args.item.empresa);
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

/** Line-item ownership for movimiento_lineas (no created_by_user_id column). */
function telegramLineOwnership(linked: TelegramLinkRecord) {
  return linked.dashboardId && linked.userId
    ? { dashboard_id: linked.dashboardId, owner_user_id: linked.userId }
    : { owner_user_id: linked.ownerUserId };
}

/**
 * Save-first ticket persist (Telegram). Inserts one parent movimiento (the
 * total, empresa = Personal, merchant in the description — never auto-created
 * as a company) plus the extracted line items. Mirrors the web POST /ticket.
 * Returns null if there are no payable lines.
 */
export async function persistTelegramTicket(
  supabase: BotDeps["supabase"],
  args: { linked: TelegramLinkRecord; meta: ReceiptItemsResult; sourceType: string },
): Promise<{ movId: string; total: number; lineCount: number; merchant: string } | null> {
  const payable = args.meta.items.filter((it) => it.monto !== null);
  if (payable.length === 0) return null;
  const total = payable.reduce((acc, it) => acc + Math.abs(it.monto ?? 0), 0);
  const merchant = args.meta.empresa?.trim() || "Ticket";

  const { data: pData, error: pErr } = await supabase
    .from("movimientos")
    .insert([{
      ...buildTelegramWriteOwnership(args.linked),
      tipo: "egreso",
      moneda: args.meta.moneda,
      monto: total,
      categoria: payable[0]?.categoria || "Varios",
      empresa_nombre: "Personal",
      descripcion: merchant,
      original_text: `[${args.sourceType}] ${merchant}`,
      conciliado: true,
      conciliado_notas: null,
      has_lineas: true,
    }])
    .select();
  if (pErr) throw pErr;
  const parent = pData?.[0];
  if (!parent?.id) return null;

  const lineRows = payable.map((it) => ({
    ...telegramLineOwnership(args.linked),
    movimiento_id: parent.id,
    descripcion: it.descripcion,
    monto: Math.abs(it.monto ?? 0),
    categoria: it.categoria || "Varios",
    cantidad: it.cantidad ?? null,
  }));
  const { error: lErr } = await supabase.from("movimiento_lineas").insert(lineRows);
  if (lErr) {
    await supabase.from("movimientos").delete().eq("id", parent.id);
    throw lErr;
  }

  await insertBotAuditLog(supabase, {
    linked: args.linked,
    actorUserId: args.linked.userId,
    action: "create",
    entityType: "movimiento",
    entityId: parent.id,
    afterData: parent,
  });

  return { movId: parent.id, total, lineCount: lineRows.length, merchant };
}

/** Recompute a ticket parent's total from its active lines. Returns the total. */
export async function recomputeTelegramTicketTotal(
  supabase: BotDeps["supabase"],
  movId: string,
  linked: TelegramLinkRecord,
): Promise<number> {
  const { data: lines } = await applyTelegramDataScope(
    supabase.from("movimiento_lineas").select("monto").is("deleted_at", null),
    linked,
  ).eq("movimiento_id", movId);
  const rows = (lines ?? []) as Array<{ monto: number | string }>;
  const total = rows.reduce((acc, r) => acc + Number(r.monto || 0), 0);
  await applyTelegramDataScope(
    supabase.from("movimientos").update({ monto: total, has_lineas: rows.length > 0 }).eq("id", movId),
    linked,
  );
  return total;
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

export async function processTelegramFinancialText(supabase: BotDeps["supabase"], genAI: BotDeps["genAI"], genAI2: BotDeps["genAI2"], ctx: Context, args: {
  text: string;
  originalText: string;
}) {
  // Top gate is READ so viewers can use read intents (saldos/buscar/listar) by voice.
  // Write intents re-check write permission + maintenance via ensureWritable() below.
  const linked = await requireTelegramCan(supabase, ctx, "read");
  if (!linked) return;

  const ensureWritable = async (): Promise<TelegramLinkRecord | null> => {
    if (!(await assertBotWritable(ctx))) return null;
    return await requireTelegramCan(supabase, ctx, "write_movimiento");
  };

  try {
    const { data: currentCats } = await applyTelegramDataScope(
      supabase.from("categorias").select("nombre"),
      linked,
    );
    const catList = currentCats?.map(c => c.nombre).join(", ") || "Otros";

    const prompt = `Extraé los datos de este mensaje: "${args.text}"`;
    const result = await geminiGenerateText(genAI, genAI2, {
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT
          + `\nHOY ES ${new Date().toISOString().slice(0, 10)}. Para meses o fechas relativas (ej. "mayo"), usá el año actual salvo que el usuario diga otro año. Devolvé "mes" como "YYYY-MM" con año real, nunca con placeholders.`
          + `\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".`,
      },
    });
    const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const extracted = parseGeminiJsonResponse(textResponse);

    if (!extracted) {
      await ctx.reply("No pude entender el mensaje, probá reformularlo.");
      return;
    }

    const intentResult = parseIntentResult(
      { intent: extracted.intent, confidence: extracted.confidence, slots: extracted.slots },
      args.text,
    );
    const decision = resolveIntentAction(intentResult);

    // ASR / intent guard — noisy, mispronounced or ambiguous → echo + offer the menu options.
    if (decision.action === "clarify") {
      const heard = intentResult.transcript?.trim();
      const echo = heard ? `\n\nEntendí: «${escapeMd(heard)}»` : "";
      const url = process.env.DASHBOARD_URL || "https://caja-chica-bot.web.app";
      await ctx.reply(
        `🤔 No estoy seguro de haberte entendido.${echo}\n\nElegí una opción o reformulá:`,
        { parse_mode: "Markdown", reply_markup: buildMainKeyboard(url) },
      );
      return;
    }

    // Destructive → confirmation card (never auto-executes).
    if (decision.action === "confirm") {
      const linkedW = await ensureWritable();
      if (!linkedW) return;
      await replyDeleteLastConfirm(supabase, ctx, linkedW);
      return;
    }

    // decision.action === "execute"
    switch (intentResult.intent) {
      case "crear_empresa": {
        const linkedW = await ensureWritable();
        if (!linkedW) return;
        const fromSlot = typeof intentResult.slots.nombre === "string" ? intentResult.slots.nombre.trim() : "";
        const fromLegacy = typeof extracted.companyName === "string" ? extracted.companyName.trim() : "";
        const nombre = fromSlot || fromLegacy;
        if (!nombre) {
          await ctx.reply("¿Cómo se llama la empresa que querés crear?");
          return;
        }
        const r = await createEmpresaFromBot(supabase, linkedW, nombre);
        await ctx.reply(
          r.ok ? `✅ Empresa *${escapeMd(nombre)}* ${r.reused ? "ya existía." : "agregada."}` : "❌ No se pudo agregar la empresa. Intentá de nuevo.",
          { parse_mode: "Markdown" },
        );
        return;
      }
      case "crear_categoria": {
        const linkedW = await ensureWritable();
        if (!linkedW) return;
        const nombre = typeof intentResult.slots.nombre === "string" ? intentResult.slots.nombre.trim() : "";
        if (!nombre) {
          await ctx.reply("¿Cómo se llama la categoría que querés crear?");
          return;
        }
        const r = await createCategoriaFromBot(supabase, linkedW, nombre);
        await ctx.reply(
          r.ok ? `✅ Categoría *${escapeMd(nombre)}* ${r.reused ? "ya existía." : "agregada."}` : "❌ No se pudo agregar la categoría. Intentá de nuevo.",
          { parse_mode: "Markdown" },
        );
        return;
      }
      case "buscar": {
        const fromSlot = typeof intentResult.slots.query === "string" ? intentResult.slots.query.trim() : "";
        await runMovementSearch(supabase, ctx, linked, fromSlot || args.text.trim());
        return;
      }
      case "consultar": {
        const pregunta = typeof intentResult.slots.pregunta === "string" && intentResult.slots.pregunta.trim()
          ? intentResult.slots.pregunta.trim()
          : args.text.trim();
        await runAskQuestion({ supabase, genAI, genAI2 }, ctx, linked, pregunta.slice(0, 500));
        return;
      }
      case "saldos": {
        const saldosText = await getSaldosText(supabase, linked);
        if (!saldosText) {
          await ctx.reply("No pude calcular los saldos. Intentá de nuevo.");
          return;
        }
        for (const chunk of splitForTelegram(saldosText)) {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        }
        return;
      }
      case "listar_empresas":
        await sendEmpresasList(supabase, ctx);
        return;
      case "listar_categorias":
        await sendCategoriasList(supabase, ctx);
        return;
      case "informe": {
        const norm = normalizeReportSlots(intentResult.slots);
        if (norm.missing.length > 0) {
          await startReportFlow(supabase, ctx);
          return;
        }
        setIntentConfirmSession(ctx.chat.id, "informe", intentResult.slots, linked);
        await ctx.reply(`${buildReportEcho(norm.value)}\n\n¿Confirmás o editás?`, {
          reply_markup: buildIntentConfirmKeyboard(),
        });
        return;
      }
      case "recurrente_nuevo": {
        const norm = normalizeRecurrenteSlots(intentResult.slots);
        if (norm.missing.length > 0) {
          await startRecurringFlow(supabase, ctx);
          return;
        }
        setIntentConfirmSession(ctx.chat.id, "recurrente_nuevo", intentResult.slots, linked);
        await ctx.reply(`${buildRecurrenteEcho(norm.value)}\n\n¿Confirmás o editás?`, {
          reply_markup: buildIntentConfirmKeyboard(),
        });
        return;
      }
      case "listar_recurrentes":
        await handleListRecurrentes(supabase, ctx);
        return;
      case "editar_ultimo": {
        const norm = normalizeEditSlots(intentResult.slots);
        if (!norm.valid) {
          await ctx.reply("✏️ ¿Qué querés cambiar del último movimiento? Tocá *Editar último*:", {
            parse_mode: "Markdown",
            reply_markup: buildGestionarKeyboard(),
          });
          return;
        }
        setIntentConfirmSession(ctx.chat.id, "editar_ultimo", intentResult.slots, linked);
        await ctx.reply(`${buildEditEcho(norm.value)}\n\n¿Confirmás o editás?`, {
          reply_markup: buildIntentConfirmKeyboard(),
        });
        return;
      }
      case "abrir_dashboard": {
        const url = process.env.DASHBOARD_URL || "https://caja-chica-bot.web.app";
        await ctx.reply(`🔗 [Abrir Dashboard Web](${url})`, { parse_mode: "Markdown" });
        return;
      }
      case "recordatorio_config": {
        const patch = parseReminderSlots(intentResult.slots);
        if (!patch) {
          await ctx.reply("No te entendí el recordatorio. Probá /recordatorio para verlo con botones.");
          return;
        }
        const userId = linked.userId ?? linked.ownerUserId;
        if (!userId) {
          await ctx.reply("No se pudo identificar tu cuenta.");
          return;
        }
        const saved = await writeReminder(supabase, userId, patch);
        if (!saved) {
          await ctx.reply("Para configurar el recordatorio, entrá una vez a la web con este mismo mail y volvé a probar acá.");
          return;
        }
        const state = await readReminder(supabase, userId);
        await ctx.reply(buildReminderStatusText(state), { parse_mode: "Markdown", reply_markup: buildReminderKeyboard(state) });
        return;
      }
      case "movimiento":
      default: {
        const linkedW = await ensureWritable();
        if (!linkedW) return;
        if (!Array.isArray(extracted.items) || extracted.items.length === 0) {
          await ctx.reply("⚠️ No pude entender bien ese movimiento. ¿Podrás ser más específico?");
          return;
        }
        const companies = await listTelegramCompanies(supabase, linkedW);
        for (const rawItem of extracted.items) {
          const item = rawItem as { monto: number; tipo: "ingreso" | "egreso"; moneda: "ARS" | "USD"; categoria: string; empresa: string | null; descripcion: string };
          const companyResolution = resolveTelegramCompany(item, companies);
          // F — never block on company. Use an exact/fuzzy match if there is one;
          // otherwise fall through to Personal (normalized on save). The user can
          // fix it afterwards with the "Cambiar empresa" button — the load is
          // never interrupted by a question.
          if (companyResolution.kind === "exact" || companyResolution.kind === "suggest") {
            item.empresa = companyResolution.company.nombre;
          }

          const { created, finalCategory, empresaNombre, icon } = await persistTelegramMovement(supabase, {
            linked: linkedW,
            item,
            originalText: args.originalText,
          });

          const movId = created?.id as string | undefined;
          const confirmKb = movId
            ? { inline_keyboard: [
                [
                  { text: "✏️ Categoría", callback_data: `change_cat_${movId}` },
                  { text: "🏢 Empresa", callback_data: `change_emp_${movId}` },
                ],
                ...buildUndoKeyboard(movId).inline_keyboard,
              ] }
            : undefined;

          const tipoLabel = item.tipo === "ingreso" ? "Ingreso" : "Gasto";
          await ctx.reply(`${icon} *${tipoLabel}:* ${escapeMd(item.descripcion ?? "")}\n💰 ${item.monto} ${item.moneda}\n📁 Categoría: ${escapeMd(finalCategory ?? "")}\n🏢 Empresa: ${escapeMd(empresaNombre ?? "")}`, {
            parse_mode: "Markdown",
            reply_markup: confirmKb,
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      await ctx.reply(
        "⚠️ La IA no está disponible ahora mismo \\(cuota agotada\\)\\. Intentá de nuevo en unos minutos o cargá el movimiento desde el dashboard web\\.",
        { parse_mode: "MarkdownV2" },
      );
      return;
    }
    console.error(err);
    await ctx.reply("❌ Hubo un error procesando tu mensaje.");
  }
}

export function registerMovementHandlers(bot: Bot, deps: BotDeps) {
  const { supabase, genAI, genAI2 } = deps;

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
    if (!canEditMovementViaTelegram(last, linked)) {
      return ctx.reply("🚫 Sin permiso para editar movimientos de otros.");
    }
    let updateQuery = supabase.from("movimientos").update({
      monto: parsed.monto,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      empresa_nombre: parsed.empresa,
      moneda: parsed.moneda,
    }).eq("id", last.id);
    if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
    else updateQuery = updateQuery.eq("owner_user_id", linked.ownerUserId as string);
    const { error: updateError } = await updateQuery;
    if (updateError) {
      console.error("editar_ultimo_ingreso update error:", updateError);
      return ctx.reply("❌ No pude actualizar el ingreso. Intentá de nuevo.");
    }
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
    if (!canEditMovementViaTelegram(last, linked)) {
      return ctx.reply("🚫 Sin permiso para editar movimientos de otros.");
    }
    let updateQuery = supabase.from("movimientos").update({
      monto: parsed.monto,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      empresa_nombre: parsed.empresa,
      moneda: parsed.moneda,
    }).eq("id", last.id);
    if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
    else updateQuery = updateQuery.eq("owner_user_id", linked.ownerUserId as string);
    const { error: updateError } = await updateQuery;
    if (updateError) {
      console.error("editar_ultimo_egreso update error:", updateError);
      return ctx.reply("❌ No pude actualizar el gasto. Intentá de nuevo.");
    }
    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "update",
      entityType: "movimiento",
      entityId: last.id,
      beforeData: last,
      afterData: { ...last, monto: parsed.monto, descripcion: parsed.descripcion, categoria: parsed.categoria, empresa_nombre: parsed.empresa, moneda: parsed.moneda },
    });
    ctx.reply(`✅ Último gasto actualizado.\n\n${formatMovementSummary({ ...last, tipo: "egreso", monto: parsed.monto, descripcion: parsed.descripcion, categoria: parsed.categoria, empresa_nombre: parsed.empresa, moneda: parsed.moneda })}`, { parse_mode: "Markdown" });
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
