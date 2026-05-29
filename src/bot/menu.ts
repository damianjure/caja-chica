import type { Bot, Context } from "grammy";
import type { BotDeps } from "./deps.ts";
import { buildMainKeyboard } from "./keyboards.ts";
import {
  hasTelegramAccess,
  resolveTelegramIdentityByToken,
} from "../server/telegramAccess.ts";
import { getLinkedTelegramUser } from "./utils.ts";
import { registerCancelHandler } from "./commands/cancel.ts";

const BOT_COMMANDS = [
  { command: "menu", description: "Abrir el menú principal" },
  { command: "cancel", description: "Cancelar la operación actual" },
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

export async function registerBotCommands(bot: Bot, attempts = 3): Promise<void> {
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

async function handleTelegramInviteToken(supabase: BotDeps["supabase"], ctx: Context, token: string): Promise<boolean> {
  const { data: tokenRows } = await supabase
    .from("telegram_invite_tokens")
    .select("id, dashboard_id, target_user_id, expires_at, status, pre_authorized")
    .eq("token", token)
    .eq("status", "pending")
    .limit(1);

  const inviteToken = tokenRows?.[0];
  if (!inviteToken) return false;

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

  // CRITICAL-2: reject if this Telegram account already has an active link (pivot guard)
  const { data: existingLinks } = await supabase
    .from("telegram_links")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .neq("status", "revoked")
    .limit(1);
  if (existingLinks && existingLinks.length > 0) {
    await ctx.reply(
      "⚠️ Esta cuenta de Telegram ya está sumada a otro dashboard. Pedile al dueño que te quite el acceso primero.",
    );
    return true;
  }

  if (inviteToken.pre_authorized) {
    let targetUserId = inviteToken.target_user_id;
    if (!targetUserId) {
      await ctx.reply(
        "⚠️ Primero completá el login en https://caja-chica-bot.web.app y volvé a tocar este link.",
      );
      return true;
    }

    const { data: appUserRows } = await supabase
      .from("app_users")
      .select("user_id")
      .eq("user_id", targetUserId)
      .limit(1);
    if (!appUserRows || appUserRows.length === 0) {
      await ctx.reply(
        "⚠️ Primero completá el login en https://caja-chica-bot.web.app y volvé a tocar este link.",
      );
      return true;
    }

    const { error: insertErr } = await supabase
      .from("telegram_links")
      .insert({
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        dashboard_id: inviteToken.dashboard_id,
        app_user_id: targetUserId,
        status: "active",
        linked_at: new Date().toISOString(),
      });
    if (insertErr) {
      console.error("[handleTelegramInviteToken] pre_authorized insert failed:", insertErr);
      await ctx.reply("❌ Error al procesar la solicitud. Intentá de nuevo.");
      return true;
    }

    await supabase
      .from("telegram_invite_tokens")
      .update({ status: "claimed" })
      .eq("id", inviteToken.id);

    await ctx.reply("✅ Listo. Quedaste sumado al dashboard. Usá /menu para empezar.");
    return true;
  }

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

export function registerMenuHandlers(bot: Bot, deps: BotDeps) {
  const { supabase, dashboardUrl } = deps;
  const mainKeyboard = buildMainKeyboard(dashboardUrl);

  registerCancelHandler(bot, deps);

  bot.command("start", async (ctx) => {
    const token = ctx.match?.trim();

    if (token) {
      const handledAsInvite = await handleTelegramInviteToken(supabase, ctx, token);
      if (handledAsInvite) return;

      let target;
      try {
        target = await resolveTelegramIdentityByToken(supabase, token);
      } catch (tokenError) {
        console.error(tokenError);
        return ctx.reply("❌ No pude validar el código de conexión.");
      }

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
        "✅ Chat sumado. A partir de ahora opera sobre tus datos.",
        { reply_markup: mainKeyboard },
      );
    }

    const linked = await getLinkedTelegramUser(supabase, ctx.chat.id);
    if (hasTelegramAccess(linked)) {
      return ctx.reply(
        "Hola de nuevo. Ya estás dentro. 💸\n\nUsá /menu para ver qué se puede hacer.",
        { reply_markup: mainKeyboard },
      );
    }

    ctx.reply(
      "🔒 Bot solo por invitación.\n\nPedile al dueño del dashboard que te mande un link desde Configuración → Equipo → Sumar Telegram, y abrilo desde acá.",
    );
  });

  bot.command("menu", (ctx) => ctx.reply("📋 *Esto es lo que podés hacer*\n\nElegí una opción o escribí un movimiento como hablás. Tipo: `pagué 4500 de luz`.", {
    parse_mode: "Markdown",
    reply_markup: mainKeyboard,
  }));

  bot.command("dashboard", (ctx) => {
    ctx.reply(`🔗 [Abrir Dashboard Web](${dashboardUrl})`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("menu", (ctx) => ctx.editMessageText("📋 *Menú Principal*", { parse_mode: "Markdown", reply_markup: mainKeyboard }));
}
