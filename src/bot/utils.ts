import { InlineKeyboard, type Context } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasTelegramAccess,
  resolveTelegramIdentityByChatId,
  type TelegramLinkRecord,
} from "../server/telegramAccess.ts";
import { can, type TelegramAction } from "../server/permissions.ts";

/** Fire-and-forget typing indicator. Errors are swallowed — never delays the main op. */
export function sendTyping(ctx: Context): void {
  ctx.replyWithChatAction("typing").catch(() => {});
}

/**
 * Escape Telegram legacy Markdown special chars in user-provided strings.
 * Without this, a value containing `_`, `*`, `` ` `` or `[` breaks `parse_mode: "Markdown"`.
 */
export function escapeMd(value: string): string {
  return value.replace(/[_*`\[]/g, "\\$&");
}

/**
 * Reply "session expired" with an inline button that restarts the flow.
 */
export function replyExpiredSession(ctx: Context, restartCallback: string, restartLabel = "🔄 Volver a empezar") {
  return ctx.reply("⏱️ Sesión vencida.", {
    reply_markup: new InlineKeyboard().text(restartLabel, restartCallback),
  });
}

/**
 * Split text into chunks under Telegram's 4096-char limit, preferring blank-line breaks.
 */
export function splitForTelegram(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = remaining.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export function unrefInterval(timer: ReturnType<typeof setInterval>) {
  const maybeUnref = (timer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(timer);
}

export async function getLinkedTelegramUser(supabase: SupabaseClient, chatId: number) {
  return resolveTelegramIdentityByChatId(supabase, chatId);
}

export async function getAppUserStatus(supabase: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return (data?.status as string) ?? null;
  } catch {
    return null;
  }
}

export async function requireLinkedAccount(supabase: SupabaseClient, ctx: Context): Promise<TelegramLinkRecord | null> {
  const linked = await getLinkedTelegramUser(supabase, ctx.chat.id);
  if (!hasTelegramAccess(linked)) {
    await ctx.reply(
      "🔒 Este chat todavía no está sumado a ninguna cuenta.\n\nPedile al dueño del dashboard que te mande un link desde Configuración → Equipo → Sumar Telegram, y abrilo desde acá.",
    );
    return null;
  }

  const userId = linked.userId ?? linked.ownerUserId ?? null;
  const status = await getAppUserStatus(supabase, userId);
  if (status === "blocked" || status === "suspended") {
    await ctx.reply("🚫 Tu cuenta está bloqueada. Contactá al administrador para más info.");
    return null;
  }
  (linked as any).appUserStatus = status;
  return linked;
}

export async function requireTelegramCan(
  supabase: SupabaseClient,
  ctx: Context,
  action: TelegramAction,
): Promise<TelegramLinkRecord | null> {
  const linked = await requireLinkedAccount(supabase, ctx);
  if (!linked) return null;

  if ((linked as any).appUserStatus === "paused" && action !== "read") {
    await ctx.reply("⏸️ Tu cuenta está pausada. Solo podés consultar — sin escribir, borrar ni exportar.");
    return null;
  }

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

export function buildTelegramEntityOwnership(linked: TelegramLinkRecord) {
  return linked.dashboardId
    ? { owner_user_id: linked.ownerUserId ?? linked.userId, dashboard_id: linked.dashboardId }
    : { owner_user_id: linked.ownerUserId };
}

export async function insertBotAuditLog(supabase: SupabaseClient, args: {
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

export async function createBotEmpresaBackup(supabase: SupabaseClient, args: {
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

export function formatMovementSummary(mov: any) {
  return `${mov.tipo === "ingreso" ? "🟢" : "🔴"} ${mov.monto} ${mov.moneda}\n🏢 ${mov.empresa_nombre || "Personal"}\n📁 ${mov.categoria || "Otros"}\n📝 ${mov.descripcion}`;
}

export function buildPendingCompanyKeyboard(pendingId: string, options: Array<{ nombre: string }>) {
  const kb = new InlineKeyboard();
  options.forEach((option, index) => {
    kb.text(option.nombre, `tca:${pendingId}:${index}`);
    if ((index + 1) % 2 === 0) kb.row();
  });
  kb.row().text("Personal", `tca:${pendingId}:p`);
  return kb;
}

// Uses index (0-7) instead of UUID — Telegram callback_data limit is 64 bytes
export function buildEmpresaSelectorKeyboard(extractionId: string, empresas: Array<{ id: string; nombre: string }>) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < empresas.length; i += 2) {
    const row: Array<{ text: string; callback_data: string }> = [];
    row.push({ text: empresas[i].nombre, callback_data: `er:co:${extractionId}:${i}` });
    if (empresas[i + 1]) row.push({ text: empresas[i + 1].nombre, callback_data: `er:co:${extractionId}:${i + 1}` });
    rows.push(row);
  }
  rows.push([
    { text: "🔍 Buscar/Nueva", callback_data: `er:co:${extractionId}:search` },
    { text: "❌ Sin empresa", callback_data: `er:co:${extractionId}:none` },
  ]);
  return { inline_keyboard: rows };
}
