import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import {
  pendingReportSessions,
  getReportSession,
  clearReportSession,
  type ReportSession,
} from "../sessions.ts";
import { requireLinkedAccount, replyExpiredSession } from "../utils.ts";
import { applyTelegramDataScope, type TelegramLinkRecord } from "../../server/telegramAccess.ts";
import { buildReportFile, buildSaldosReport } from "../../server/reportExports.ts";
import { filterMovementsForReport, resolveReportDateRange, buildReportSummaryText, type ReportExportRequest } from "../../reports/shared.ts";
import { buildToggleCallbackData, resolveSelectedCompanies, buildAlcanceKeyboard } from "../../server/reportBotHelpers.ts";
import { uploadFileToDrive, decryptToken } from "../../server/drive.ts";
import { can } from "../../server/permissions.ts";
import {
  buildTemporalidadKeyboard,
  buildDownloadKeyboard,
  buildTipoKeyboard,
} from "../keyboards.ts";

async function resolveTelegramDriveOwnerUserId(supabase: BotDeps["supabase"], linked: TelegramLinkRecord): Promise<string | null> {
  if (!linked.dashboardId) return linked.ownerUserId ?? linked.userId;
  const { data } = await supabase
    .from("dashboard_members")
    .select("user_id")
    .eq("dashboard_id", linked.dashboardId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1);
  return data?.[0]?.user_id ?? linked.ownerUserId ?? (linked.role === "owner" ? linked.userId : null);
}

async function canUseDriveViaTelegram(supabase: BotDeps["supabase"], linked: TelegramLinkRecord): Promise<boolean> {
  const memberCtx = {
    role: linked.role ?? ("viewer" as const),
    permissions: linked.permissions ?? {},
    user_id: linked.userId ?? linked.ownerUserId ?? "",
  };
  if (!can(memberCtx, "export_drive")) return false;

  const ownerUserId = await resolveTelegramDriveOwnerUserId(supabase, linked);
  if (!ownerUserId) return false;
  const { data } = await supabase
    .from("drive_connections")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Fetch + filter the movements for the session's period/scope/tipo. Shared by
// the chat summary (showReportSummary) and the file generation (generateAndSendReport).
async function loadReportData(supabase: BotDeps["supabase"], session: ReportSession) {
  const periodRequest: Pick<ReportExportRequest, "period" | "anchorDate" | "month" | "from" | "to"> = {
    period: session.period,
    anchorDate: session.anchorDate,
    month: session.month,
    from: session.from,
    to: session.to,
  };
  const range = resolveReportDateRange(periodRequest);
  if (!range) return null;

  const { data: movs } = await applyTelegramDataScope(
    supabase.from("movimientos").select("*").is("deleted_at", null),
    session.linked,
  );
  const companies = resolveSelectedCompanies(session.selectedCompanyIdx, session.companyChoices ?? []);
  const tipoFilter = (session.tipo && session.tipo !== "saldos") ? session.tipo : "all";
  const filters = { companies, tipo: tipoFilter as "all" | "ingreso" | "egreso", moneda: "all" as const };
  const filtered = filterMovementsForReport(movs ?? [], filters, range);
  return { range, filtered, filters };
}

// Show the report numbers in chat, then offer download (export-after-report flow).
async function showReportSummary(supabase: BotDeps["supabase"], ctx: Context, session: ReportSession) {
  const loaded = await loadReportData(supabase, session);
  if (!loaded) return ctx.reply("❌ Período inválido. Intentá de nuevo con /informes.");
  const driveAvailable = await canUseDriveViaTelegram(supabase, session.linked);
  await ctx.reply(buildReportSummaryText(loaded.filtered as any[], loaded.range.label), {
    parse_mode: "Markdown",
    reply_markup: buildDownloadKeyboard(driveAvailable),
  });
}

async function generateAndSendReport(
  supabase: BotDeps["supabase"],
  ctx: Context,
  session: ReportSession,
  format: "csv" | "pdf",
  destination: "local" | "drive",
) {
  const linked = session.linked;
  const today = new Date().toISOString().slice(0, 10);

  const loaded = await loadReportData(supabase, session);
  if (!loaded) return ctx.reply("❌ Período inválido. Intentá de nuevo con /informes.");
  const { range, filtered, filters } = loaded;
  const dateSlug = session.from ? `${session.from}_${session.to}` : (session.month ?? session.anchorDate ?? today);
  const tipoSlug = session.tipo ?? "todos";
  const fileName = `informe_${tipoSlug}_${session.period}_${dateSlug}.${format}`;

  const file = session.tipo === "saldos"
    ? buildSaldosReport({ format, fileName, periodLabel: range.label, filters, movements: filtered as any[] })
    : buildReportFile({ format, fileName, periodLabel: range.label, filters, movements: filtered as any[] });

  if (destination === "drive") {
    const ownerUserId = await resolveTelegramDriveOwnerUserId(supabase, linked);
    if (!ownerUserId) return ctx.reply("❌ No pude resolver el dueño del dashboard para usar Drive.");
    const { data: connData } = await supabase
      .from("drive_connections")
      .select("refresh_token_enc")
      .eq("owner_user_id", ownerUserId)
      .limit(1);
    const conn = connData?.[0];
    if (!conn) return ctx.reply("❌ Drive no conectado. Conectalo desde el dashboard web.");
    const tokenEncKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!tokenEncKey) return ctx.reply("❌ Error de configuración del servidor.");
    const refreshToken = decryptToken(conn.refresh_token_enc, tokenEncKey);
    const uploaded = await uploadFileToDrive({
      refreshToken,
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
      fileName,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
    const movCount = session.tipo === "saldos" ? `${filtered.length} mov.` : `${filtered.length} movimientos`;
    await ctx.reply(
      `✅ *Informe guardado en Drive*\n\n📂 ${range.label}\n${movCount}\n\n[Ver en Drive](${uploaded.webViewLink})`,
      { parse_mode: "Markdown" },
    );
  } else {
    const caption = session.tipo === "saldos"
      ? `📊 Saldos — ${range.label}`
      : `📊 ${range.label} — ${filtered.length} movimientos`;
    await ctx.replyWithDocument(new InputFile(file.buffer, fileName), { caption });
  }
}

export async function advanceToAlcance(supabase: BotDeps["supabase"], ctx: Context, session: ReportSession) {
  const linked = session.linked;
  const { data: companies } = await applyTelegramDataScope(
    supabase.from("empresas").select("id, nombre").is("deleted_at", null).order("nombre"),
    linked,
  );
  session.companyChoices = (companies ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre }));
  session.step = "alcance";
  pendingReportSessions.set(ctx.chat.id, session);
  await ctx.reply("🏢 *Alcance*\n\n¿Querés incluir todas las empresas o elegir?", {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard()
      .text("🌐 Todas las empresas", "rs:all").row()
      .text("🔍 Elegir empresas", "rs:pick").row()
      .text("← Atrás", "rb:temporalidad"),
  });
}

