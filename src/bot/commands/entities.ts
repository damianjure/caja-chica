import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireTelegramCan, requireLinkedAccount, escapeMd, insertBotAuditLog, buildTelegramEntityOwnership } from "../utils.ts";
import { assertBotWritable } from "../maintenance-gate.ts";
import { setInputSession } from "../sessions.ts";
import { applyTelegramDataScope, type TelegramLinkRecord } from "../../server/telegramAccess.ts";

export async function createEmpresaFromBot(supabase: BotDeps["supabase"], linked: TelegramLinkRecord, nombre: string): Promise<{ ok: boolean; id?: string }> {
  const { data, error } = await supabase
    .from("empresas")
    .insert([{ nombre, ...buildTelegramEntityOwnership(linked) }])
    .select();
  if (error) {
    console.error("createEmpresaFromBot error:", error);
    return { ok: false };
  }
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
  return { ok: true, id: created?.id };
}

export async function createCategoriaFromBot(supabase: BotDeps["supabase"], linked: TelegramLinkRecord, nombre: string): Promise<boolean> {
  const { error } = await supabase
    .from("categorias")
    .insert([{ nombre, ...buildTelegramEntityOwnership(linked) }]);
  if (error) {
    console.error("createCategoriaFromBot error:", error);
    return false;
  }
  return true;
}

