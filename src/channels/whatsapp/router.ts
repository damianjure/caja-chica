/**
 * whatsapp/router.ts — dispatch a normalized WhatsApp message to a flow.
 *
 * Resolves the sender's identity (whatsapp_links) and routes the IncomingMessage
 * to the right channel-agnostic flow through the WhatsAppChannel adapter. Only
 * flows that already have a channel-agnostic core are wired; free-text movement
 * load, the guided informes/recurrentes UI and photo/ticket extraction need
 * per-channel work and are tracked as the next steps (they return the help text
 * for now). No Meta I/O here — the channel does that via its transport.
 */

import type { ChannelContext } from "../contract.ts";
import type { SupabaseLike, GenAILike } from "../../server/contracts.ts";
import {
  resolveWhatsAppIdentityByPhone,
  applyWhatsAppDataScope,
  canWhatsAppDo,
} from "../../server/whatsappAccess.ts";
import { runAskFlow } from "../../flows/ask.ts";
import { acceptWhatsAppInvite } from "../../server/whatsappInvite.ts";

export interface WhatsAppRouterDeps {
  supabase: SupabaseLike;
  genAI: GenAILike;
  genAI2?: GenAILike | null;
}

export const WHATSAPP_NOT_LINKED =
  "👋 Para usar Caja Chica por WhatsApp, vinculá este número desde el dashboard web (Personas → Invitar WhatsApp).";

export const WHATSAPP_HELP =
  "Caja Chica por WhatsApp.\n\nYa podés:\n• /preguntar <consulta> — saldos, gastos por categoría, comparaciones, recurrentes.\n\nProximamente: cargar gastos por texto/foto, informes y recurrentes.";

export async function handleWhatsAppMessage(ch: ChannelContext, deps: WhatsAppRouterDeps): Promise<void> {
  const { command, text } = ch.incoming;

  // Link redemption must work BEFORE the identity gate (the number isn't linked yet).
  if (command === "start" || command === "vincular") {
    const token = (text ?? "").trim();
    if (!token) {
      await ch.reply("🔗 Para vincular este número, mandá el código que te dio el dashboard.\nEj: /vincular <código>");
      return;
    }
    await redeemInvite(ch, deps, token);
    return;
  }

  const linked = await resolveWhatsAppIdentityByPhone(deps.supabase as any, ch.identity.userKey);
  if (!linked) {
    await ch.reply(WHATSAPP_NOT_LINKED);
    return;
  }

  if (command === "preguntar" || command === "pregunta") {
    if (!canWhatsAppDo(linked, "read")) {
      await ch.reply("🚫 No tenés permiso para consultar.");
      return;
    }
    const question = (text ?? "").trim().slice(0, 500);
    if (!question) {
      await ch.reply("🤔 Escribí tu consulta después de /preguntar.\nEj: /preguntar cuánto gasté este mes");
      return;
    }
    await runAskFlow(ch, deps, (q) => applyWhatsAppDataScope(q, linked), question);
    return;
  }

  // /ayuda, /menu, free text, button taps, media → help for now.
  await ch.reply(WHATSAPP_HELP);
}

async function redeemInvite(ch: ChannelContext, deps: WhatsAppRouterDeps, token: string): Promise<void> {
  const result = await acceptWhatsAppInvite(deps.supabase as any, {
    token,
    phone: ch.identity.userKey,
    name: ch.identity.displayName ?? null,
  });
  switch (result.status) {
    case "linked":
      await ch.reply("✅ Listo, recibí tu solicitud. Pedile al dueño del dashboard que la confirme y ya vas a poder usar Caja Chica por acá.");
      return;
    case "invalid_token":
      await ch.reply("❌ Ese código no es válido. Pedí uno nuevo desde el dashboard.");
      return;
    case "expired":
      await ch.reply("⌛ El código venció. Generá uno nuevo desde el dashboard (duran 30 minutos).");
      return;
    case "pivot_blocked":
      await ch.reply("⚠️ Este número ya está vinculado a un dashboard. Desvinculalo primero para cambiarlo.");
      return;
    default:
      await ch.reply("❌ No pude procesar la vinculación. Probá de nuevo en un rato.");
  }
}
