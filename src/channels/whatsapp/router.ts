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
  const linked = await resolveWhatsAppIdentityByPhone(deps.supabase as any, ch.identity.userKey);
  if (!linked) {
    await ch.reply(WHATSAPP_NOT_LINKED);
    return;
  }

  const { command, text } = ch.incoming;

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

  // /start, /ayuda, /menu, free text, button taps, media → help for now.
  await ch.reply(WHATSAPP_HELP);
}