async function startReportFlow(supabase: BotDeps["supabase"], ctx: Context) {
  const linked = await requireLinkedAccount(supabase, ctx);
  if (!linked) return;
  clearReportSession(ctx.chat.id);
  const newSession: ReportSession = {
    step: "temporalidad",
    period: "day",
    selectedCompanyIdx: new Set(),
    linked,
    expiresAt: Date.now() + 15 * 60_000,
  };
  pendingReportSessions.set(ctx.chat.id, newSession);
  await ctx.reply("📊 *Generar informe*\n\nElegí el período:", {
    parse_mode: "Markdown",
    reply_markup: buildTemporalidadKeyboard(),
  });
}

export function registerReportHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  bot.command(["informes", "informe"], (ctx) => startReportFlow(supabase, ctx));
  bot.command("exportar", (ctx) => startReportFlow(supabase, ctx));

  bot.callbackQuery("rp_start", async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(supabase, ctx);
  });

  bot.callbackQuery("informe", async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(supabase, ctx);
  });

  bot.callbackQuery("export_csv", async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(supabase, ctx);
  });

  bot.callbackQuery(/^rp:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(supabase, ctx);
  });

  // Step 1: temporalidad
  bot.callbackQuery(/^rt:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "temporalidad") {
      return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    }
    const key = ctx.match[1] as string;
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const thisYear = today.slice(0, 4);

    if (key === "dia") {
      session.temporalidad = "por_dia";
      session.step = "date_pick";
      pendingReportSessions.set(ctx.chat.id, session);
      return ctx.reply("📅 Mandame la fecha en formato *YYYY-MM-DD* (ej: 2026-05-20):", { parse_mode: "Markdown" });
    }
    if (key === "rango") {
      session.temporalidad = "rango";
      session.period = "range";
      session.step = "date_from";
      pendingReportSessions.set(ctx.chat.id, session);
      return ctx.reply("📅 Mandame la *fecha de inicio* del rango (YYYY-MM-DD):", { parse_mode: "Markdown" });
    }
    if (key === "hoy") {
      session.temporalidad = "ultimo_dia";
      session.period = "day";
      session.anchorDate = today;
    } else if (key === "sem") {
      session.temporalidad = "ultima_semana";
      session.period = "week";
      session.anchorDate = today;
    } else if (key === "mes") {
      session.temporalidad = "ultimo_mes";
      session.period = "month";
      session.month = thisMonth;
    } else if (key === "anio") {
      session.temporalidad = "ultimo_anio";
      session.period = "range";
      session.from = `${thisYear}-01-01`;
      session.to = `${thisYear}-12-31`;
    }
    await advanceToAlcance(supabase, ctx, session);
  });

  // Step 2: alcance
  bot.callbackQuery("rs:all", async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "alcance") {
      return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    }
    session.selectedCompanyIdx = new Set();
    session.step = "tipo";
    pendingReportSessions.set(ctx.chat.id, session);
    await ctx.reply("💼 *Tipo de informe*\n\n¿Qué querés ver?", {
      parse_mode: "Markdown",
      reply_markup: buildTipoKeyboard(),
    });
  });

  bot.callbackQuery("rs:pick", async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "alcance") {
      return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    }
    session.step = "alcance_pick";
    pendingReportSessions.set(ctx.chat.id, session);
    const kb = buildAlcanceKeyboard(session.companyChoices ?? [], session.selectedCompanyIdx);
    await ctx.reply("🏢 Elegí las empresas (tocá para activar/desactivar):", {
      reply_markup: { inline_keyboard: kb.inline_keyboard },
    });
  });

  bot.callbackQuery(/^rs:tog:(\d+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "alcance_pick") return;
    const idx = parseInt(ctx.match[1], 10);
    if (session.selectedCompanyIdx.has(idx)) {
      session.selectedCompanyIdx.delete(idx);
    } else {
      session.selectedCompanyIdx.add(idx);
    }
    pendingReportSessions.set(ctx.chat.id, session);
    const kb = buildAlcanceKeyboard(session.companyChoices ?? [], session.selectedCompanyIdx);
    ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: kb.inline_keyboard } }).catch(() => {});
  });

  bot.callbackQuery("rs:done", async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "alcance_pick") {
      return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    }
    if (session.selectedCompanyIdx.size === 0) {
      return ctx.reply("⚠️ Seleccioná al menos una empresa antes de continuar.");
    }
    session.step = "tipo";
    pendingReportSessions.set(ctx.chat.id, session);
    await ctx.reply("💼 *Tipo de informe*\n\n¿Qué querés ver?", {
      parse_mode: "Markdown",
      reply_markup: buildTipoKeyboard(),
    });
  });

  // Step 3: tipo
  bot.callbackQuery(/^rk:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "tipo") {
      return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    }
    const key = ctx.match[1] as string;
    if (key === "ing") session.tipo = "ingreso";
    else if (key === "egr") session.tipo = "egreso";
    else if (key === "sal") session.tipo = "saldos";
    else return ctx.reply("Tipo inválido.");
    session.step = "download";
    pendingReportSessions.set(ctx.chat.id, session);
    await showReportSummary(supabase, ctx, session);
  });

  // Step 4: download (export-after-report) — el usuario ya vio el resumen en el chat
  // y elige cómo bajarlo. rg:<dest>:<format>
  bot.callbackQuery(/^rg:(local|drive):(csv|pdf)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "download") {
      return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    }
    const destination = ctx.match[1] as "local" | "drive";
    const format = ctx.match[2] as "csv" | "pdf";
    clearReportSession(ctx.chat.id);
    const processingMsg = await ctx.reply("⏳ Generando informe...");
    try {
      await generateAndSendReport(supabase, ctx, session, format, destination);
    } finally {
      ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    }
  });

  // Back navigation
  bot.callbackQuery(/^rb:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session) return replyExpiredSession(ctx, "rp_start", "🔄 Empezar de nuevo");
    const target = ctx.match[1];
    if (target === "temporalidad") {
      session.step = "temporalidad";
      pendingReportSessions.set(ctx.chat.id, session);
      await ctx.reply("📊 Elegí el período:", { reply_markup: buildTemporalidadKeyboard() });
    } else if (target === "alcance") {
      await advanceToAlcance(supabase, ctx, session);
    } else if (target === "tipo") {
      session.step = "tipo";
      pendingReportSessions.set(ctx.chat.id, session);
      await ctx.reply("💼 Elegí tipo de informe:", { reply_markup: buildTipoKeyboard() });
    }
  });
}