export function registerEntityHandlers(bot: Bot, deps: BotDeps) {
  const { supabase } = deps;

  bot.command("empresas", async (ctx) => {
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const { data: emps, error } = await applyTelegramDataScope(
      supabase.from("empresas").select("nombre"),
      linked,
    ).is("deleted_at", null);
    if (error) {
      console.error("/empresas error:", error);
      return ctx.reply("❌ No pude traer las empresas. Intentá de nuevo.");
    }
    const list = emps?.map(e => `• ${escapeMd(e.nombre)}`).join("\n") || "Sin empresas.";
    ctx.reply(`🏢 *Empresas registradas:*\n\n${list}`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("➕ Agregar empresa", "add_emp"),
    });
  });

  bot.command("categorias", async (ctx) => {
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const { data: cats, error } = await applyTelegramDataScope(
      supabase.from("categorias").select("nombre"),
      linked,
    );
    if (error) {
      console.error("/categorias error:", error);
      return ctx.reply("❌ No pude traer las categorías. Intentá de nuevo.");
    }
    const list = cats?.map(c => `• ${escapeMd(c.nombre)}`).join("\n") || "Sin categorías.";
    ctx.reply(`📁 *Categorías registradas:*\n\n${list}`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("➕ Agregar categoría", "add_cat"),
    });
  });

  bot.command("agregarempresa", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarempresa Mi Negocio`", { parse_mode: "Markdown" });
    const result = await createEmpresaFromBot(supabase, linked, name);
    if (!result.ok) return ctx.reply("❌ No se pudo agregar la empresa. Intentá de nuevo.");
    ctx.reply(`✅ Empresa *${escapeMd(name)}* agregada.`, { parse_mode: "Markdown" });
  });

  bot.command("agregarcategoria", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarcategoria Comida`", { parse_mode: "Markdown" });
    const ok = await createCategoriaFromBot(supabase, linked, name);
    if (!ok) return ctx.reply("❌ No se pudo agregar la categoría. Intentá de nuevo.");
    ctx.reply(`✅ Categoría *${escapeMd(name)}* agregada.`, { parse_mode: "Markdown" });
  });

  bot.command("borrarempresa", async (ctx) => {
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "delete_empresa");
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
    const { count: movCount } = await applyTelegramDataScope(
      supabase.from("movimientos").select("id", { count: "exact", head: true }),
      linked,
    ).eq("empresa_id", empresa.id).is("deleted_at", null);
    const linkedMsg = movCount && movCount > 0
      ? `\n\n⚠️ Tiene *${movCount}* movimiento${movCount === 1 ? "" : "s"} asociado${movCount === 1 ? "" : "s"} (quedan en el historial).`
      : "";
    await ctx.reply(
      `Vas a desactivar esta empresa:\n\n🏢 *${escapeMd(empresa.nombre)}*${linkedMsg}\n\nSe va a crear backup antes del soft delete.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Confirmar", `confirm_delete_emp_${empresa.id}`)
          .text("❌ Cancelar", `cancel_delete_emp_${empresa.id}`),
      },
    );
  });

  // Callback: empresas list (from menu button)
  bot.callbackQuery("empresas", async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const { data: emps, error } = await applyTelegramDataScope(
      supabase.from("empresas").select("nombre"),
      linked,
    ).is("deleted_at", null);
    if (error) {
      console.error("cb:empresas error:", error);
      return ctx.reply("❌ No pude traer las empresas. Intentá de nuevo.");
    }
    const list = emps?.map(e => `• ${escapeMd(e.nombre)}`).join("\n") || "Sin empresas.";
    ctx.reply(`🏢 *Empresas registradas:*\n\n${list}`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("➕ Agregar empresa", "add_emp"),
    });
  });

  bot.callbackQuery("categorias", async (ctx) => {
    ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const { data: cats, error } = await applyTelegramDataScope(
      supabase.from("categorias").select("nombre"),
      linked,
    );
    if (error) {
      console.error("cb:categorias error:", error);
      return ctx.reply("❌ No pude traer las categorías. Intentá de nuevo.");
    }
    const list = cats?.map(c => `• ${escapeMd(c.nombre)}`).join("\n") || "Sin categorías.";
    ctx.reply(`📁 *Categorías registradas:*\n\n${list}`, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("➕ Agregar categoría", "add_cat"),
    });
  });

  bot.callbackQuery("add_emp", async (ctx) => {
    ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    setInputSession(ctx.chat.id, "empresa", linked);
    await ctx.reply("🏢 Escribí el nombre de la empresa:", {
      reply_markup: new InlineKeyboard().text("❌ Cancelar", "input_cancel"),
    });
  });

  bot.callbackQuery("add_cat", async (ctx) => {
    ctx.answerCallbackQuery();
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "write_movimiento");
    if (!linked) return;
    setInputSession(ctx.chat.id, "categoria", linked);
    await ctx.reply("📁 Escribí el nombre de la categoría:", {
      reply_markup: new InlineKeyboard().text("❌ Cancelar", "input_cancel"),
    });
  });

  bot.callbackQuery("input_cancel", async (ctx) => {
    const { pendingInputSessions } = await import("../sessions.ts");
    pendingInputSessions.delete(ctx.chat!.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Cancelado.");
  });

  bot.callbackQuery("del_emp", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const { data: emps } = await applyTelegramDataScope(
      supabase.from("empresas").select("id, nombre"),
      linked,
    ).is("deleted_at", null);
    if (!emps || emps.length === 0) {
      await ctx.reply("No hay empresas para borrar.");
      return;
    }
    const kb = new InlineKeyboard();
    emps.forEach((e: { id: string; nombre: string }, i: number) => {
      kb.text(e.nombre, `del_emp_pick:${e.id}`);
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply("🗑️ Elegí la empresa a borrar:", { reply_markup: kb });
  });

  bot.callbackQuery(/^del_emp_pick:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(supabase, ctx);
    if (!linked) return;
    const empId = ctx.match[1];
    const { data: emp } = await applyTelegramDataScope(
      supabase.from("empresas").select("id, nombre"),
      linked,
    ).eq("id", empId).is("deleted_at", null).limit(1);
    const empresa = emp?.[0];
    if (!empresa) {
      await ctx.reply("Esa empresa ya no existe.");
      return;
    }
    const { count: movCount } = await applyTelegramDataScope(
      supabase.from("movimientos").select("id", { count: "exact", head: true }),
      linked,
    ).eq("empresa_id", empresa.id).is("deleted_at", null);
    const linkedMsg = movCount && movCount > 0
      ? `\n\nTiene *${movCount}* movimiento${movCount === 1 ? "" : "s"} asociado${movCount === 1 ? "" : "s"} (quedan en el historial).`
      : "";
    await ctx.reply(
      `🗑️ *¿Borrar la empresa "${escapeMd(empresa.nombre)}"?*${linkedMsg}\n\n⚠️ Es un cambio que NO se puede deshacer.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ OK, borrar", `confirm_delete_emp_${empresa.id}`)
          .text("❌ Cancelar", `cancel_delete_emp_${empresa.id}`),
      },
    );
  });

  bot.callbackQuery(/^confirm_delete_emp_(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery("Desactivando...");
    if (!await assertBotWritable(ctx)) return;
    const linked = await requireTelegramCan(supabase, ctx, "delete_empresa");
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
    const { createBotEmpresaBackup } = await import("../utils.ts");
    await createBotEmpresaBackup(supabase, {
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
    await insertBotAuditLog(supabase, {
      linked,
      actorUserId: linked.userId,
      action: "delete",
      entityType: "empresa",
      entityId: empresaId,
      beforeData: empresa,
      afterData: { ...empresa, ...softDeletePayload },
    });
    await ctx.editMessageText(`🗑️ Empresa desactivada: *${escapeMd(empresa.nombre)}*`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^cancel_delete_emp_(.+)$/, async (ctx) => {
    ctx.answerCallbackQuery("Cancelado");
    await ctx.editMessageText("Operación cancelada.");
  });
}
