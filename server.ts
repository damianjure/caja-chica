import { Bot, InlineKeyboard, InputFile, webhookCallback } from "grammy";
import cron from "node-cron";

loadRuntimeEnv();

// --- SERVICES ---
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";
import { createApp } from "./src/server/app.ts";
import { transcribeTelegramAudioWithGemini } from "./src/server/telegramAudio.ts";
import { resolveTelegramCompany, type TelegramCompanyOption } from "./src/server/telegramCompanyResolution.ts";
import { loadRuntimeEnv } from "./src/server/env.ts";
import { SYSTEM_PROMPT, parseGeminiJsonResponse } from "./src/server/gemini.ts";
import { extractFromPhoto, extractFromMultiplePhotos, inferMediaMimeType, SUPPORTED_DOCUMENT_MIME_TYPES } from "./src/server/telegramMedia.ts";
import { MediaGroupBuffer } from "./src/server/mediaGroupBuffer.ts";
import {
  createPendingExtraction,
  getPendingExtraction,
  getPendingExtractionByChat,
  updatePendingExtraction,
  deletePendingExtraction,
  buildReviewCardText,
  buildReviewKeyboard,
  startExtractionSweep,
  type ExtractionField,
} from "./src/server/extractionReview.ts";
import type { PendingExtractionData } from "./src/server/validation.ts";
import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  hasTelegramAccess,
  resolveTelegramIdentityByChatId,
  resolveTelegramIdentityByToken,
  type TelegramLinkRecord,
} from "./src/server/telegramAccess.ts";
import { buildReportFile } from "./src/server/reportExports.ts";
import { filterMovementsForReport, resolveReportDateRange, type ReportExportRequest } from "./src/reports/shared.ts";
import { uploadFileToDrive, decryptToken } from "./src/server/drive.ts";
import { can, type TelegramAction } from "./src/server/permissions.ts";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServerKey) {
  console.error("❌ SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas. El proceso no puede continuar sin ellas.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServerKey);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const dashboardUrl = process.env.DASHBOARD_URL || "https://balancediario.web.app";

// --- TELEGRAM BOT LOGIC ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new Bot(botToken) : null;

if (bot) {
  console.log("🤖 Configurando Bot de Telegram...");

  async function insertBotAuditLog(args: {
    linked: TelegramLinkRecord;
    actorUserId: string | null;
    action: "create" | "update" | "delete";
    entityType: "movimiento" | "empresa";
    entityId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) {
    try {
      await supabase.from("audit_logs").insert([{
        dashboard_id: args.linked.dashboardId,
        actor_user_id: args.actorUserId,
        source: "telegram",
        action: args.action,
        entity_type: args.entityType,
        entity_id: args.entityId,
        before_data: args.beforeData ?? null,
        after_data: args.afterData ?? null,
        created_at: new Date().toISOString(),
      }]);
    } catch (error) {
      console.error("Audit log telegram error:", error);
    }
  }

  async function createBotEmpresaBackup(args: {
    linked: TelegramLinkRecord;
    actorUserId: string | null;
    empresa: Record<string, unknown>;
    movimientosSnapshot: unknown[];
  }) {
    try {
      await supabase.from("empresa_delete_backups").insert([{
        dashboard_id: args.linked.dashboardId,
        empresa_id: args.empresa.id,
        empresa_data: args.empresa,
        related_movimientos_snapshot: args.movimientosSnapshot,
        deleted_by_user_id: args.actorUserId,
        source: "telegram",
        created_at: new Date().toISOString(),
      }]);
    } catch (error) {
      console.error("Empresa backup telegram error:", error);
    }
  }

  async function getLastMovementByType(
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

  function formatMovementSummary(mov: any) {
    return `${mov.tipo === "ingreso" ? "🟢" : "🔴"} ${mov.monto} ${mov.moneda}\n🏢 ${mov.empresa_nombre || "Personal"}\n📁 ${mov.categoria || "Otros"}\n📝 ${mov.descripcion}`;
  }

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

  async function listTelegramCompanies(linked: TelegramLinkRecord): Promise<TelegramCompanyOption[]> {
    const { data, error } = await applyTelegramDataScope(
      supabase.from("empresas").select("id, nombre, deleted_at").order("nombre", { ascending: true }),
      linked,
    ).is("deleted_at", null);
    if (error) throw error;
    return (data ?? []).map((entry: any) => ({ id: entry.id, nombre: entry.nombre }));
  }

  async function persistTelegramMovement(args: {
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
      await insertBotAuditLog({
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

  async function cancelPendingTelegramMovements(chatId: number) {
    await supabase
      .from("telegram_pending_movements")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("chat_id", chatId)
      .eq("status", "pending");
  }

  async function createPendingTelegramMovement(args: {
    linked: TelegramLinkRecord;
    chatId: number;
    payload: PendingMovementPayload;
  }) {
    await cancelPendingTelegramMovements(args.chatId);
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

  async function getPendingTelegramMovement(pendingId: string, chatId: number) {
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

  async function resolvePendingTelegramMovement(pendingId: string) {
    await supabase
      .from("telegram_pending_movements")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", pendingId);
  }

  function buildPendingCompanyKeyboard(pendingId: string, options: Array<{ nombre: string }>) {
    const kb = new InlineKeyboard();
    options.forEach((option, index) => {
      kb.text(option.nombre, `tca:${pendingId}:${index}`);
      if ((index + 1) % 2 === 0) kb.row();
    });
    kb.row().text("Personal", `tca:${pendingId}:p`);
    return kb;
  }

  async function askTelegramCompanyAssignment(args: {
    ctx: any;
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

    const pendingId = await createPendingTelegramMovement({
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
        reply_markup: buildPendingCompanyKeyboard(pendingId, payload.options),
      },
    );
    return true;
  }

  async function getLinkedTelegramUser(chatId: number) {
    return resolveTelegramIdentityByChatId(supabase, chatId);
  }

  async function requireLinkedAccount(ctx: any) {
    const linked = await getLinkedTelegramUser(ctx.chat.id);
    if (!hasTelegramAccess(linked)) {
      await ctx.reply(
        "🔒 Este chat todavía no está vinculado a una cuenta autorizada.\n\nEntrá al dashboard, generá tu vínculo de Telegram y volvé a mandar el comando /start con el código que te da la app.",
      );
      return null;
    }
    return linked;
  }

  async function requireTelegramCan(
    ctx: any,
    action: TelegramAction,
  ): Promise<TelegramLinkRecord | null> {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return null;

    // WARNING-21: role can be null for legacy usuarios — default to "viewer" so can() behaves safely
    const memberCtx = {
      role: linked.role ?? ("viewer" as const),
      permissions: linked.permissions ?? {},
      user_id: linked.userId ?? linked.ownerUserId ?? "",
    };

    if (!can(memberCtx, action)) {
      const msgs: Partial<Record<TelegramAction, string>> = {
        write_movimiento: "👀 Solo lectura. Pedile permiso de editor al dueño del dashboard.",
        delete_own_movimiento: "👀 Sin permiso para borrar.",
        delete_any_movimiento: "🚫 Sin permiso para borrar movimientos de otros.",
        delete_empresa: "🚫 Solo el dueño del dashboard puede borrar empresas.",
        export_drive: "🚫 Sin permiso para subir a Google Drive.",
        invite_telegram: "🚫 Sin permiso para invitar por Telegram.",
      };
      await ctx.reply(msgs[action] ?? "❌ Sin permiso para esta acción.");
      return null;
    }
    return linked;
  }

  // --- REPORT FLOW STATE ---

  interface ReportSession {
    step: "format" | "date_from" | "date_to";
    period: "day" | "week" | "month" | "range";
    anchorDate?: string;
    month?: string;
    from?: string;
    to?: string;
    format?: "csv" | "pdf";
    linked: TelegramLinkRecord;
    expiresAt: number;
  }

  const mediaGroupBuffer = new MediaGroupBuffer<{ filePath: string; mimeType: string; chatCtx: any }>({ debounceMs: 1500 });
  startExtractionSweep();

  const pendingReportSessions = new Map<number, ReportSession>();

  // WARNING-9: evict expired entries every 5 minutes to prevent unbounded growth
  setInterval(() => {
    const now = Date.now();
    for (const [chatId, s] of pendingReportSessions) {
      if (now > s.expiresAt) pendingReportSessions.delete(chatId);
    }
  }, 5 * 60_000);

  function getReportSession(chatId: number): ReportSession | null {
    const s = pendingReportSessions.get(chatId);
    if (!s) return null;
    if (Date.now() > s.expiresAt) { pendingReportSessions.delete(chatId); return null; }
    return s;
  }

  function clearReportSession(chatId: number) { pendingReportSessions.delete(chatId); }

  async function canUseDriveViaTelegram(linked: TelegramLinkRecord): Promise<boolean> {
    const memberCtx = {
      role: linked.role ?? ("viewer" as const),
      permissions: linked.permissions ?? {},
      user_id: linked.userId ?? linked.ownerUserId ?? "",
    };
    if (!can(memberCtx, "export_drive")) return false;

    const ownerUserId = linked.ownerUserId ?? linked.userId;
    if (!ownerUserId) return false;
    const { data } = await supabase
      .from("drive_connections")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  async function generateAndSendReport(
    ctx: any,
    session: ReportSession,
    format: "csv" | "pdf",
    destination: "local" | "drive",
  ) {
    const linked = session.linked;
    const today = new Date().toISOString().slice(0, 10);

    const periodRequest: Pick<ReportExportRequest, "period" | "anchorDate" | "month" | "from" | "to"> = {
      period: session.period,
      anchorDate: session.anchorDate,
      month: session.month,
      from: session.from,
      to: session.to,
    };

    const range = resolveReportDateRange(periodRequest);
    if (!range) return ctx.reply("❌ Período inválido. Intentá de nuevo con /informes.");

    const { data: movs } = await applyTelegramDataScope(
      supabase.from("movimientos").select("*").is("deleted_at", null),
      linked,
    );

    const filtered = filterMovementsForReport(movs ?? [], { company: "all", tipo: "all", moneda: "all" }, range);
    const dateSlug = session.from ? `${session.from}_${session.to}` : (session.month ?? session.anchorDate ?? today);
    const fileName = `informe_${session.period}_${dateSlug}.${format}`;

    const file = buildReportFile({
      format,
      fileName,
      periodLabel: range.label,
      filters: { company: "all", tipo: "all", moneda: "all" },
      movements: filtered as any[],
    });

    if (destination === "drive") {
      const ownerUserId = linked.ownerUserId ?? linked.userId;
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
      await ctx.reply(
        `✅ *Informe guardado en Drive*\n\n📂 ${range.label}\n${filtered.length} movimientos\n\n[Ver en Drive](${uploaded.webViewLink})`,
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.replyWithDocument(new InputFile(file.buffer, fileName), {
        caption: `📊 ${range.label} — ${filtered.length} movimientos`,
      });
    }
  }

  function buildPeriodKeyboard() {
    return new InlineKeyboard()
      .text("📅 Hoy", "rp:day").text("📅 Esta semana", "rp:week").row()
      .text("📅 Este mes", "rp:month").text("📅 Este año", "rp:year").row()
      .text("📅 Rango personalizado", "rp:range");
  }

  function buildFormatKeyboard() {
    return new InlineKeyboard()
      .text("📊 CSV", "rf:csv").text("📄 PDF", "rf:pdf");
  }

  function buildDestinationKeyboard() {
    return new InlineKeyboard()
      .text("⬇️ Descargar acá", "rd:local").text("☁️ Guardar en Drive", "rd:drive");
  }

  async function startReportFlow(ctx: any) {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    clearReportSession(ctx.chat.id);
    await ctx.reply("📊 *Generar informe*\n\nElegí el período:", {
      parse_mode: "Markdown",
      reply_markup: buildPeriodKeyboard(),
    });
  }

  // --- END REPORT FLOW STATE ---

  const mainKeyboard = new InlineKeyboard()
    .text("📋 Menú", "menu").row()
    .text("📊 Informe", "rp_start").text("🏢 Empresas", "empresas").row()
    .text("📁 Categorías", "categorias").text("💰 Saldos", "saldos").row()
    .text("🔍 Buscar", "buscar_mode").text("🗑️ Últ. egreso", "borrar_last_egreso").row()
    .text("📤 Exportar", "rp_start").row()
    .url("🌐 Abrir Dashboard", dashboardUrl);

  const BOT_COMMANDS = [
    { command: "menu", description: "Abrir el menú principal" },
    { command: "informes", description: "Generar informe por período" },
    { command: "exportar", description: "Exportar informe (CSV o PDF)" },
    { command: "recurrente", description: "Configurar gasto/ingreso recurrente" },
    { command: "empresas", description: "Listar empresas activas" },
    { command: "categorias", description: "Listar categorías" },
    { command: "saldos", description: "Ver saldos por empresa" },
    { command: "buscar", description: "Buscar movimientos" },
    { command: "agregarempresa", description: "Crear una empresa" },
    { command: "agregarcategoria", description: "Crear una categoría" },
    { command: "dashboard", description: "Abrir dashboard web" },
  ];

  async function registerBotCommands(attempts = 3): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await bot.api.setMyCommands(BOT_COMMANDS);
        console.log("✅ Telegram commands registered successfully");
        return;
      } catch (error) {
        console.error(`Telegram setMyCommands attempt ${i + 1}/${attempts} failed:`, error);
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    console.error("❌ Failed to register Telegram commands after all attempts");
  }

  void registerBotCommands();

  async function handleTelegramInviteToken(ctx: any, token: string): Promise<boolean> {
    const { data: tokenRows } = await supabase
      .from("telegram_invite_tokens")
      .select("id, dashboard_id, target_user_id, expires_at, status")
      .eq("token", token)
      .eq("status", "pending")
      .limit(1);

    const inviteToken = tokenRows?.[0];
    if (!inviteToken) return false; // not an invite token, let existing flow handle

    if (new Date(inviteToken.expires_at) < new Date()) {
      await supabase
        .from("telegram_invite_tokens")
        .update({ status: "expired" })
        .eq("id", inviteToken.id);
      await ctx.reply("⏰ El link de invitación venció. Pedile uno nuevo al dueño del dashboard.");
      return true;
    }

    const telegramUserId = ctx.from?.id;
    const telegramUsername = ctx.from?.username ?? null;

    if (!telegramUserId) {
      await ctx.reply("❌ No se pudo identificar tu usuario de Telegram.");
      return true;
    }

    // CRITICAL-2: reject if this Telegram account already has an active link
    const { data: existingLinks } = await supabase
      .from("telegram_links")
      .select("id")
      .eq("telegram_user_id", telegramUserId)
      .neq("status", "revoked")
      .limit(1);
    if (existingLinks && existingLinks.length > 0) {
      await ctx.reply(
        "⚠️ Esta cuenta de Telegram ya está vinculada. Desvincúlala primero desde el dashboard.",
      );
      return true;
    }

    // Plain INSERT — the pivot guard above already confirmed no active/pending row exists.
    // Relying on partial-index upsert (onConflict) is unreliable with PostgREST partial indexes.
    const { error: insertErr } = await supabase
      .from("telegram_links")
      .insert({
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        dashboard_id: inviteToken.dashboard_id,
        app_user_id: inviteToken.target_user_id,
        status: "pending_owner_confirm",
        linked_at: null,
      });
    if (insertErr) {
      console.error("[handleTelegramInviteToken] insert failed:", insertErr);
      await ctx.reply("❌ Error al procesar la solicitud. Intentá de nuevo.");
      return true;
    }

    await supabase
      .from("telegram_invite_tokens")
      .update({ status: "claimed" })
      .eq("id", inviteToken.id);

    await ctx.reply(
      "✅ Solicitud enviada. El dueño del dashboard necesita confirmarte. Te avisamos cuando esté listo.",
    );
    return true;
  }

  bot.command("start", async (ctx) => {
    const token = ctx.match?.trim();

    if (token) {
      // Check invite token flow first (multiuser)
      const handledAsInvite = await handleTelegramInviteToken(ctx, token);
      if (handledAsInvite) return;

      let target;
      try {
        target = await resolveTelegramIdentityByToken(supabase, token);
      } catch (tokenError) {
        console.error(tokenError);
        return ctx.reply("❌ No pude validar el código de conexión.");
      }

      // WARNING-14: null expiry is treated as expired — no bypass allowed
      const isValid =
        hasTelegramAccess(target) &&
        target.linkTokenExpiresAt !== null &&
        new Date(target.linkTokenExpiresAt).getTime() > Date.now();

      if (!isValid) {
        return ctx.reply(
          "⚠️ Ese código de vínculo es inválido o venció. Generá uno nuevo desde el dashboard.",
        );
      }

      await supabase
        .from("usuarios")
        .update({
          chat_id: ctx.chat.id,
          username: ctx.from?.username || ctx.from?.first_name || "Usuario",
          linked_at: new Date().toISOString(),
          link_token: null,
          link_token_expires_at: null,
        })
        .eq("id", target.id as string);

      return ctx.reply(
        "✅ Chat vinculado con éxito.\n\nA partir de ahora este bot va a operar solamente sobre tus datos.",
        { reply_markup: mainKeyboard },
      );
    }

    const linked = await getLinkedTelegramUser(ctx.chat.id);
    if (hasTelegramAccess(linked)) {
      return ctx.reply(
        "¡Hola de nuevo! Este chat ya está vinculado a tu cuenta. 💸\n\nUsá /menu para ver más opciones.",
        { reply_markup: mainKeyboard },
      );
    }

    ctx.reply(
      "🔒 Este bot ahora es multiusuario privado.\n\nPrimero entrá al dashboard, generá el vínculo de Telegram y después mandame el comando /start con el código que te da la app.",
    );
  });

  bot.command("menu", (ctx) => ctx.reply("📋 *Menú Principal*", { 
    parse_mode: "Markdown",
    reply_markup: mainKeyboard 
  }));

  bot.command("informes", (ctx) => startReportFlow(ctx));
  bot.command("exportar", (ctx) => startReportFlow(ctx));

  bot.command("empresas", async (ctx) => {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    const { data: emps } = await applyTelegramDataScope(
      supabase.from('empresas').select('nombre'),
      linked,
    ).is('deleted_at', null);
    const list = emps?.map(e => `• ${e.nombre}`).join('\n') || "Sin empresas.";
    ctx.reply(`🏢 *Empresas registradas:*\n\n${list}\n\nUsá /agregarempresa [nombre] para sumar una.`, { parse_mode: "Markdown" });
  });

  bot.command("categorias", async (ctx) => {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    const { data: cats } = await applyTelegramDataScope(
      supabase.from('categorias').select('nombre'),
      linked,
    );
    const list = cats?.map(c => `• ${c.nombre}`).join('\n') || "Sin categorías.";
    ctx.reply(`📁 *Categorías registradas:*\n\n${list}`, { parse_mode: "Markdown" });
  });

  bot.command("agregarempresa", async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarempresa Mi Negocio`", { parse_mode: "Markdown" });
    const payload = { nombre: name, ...buildTelegramWriteOwnership(linked) };
    const { data } = await supabase.from('empresas').insert([payload]).select();
    const created = data?.[0];
    if (created?.id) {
      await insertBotAuditLog({
        linked,
        actorUserId: linked.userId,
        action: "create",
        entityType: "empresa",
        entityId: created.id,
        afterData: created,
      });
    }
    ctx.reply(`✅ Empresa *${name}* agregada.`, { parse_mode: "Markdown" });
  });

  bot.command("borrar", async (ctx) => {
    ctx.reply("Usá `/borrar_ultimo_ingreso` o `/borrar_ultimo_egreso`.", { parse_mode: "Markdown" });
  });

  bot.command("borrar_ultimo_ingreso", async (ctx) => {
    const linked = await requireTelegramCan(ctx, "delete_own_movimiento");
    if (!linked) return;
    const last = await getLastMovementByType(linked, "ingreso");
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
    const linked = await requireTelegramCan(ctx, "delete_own_movimiento");
    if (!linked) return;
    const last = await getLastMovementByType(linked, "egreso");
    if (!last) return ctx.reply("No hay egresos para borrar.");
    await ctx.reply(
      `Vas a borrar este último egreso:\n\n${formatMovementSummary(last)}`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_mov_${last.id}`)
          .text("❌ Cancelar", `cancel_delete_mov_${last.id}`),
      },
    );
  });

  bot.command("editar_ultimo_ingreso", async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const parsed = parseTelegramMovementEditInput(ctx.match);
    if (!parsed) {
      return ctx.reply(
        "Uso: `/editar_ultimo_ingreso monto | descripcion | categoria | empresa | moneda`\nEj: `/editar_ultimo_ingreso 50000 | Venta mostrador | Ventas | Taller | ARS`",
        { parse_mode: "Markdown" },
      );
    }
    const last = await getLastMovementByType(linked, "ingreso");
    if (!last) return ctx.reply("No hay ingresos para editar.");
    // WARNING-17: scope the update to the same dashboard to prevent cross-dashboard writes
    let updateQuery = supabase.from("movimientos").update({
      monto: parsed.monto,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      empresa_nombre: parsed.empresa,
      moneda: parsed.moneda,
    }).eq("id", last.id);
    if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
    await updateQuery;
    await insertBotAuditLog({
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
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const parsed = parseTelegramMovementEditInput(ctx.match);
    if (!parsed) {
      return ctx.reply(
        "Uso: `/editar_ultimo_egreso monto | descripcion | categoria | empresa | moneda`\nEj: `/editar_ultimo_egreso 12000 | Compra insumos | Compras | Taller | ARS`",
        { parse_mode: "Markdown" },
      );
    }
    const last = await getLastMovementByType(linked, "egreso");
    if (!last) return ctx.reply("No hay egresos para editar.");
    // WARNING-17: scope the update to the same dashboard to prevent cross-dashboard writes
    let updateQuery = supabase.from("movimientos").update({
      monto: parsed.monto,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      empresa_nombre: parsed.empresa,
      moneda: parsed.moneda,
    }).eq("id", last.id);
    if (linked.dashboardId) updateQuery = updateQuery.eq("dashboard_id", linked.dashboardId);
    await updateQuery;
    await insertBotAuditLog({
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

  bot.command("borrarempresa", async (ctx) => {
    const linked = await requireTelegramCan(ctx, "delete_empresa");
    if (!linked) return;
    const name = ctx.match?.trim();
    if (!name) {
      return ctx.reply("Uso: `/borrarempresa Nombre Empresa`", { parse_mode: "Markdown" });
    }
    const { data: rows } = await applyTelegramDataScope(
      supabase.from("empresas").select("*"),
      linked,
    )
      .eq("nombre", name)
      .is("deleted_at", null)
      .limit(1);
    const empresa = rows?.[0];
    if (!empresa) return ctx.reply("No encontré esa empresa activa.");
    await ctx.reply(
      `Vas a desactivar esta empresa:\n\n🏢 *${empresa.nombre}*\n\nSe va a crear backup antes del soft delete.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_emp_${empresa.id}`)
          .text("❌ Cancelar", `cancel_delete_emp_${empresa.id}`),
      },
    );
  });

  bot.command("dashboard", (ctx) => {
    ctx.reply(`🔗 [Abrir Dashboard Web](${dashboardUrl})`, { parse_mode: "Markdown" });
  });

  bot.command("buscar", async (ctx) => {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    const query = ctx.match;
    if (!query) return ctx.reply("Indicá qué buscar. Ej: `/buscar pan`", { parse_mode: "Markdown" });
    
    const { data: results } = await applyTelegramDataScope(
      supabase.from('movimientos').select('*').is('deleted_at', null),
      linked,
    )
      .ilike('descripcion', `%${query}%`)
      .limit(10);

    if (!results || results.length === 0) return ctx.reply("No se encontraron movimientos.");

    let text = `🔍 *Resultados para "${query}":*\n\n`;
    results.forEach(m => {
      const icon = m.tipo === 'ingreso' ? '🟢' : '🔴';
      text += `${icon} ${m.monto} ${m.moneda} - ${m.descripcion} (${m.categoria})\n`;
    });
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  async function getSaldosText(linked: TelegramLinkRecord) {
    const { data: emps } = await applyTelegramDataScope(
      supabase.from('empresas').select('nombre').is('deleted_at', null),
      linked,
    );
    const { data: movs } = await applyTelegramDataScope(
      supabase.from('movimientos').select('*').is('deleted_at', null),
      linked,
    );

    let text = "💰 *Saldos por Empresa:*\n\n";
    const companies = ["Personal", ...(emps?.map(e => e.nombre) || [])];
    
    companies.forEach(company => {
      const cMovs = movs?.filter(m => m.empresa_nombre === company) || [];
      const totalARS = cMovs.reduce((acc, m) => acc + (m.moneda === 'ARS' ? (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)) : 0), 0);
      const totalUSD = cMovs.reduce((acc, m) => acc + (m.moneda === 'USD' ? (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)) : 0), 0);
      
      if (totalARS !== 0 || totalUSD !== 0) {
        text += `🏢 *${company}*\n`;
        text += `   🇦🇷 ARS: $${totalARS.toLocaleString()}\n`;
        text += `   🇺🇸 USD: u$s${totalUSD.toLocaleString()}\n\n`;
      }
    });
    return text;
  }

  bot.command("saldos", async (ctx) => {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    const text = await getSaldosText(linked);
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  // --- RECURRENTE GUIDED FLOW ---

  interface RecurrenceSession {
    step: "monto" | "tipo" | "moneda" | "frecuencia" | "descripcion";
    monto?: number;
    tipo?: "ingreso" | "egreso";
    moneda?: "ARS" | "USD";
    frecuencia?: "diario" | "semanal" | "mensual";
    linked: TelegramLinkRecord;
    expiresAt: number;
  }

  const pendingRecurrenceSessions = new Map<number, RecurrenceSession>();

  // WARNING-9: evict expired entries every 5 minutes to prevent unbounded growth
  setInterval(() => {
    const now = Date.now();
    for (const [chatId, s] of pendingRecurrenceSessions) {
      if (now > s.expiresAt) pendingRecurrenceSessions.delete(chatId);
    }
  }, 5 * 60_000);

  function getRecurrenceSession(chatId: number): RecurrenceSession | null {
    const s = pendingRecurrenceSessions.get(chatId);
    if (!s) return null;
    if (Date.now() > s.expiresAt) { pendingRecurrenceSessions.delete(chatId); return null; }
    return s;
  }

  bot.command("recurrente", async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    pendingRecurrenceSessions.set(ctx.chat.id, {
      step: "monto",
      linked,
      expiresAt: Date.now() + 10 * 60_000,
    });
    await ctx.reply("🔄 *Nuevo recurrente*\n\nMandame el *monto* (ej: `1500` o `50`):", { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^rec_tipo:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session || session.step !== "tipo") return ctx.reply("Sesión vencida. Usá /recurrente para empezar.");
    session.tipo = ctx.match[1] as "ingreso" | "egreso";
    session.step = "moneda";
    pendingRecurrenceSessions.set(ctx.chat.id, session);
    await ctx.reply("💱 ¿En qué moneda?", {
      reply_markup: new InlineKeyboard()
        .text("🇦🇷 ARS", "rec_moneda:ARS").text("🇺🇸 USD", "rec_moneda:USD"),
    });
  });

  bot.callbackQuery(/^rec_moneda:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session || session.step !== "moneda") return ctx.reply("Sesión vencida. Usá /recurrente para empezar.");
    session.moneda = ctx.match[1] as "ARS" | "USD";
    session.step = "frecuencia";
    pendingRecurrenceSessions.set(ctx.chat.id, session);
    await ctx.reply("📅 ¿Con qué frecuencia?", {
      reply_markup: new InlineKeyboard()
        .text("📆 Diario", "rec_frec:diario").text("📆 Semanal", "rec_frec:semanal").text("📆 Mensual", "rec_frec:mensual"),
    });
  });

  bot.callbackQuery(/^rec_frec:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getRecurrenceSession(ctx.chat.id);
    if (!session || session.step !== "frecuencia") return ctx.reply("Sesión vencida. Usá /recurrente para empezar.");
    session.frecuencia = ctx.match[1] as "diario" | "semanal" | "mensual";
    session.step = "descripcion";
    pendingRecurrenceSessions.set(ctx.chat.id, session);
    await ctx.reply("📝 Por último, mandame una *descripción* corta (ej: `Alquiler`, `Netflix`):", { parse_mode: "Markdown" });
  });

  // --- END RECURRENTE GUIDED FLOW ---

  // Handle Menu Callbacks
  bot.callbackQuery("menu", (ctx) => ctx.editMessageText("📋 *Menú Principal*", { parse_mode: "Markdown", reply_markup: mainKeyboard }));
  // rp_start: triggered from keyboard buttons
  bot.callbackQuery("rp_start", async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(ctx);
  });

  // legacy "informe" button — redirect to new flow
  bot.callbackQuery("informe", async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(ctx);
  });

  bot.callbackQuery("borrar_last", async (ctx) => {
    ctx.answerCallbackQuery("Usá los botones nuevos");
    ctx.reply("Usá `/borrar_ultimo_ingreso` o `/borrar_ultimo_egreso`.", { parse_mode: "Markdown" });
  });

  bot.callbackQuery("borrar_last_egreso", async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireTelegramCan(ctx, "delete_own_movimiento");
    if (!linked) return;
    const last = await getLastMovementByType(linked, "egreso");
    if (!last) return ctx.reply("No hay egresos para borrar.");
    await ctx.reply(
      `Vas a borrar este último egreso:\n\n${formatMovementSummary(last)}`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_mov_${last.id}`)
          .text("❌ Cancelar", `cancel_delete_mov_${last.id}`),
      },
    );
  });

  // legacy export_csv — redirect to new flow
  bot.callbackQuery("export_csv", async (ctx) => {
    ctx.answerCallbackQuery();
    await startReportFlow(ctx);
  });

  // Report flow: period selection
  bot.callbackQuery(/^rp:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    const periodKey = ctx.match[1] as string;
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const thisYear = today.slice(0, 4);

    let session: ReportSession;
    if (periodKey === "range") {
      session = { step: "date_from", period: "range", linked, expiresAt: Date.now() + 5 * 60_000 };
      pendingReportSessions.set(ctx.chat.id, session);
      return ctx.reply("📅 Mandame la *fecha de inicio* del rango en formato YYYY-MM-DD:", { parse_mode: "Markdown" });
    }

    if (periodKey === "year") {
      session = {
        step: "format", period: "range",
        from: `${thisYear}-01-01`, to: `${thisYear}-12-31`,
        linked, expiresAt: Date.now() + 5 * 60_000,
      };
    } else if (periodKey === "month") {
      session = { step: "format", period: "month", month: thisMonth, linked, expiresAt: Date.now() + 5 * 60_000 };
    } else {
      session = { step: "format", period: periodKey as "day" | "week", anchorDate: today, linked, expiresAt: Date.now() + 5 * 60_000 };
    }

    pendingReportSessions.set(ctx.chat.id, session);
    await ctx.reply("📄 Elegí el formato:", { reply_markup: buildFormatKeyboard() });
  });

  // Report flow: format selection
  bot.callbackQuery(/^rf:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || session.step !== "format") {
      return ctx.reply("Sesión vencida. Usá /informes para comenzar.");
    }
    const format = ctx.match[1] as "csv" | "pdf";
    session.format = format;

    const driveAvailable = await canUseDriveViaTelegram(session.linked);
    if (driveAvailable) {
      await ctx.reply("☁️ ¿Dónde querés guardar el informe?", { reply_markup: buildDestinationKeyboard() });
    } else {
      clearReportSession(ctx.chat.id);
      const processingMsg = await ctx.reply("⏳ Generando informe...");
      try {
        await generateAndSendReport(ctx, session, format, "local");
      } finally {
        ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
      }
    }
  });

  // Report flow: destination selection
  bot.callbackQuery(/^rd:(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery();
    const session = getReportSession(ctx.chat.id);
    if (!session || !session.format) {
      return ctx.reply("Sesión vencida. Usá /informes para comenzar.");
    }
    const destination = ctx.match[1] as "local" | "drive";
    clearReportSession(ctx.chat.id);
    const processingMsg = await ctx.reply("⏳ Generando informe...");
    try {
      await generateAndSendReport(ctx, session, session.format, destination);
    } finally {
      ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    }
  });

  bot.callbackQuery("saldos", async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return;
    const text = await getSaldosText(linked);
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("buscar_mode", (ctx) => {
    ctx.answerCallbackQuery();
    ctx.reply("🔍 Usá el comando /buscar [texto]. Ej: `/buscar pan`", { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^set_cat_([\w-]+)_(.+)$/, async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];
    const category = ctx.match[2];
    const { data: targetRows } = await applyTelegramDataScope(
      supabase.from('movimientos').select('id'),
      linked,
    ).eq('id', movId).limit(1);
    if (!targetRows?.[0]) return ctx.answerCallbackQuery("Movimiento no encontrado.");
    await supabase.from('movimientos').update({ categoria: category }).eq('id', movId);
    await insertBotAuditLog({
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

  bot.command("agregarcategoria", async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarcategoria Comida`", { parse_mode: "Markdown" });
    await supabase.from('categorias').insert([{ nombre: name, ...buildTelegramWriteOwnership(linked) }]);
    ctx.reply(`✅ Categoría *${name}* agregada.`, { parse_mode: "Markdown" });
  });

  async function processTelegramFinancialText(ctx: any, args: {
    text: string;
    originalText: string;
  }) {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;

    try {
      const { data: currentCats } = await applyTelegramDataScope(
        supabase.from('categorias').select('nombre'),
        linked,
      );
      const catList = currentCats?.map(c => c.nombre).join(', ') || "Otros";

      const prompt = `Extraé los datos de este mensaje: "${args.text}"`;
      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT + `\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".`
        },
      });
      const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const extracted = parseGeminiJsonResponse(textResponse);

      if (!extracted) {
        await ctx.reply("No pude entender el mensaje, probá reformularlo.");
        return;
      }

      if (extracted.intent === "REGISTRAR" && extracted.items) {
        const companies = await listTelegramCompanies(linked);
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

            await askTelegramCompanyAssignment({
              ctx,
              linked,
              item,
              originalText: args.originalText,
              companies,
              suggestedCompanyIndex: suggestedIndex,
            });
            return;
          }

          const { created, finalCategory, empresaNombre, icon } = await persistTelegramMovement({
            linked,
            item,
            originalText: args.originalText,
          });

          await ctx.reply(`${icon} *Registrado:* ${item.descripcion}\n💰 ${item.monto} ${item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${empresaNombre}`, {
            parse_mode: "Markdown",
            reply_markup: created?.id ? new InlineKeyboard().text("✏️ Cambiar Categoría", `change_cat_${created.id}`) : undefined
          });
        }
      } else if (extracted.intent === "GESTIONAR_EMPRESA" && extracted.action === "ADD") {
        const { data } = await supabase.from('empresas').insert([{ nombre: extracted.companyName, ...buildTelegramWriteOwnership(linked) }]).select();
        const created = data?.[0];
        if (created?.id) {
          await insertBotAuditLog({
            linked,
            actorUserId: linked.userId,
            action: "create",
            entityType: "empresa",
            entityId: created.id,
            afterData: created,
          });
        }
        await ctx.reply(`✅ Empresa *${extracted.companyName}* agregada con éxito.`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("⚠️ No pude entender bien ese movimiento. ¿Podrás ser más específico?");
      }
    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Hubo un error procesando tu mensaje.");
    }
  }

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

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
        patch.empresa = val.toLowerCase() === "ninguna" ? null : val;
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
        return ctx.reply("↕️ ¿Es un ingreso o un egreso?", {
          reply_markup: new InlineKeyboard()
            .text("💚 Ingreso", "rec_tipo:ingreso").text("🔴 Egreso", "rec_tipo:egreso"),
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
    const reportSession = getReportSession(ctx.chat.id);
    if (reportSession && (reportSession.step === "date_from" || reportSession.step === "date_to")) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(text.trim())) {
        return ctx.reply("Formato inválido. Mandá la fecha como YYYY-MM-DD (ej: 2025-01-15):");
      }
      if (reportSession.step === "date_from") {
        reportSession.from = text.trim();
        reportSession.step = "date_to";
        pendingReportSessions.set(ctx.chat.id, reportSession);
        return ctx.reply("📅 Ahora mandame la *fecha de fin* (YYYY-MM-DD):", { parse_mode: "Markdown" });
      }
      if (reportSession.step === "date_to") {
        reportSession.to = text.trim();
        reportSession.step = "format";
        pendingReportSessions.set(ctx.chat.id, reportSession);
        return ctx.reply("📄 Elegí el formato:", { reply_markup: buildFormatKeyboard() });
      }
    }

    const processingMsg = await ctx.reply("⏳ Procesando transacción...");
    try {
      await processTelegramFinancialText(ctx, {
        text,
        originalText: text,
      });
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch(e) {}
    }
  });

  async function handleTelegramAudioMessage(ctx: any, kind: "voice" | "audio") {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;

    const audioMessage = kind === "voice" ? ctx.message.voice : ctx.message.audio;
    const processingMsg = await ctx.reply("⏳ Procesando transacción...");

    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener el archivo de audio desde Telegram.");
        return;
      }

      const transcript = await transcribeTelegramAudioWithGemini({
        genAI,
        botToken: botToken as string,
        filePath: file.file_path,
        fileName: audioMessage?.file_name ?? `${kind}-${ctx.message.message_id}`,
        mimeType: audioMessage?.mime_type ?? null,
        kind,
      });

      await processTelegramFinancialText(ctx, {
        text: transcript,
        originalText: `[audio] ${transcript}`,
      });
    } catch (error) {
      console.error("Telegram audio processing error:", error);
      await ctx.reply("❌ No pude procesar ese audio. Probá con un audio más corto o mandamelo como texto.");
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch(e) {}
    }
  }

  async function showExtractionReview(ctx: any, linked: any, data: PendingExtractionData, processingMsgId: number) {
    try { await ctx.api.deleteMessage(ctx.chat.id, processingMsgId); } catch (e) {}
    const entry = createPendingExtraction({
      chatId: ctx.chat.id,
      dashboardId: linked.dashboardId ?? null,
      userId: linked.userId ?? null,
      ownerUserId: linked.ownerUserId ?? null,
      data,
      messageId: 0,
    });
    const text = buildReviewCardText(data);
    const keyboard = buildReviewKeyboard(entry.id);
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  }

  async function handleTelegramPhotoMessage(ctx: any) {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
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
          const linked2 = await requireTelegramCan(firstCtx, "write_movimiento");
          if (!linked2) return;
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
                botToken: botToken as string,
                filePath: files[0].filePath,
                mimeType: files[0].mimeType,
              });
              await showExtractionReview(firstCtx, linked2, { ...result, sourceType }, processingMsg.message_id);
            } else {
              const results = await extractFromMultiplePhotos({ genAI, botToken: botToken as string, files });
              try { await firstCtx.api.deleteMessage(firstCtx.chat.id, processingMsg.message_id); } catch (e) {}
              for (const result of results) {
                const data: PendingExtractionData = { ...result, sourceType: "multi" };
                const entry = createPendingExtraction({
                  chatId: firstCtx.chat.id,
                  dashboardId: linked2.dashboardId ?? null,
                  userId: linked2.userId ?? null,
                  ownerUserId: linked2.ownerUserId ?? null,
                  data,
                  messageId: 0,
                });
                await firstCtx.reply(buildReviewCardText(data), {
                  parse_mode: "Markdown",
                  reply_markup: buildReviewKeyboard(entry.id),
                });
              }
            }
          } catch (err) {
            console.error("Telegram photo processing error:", err);
            try { await firstCtx.api.deleteMessage(firstCtx.chat.id, processingMsg.message_id); } catch (e) {}
            await firstCtx.reply("❌ No pude procesar las fotos. Mandá una por vez o probá con mejor iluminación.");
          }
        },
      );
      return;
    }

    const photo = ctx.message.photo?.[ctx.message.photo.length - 1];
    if (!photo) return;
    const processingMsg = await ctx.reply("⏳ Procesando ticket...");
    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener la imagen.");
        return;
      }
      const { result, sourceType } = await extractFromPhoto({
        genAI,
        botToken: botToken as string,
        filePath: file.file_path,
        mimeType: "image/jpeg",
      });
      await showExtractionReview(ctx, linked, { ...result, sourceType }, processingMsg.message_id);
    } catch (err) {
      console.error("Telegram photo processing error:", err);
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
      await ctx.reply("❌ No pude procesar la foto. Probá con mejor iluminación o mandá el texto directamente.");
    }
  }

  async function handleTelegramDocumentMessage(ctx: any) {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
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

    const processingMsg = await ctx.reply("⏳ Procesando documento...");
    try {
      const file = await ctx.getFile();
      if (!file?.file_path) {
        await ctx.reply("❌ No pude obtener el archivo.");
        return;
      }
      const { result, sourceType } = await extractFromPhoto({
        genAI,
        botToken: botToken as string,
        filePath: file.file_path,
        mimeType,
        displayName: doc.file_name ?? "document",
      });
      await showExtractionReview(ctx, linked, { ...result, sourceType }, processingMsg.message_id);
    } catch (err) {
      console.error("Telegram document processing error:", err);
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
      await ctx.reply("❌ No pude procesar el documento.");
    }
  }

  bot.on("message:photo", async (ctx) => {
    await handleTelegramPhotoMessage(ctx);
  });

  bot.on("message:document", async (ctx) => {
    await handleTelegramDocumentMessage(ctx);
  });

  bot.callbackQuery(/^er:confirm:(.+)$/, async (ctx) => {
    const extractionId = ctx.match[1];
    const entry = getPendingExtraction(extractionId);
    if (!entry || entry.chatId !== ctx.chat.id) {
      await ctx.answerCallbackQuery("Esta confirmación ya venció o fue usada.");
      return;
    }
    await ctx.answerCallbackQuery("✅ Guardando...");
    const d = entry.data;
    const ownership = buildTelegramWriteOwnership(entry.dashboardId, entry.userId, entry.ownerUserId);
    const { error } = await supabase.from("movimientos").insert([{
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
    }]);
    deletePendingExtraction(extractionId);
    if (error) {
      console.error("extractionReview confirm insert error:", error);
      await ctx.editMessageText("❌ Error al guardar. Intentá de nuevo.", { parse_mode: "Markdown" });
      return;
    }
    const montoStr = d.monto !== null ? `$${d.monto.toLocaleString("es-AR")} ${d.moneda}` : "monto desconocido";
    await ctx.editMessageText(`✅ *Guardado:* ${montoStr} — ${d.descripcion}`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^er:cancel:(.+)$/, async (ctx) => {
    const extractionId = ctx.match[1];
    deletePendingExtraction(extractionId);
    await ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("❌ Registro cancelado.");
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

  bot.on("message:voice", async (ctx) => {
    await handleTelegramAudioMessage(ctx, "voice");
  });

  bot.on("message:audio", async (ctx) => {
    await handleTelegramAudioMessage(ctx, "audio");
  });

  bot.callbackQuery(/^tcp:([\w-]+):(y|o|p)$/, async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const pendingId = ctx.match[1];
    const action = ctx.match[2];
    const pending = await getPendingTelegramMovement(pendingId, ctx.chat.id);
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
          reply_markup: buildPendingCompanyKeyboard(pendingId, payload.options),
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

    const { finalCategory, empresaNombre } = await persistTelegramMovement({
      linked,
      item: { ...payload.item, empresa: selectedCompany },
      originalText: payload.originalText,
    });
    await resolvePendingTelegramMovement(pendingId);
    await ctx.answerCallbackQuery("Movimiento guardado");
    await ctx.editMessageText(
      `✅ *Registrado:* ${payload.item.descripcion}\n💰 ${payload.item.monto} ${payload.item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${empresaNombre}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery(/^tca:([\w-]+):(p|\d+)$/, async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const pendingId = ctx.match[1];
    const rawSelection = ctx.match[2];
    const pending = await getPendingTelegramMovement(pendingId, ctx.chat.id);
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

    const { finalCategory, empresaNombre } = await persistTelegramMovement({
      linked,
      item: { ...payload.item, empresa: selectedCompany },
      originalText: payload.originalText,
    });
    await resolvePendingTelegramMovement(pendingId);
    await ctx.answerCallbackQuery("Movimiento guardado");
    await ctx.editMessageText(
      `✅ *Registrado:* ${payload.item.descripcion}\n💰 ${payload.item.monto} ${payload.item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${empresaNombre}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery(/^change_cat_([\w-]+)$/, async (ctx) => {
    const linked = await requireTelegramCan(ctx, "write_movimiento");
    if (!linked) return;
    const movId = ctx.match[1];
    const { data: targetRows } = await applyTelegramDataScope(
      supabase.from('movimientos').select('id'),
      linked,
    ).eq('id', movId).limit(1);
    if (!targetRows?.[0]) return ctx.answerCallbackQuery("Movimiento no encontrado.");
    const { data: cats } = await applyTelegramDataScope(
      supabase.from('categorias').select('nombre'),
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
    const linked = await requireTelegramCan(ctx, "delete_own_movimiento");
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
    await insertBotAuditLog({
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

  bot.callbackQuery(/^confirm_delete_emp_(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery("Desactivando...");
    const linked = await requireTelegramCan(ctx, "delete_empresa");
    if (!linked) return;
    const empresaId = ctx.match[1];
    const { data: rows } = await applyTelegramDataScope(
      supabase.from("empresas").select("*").is("deleted_at", null),
      linked,
    ).eq("id", empresaId).limit(1);
    const empresa = rows?.[0];
    if (!empresa) return ctx.reply("Empresa no encontrada.");
    const { data: relatedMovimientos } = await applyTelegramDataScope(
      supabase.from("movimientos").select("*").is("deleted_at", null),
      linked,
    ).eq("empresa_nombre", empresa.nombre).limit(500);
    await createBotEmpresaBackup({
      linked,
      actorUserId: linked.userId,
      empresa,
      movimientosSnapshot: relatedMovimientos ?? [],
    });
    const softDeletePayload = {
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: linked.userId,
    };
    await supabase.from("empresas").update(softDeletePayload).eq("id", empresaId);
    await insertBotAuditLog({
      linked,
      actorUserId: linked.userId,
      action: "delete",
      entityType: "empresa",
      entityId: empresaId,
      beforeData: empresa,
      afterData: { ...empresa, ...softDeletePayload },
    });
    await ctx.editMessageText(`🗑️ Empresa desactivada: *${empresa.nombre}*`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^cancel_delete_emp_(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("Operación cancelada.");
  });

  // Long polling only for local dev (Cloud Run uses webhook defined below)
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
    bot.start().catch((err) => {
      console.error("⚠️ Bot start error:", err.message);
    });
  }

  // --- CRON JOBS ---
  cron.schedule('0 21 * * *', async () => {
    const { data: users } = await supabase.from('usuarios').select('chat_id').eq('reminders_enabled', true);
    for (const u of users ?? []) {
      if (!u.chat_id) continue;
      try {
        await bot.api.sendMessage(u.chat_id, "🔔 *Recordatorio:* No te olvides de registrar tus gastos del día. 💸", { parse_mode: "Markdown" });
      } catch (err) {
        console.error(`[cron:reminder] failed to send to chat_id=${u.chat_id}:`, err);
      }
    }
  });

  cron.schedule('0 8 * * *', async () => {
    const today = new Date();
    const { data: recs } = await supabase.from('recurrentes').select('*');

    // CRITICAL-1: use for...of so each iteration is awaited and errors don't get swallowed
    for (const r of recs ?? []) {
      try {
        let shouldProcess = false;
        const last = r.last_processed ? new Date(r.last_processed) : null;

        if (!last) shouldProcess = true;
        else {
          const diff = today.getTime() - last.getTime();
          const days = diff / (1000 * 3600 * 24);
          if (r.frecuencia === 'diario' && days >= 1) shouldProcess = true;
          if (r.frecuencia === 'semanal' && days >= 7) shouldProcess = true;
          if (r.frecuencia === 'mensual' && days >= 30) shouldProcess = true;
        }

        if (shouldProcess) {
          await supabase.from('movimientos').insert([{
            ...(r.dashboard_id && r.created_by_user_id
              ? {
                  dashboard_id: r.dashboard_id,
                  created_by_user_id: r.created_by_user_id,
                }
              : {
                  owner_user_id: r.owner_user_id,
                }),
            monto: Math.abs(r.monto),
            tipo: r.tipo,
            moneda: r.moneda,
            categoria: r.categoria,
            empresa_nombre: r.empresa_nombre,
            descripcion: r.descripcion + " (Recurrente)",
            original_text: "System Generated",
            conciliado: true,
            conciliado_notas: null,
          }]);
          await supabase.from('recurrentes').update({ last_processed: today.toISOString() }).eq('id', r.id);
          if (r.chat_id) {
            bot.api.sendMessage(r.chat_id, `🔄 *Recurrente Registrado:* ${r.descripcion}\n💰 ${r.monto} ${r.moneda}`, { parse_mode: "Markdown" });
          }
        }
      } catch (recErr) {
        console.error(`[cron:recurrentes] Error processing recurrente id=${r.id}:`, recErr);
      }
    }
  });

} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN no configurado. El bot no se iniciará.");
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://balancediario.web.app").split(",");
const webhookPath = bot ? "/webhook/telegram" : undefined;
const app = createApp({
  supabase,
  genAI,
  allowedOrigins,
  botActive: !!bot,
  webhookPath,
  webhookHandler: bot ? webhookCallback(bot, "express", {
    onTimeout: "return",
    timeoutMilliseconds: 9000,
  }) : undefined,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  adminApiToken: process.env.ADMIN_API_TOKEN,
  enableDangerousRoutes: process.env.ENABLE_DANGEROUS_ROUTES === "true",
  publicAppUrl: dashboardUrl,
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  googleDriveRedirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot server running on http://0.0.0.0:${PORT}`);
});
