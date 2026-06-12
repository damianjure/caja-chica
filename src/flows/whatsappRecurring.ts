/**
 * whatsappRecurring.ts — WhatsApp guided "nuevo recurrente" flow.
 *
 * Collects monto → tipo → moneda → frecuencia → descripción via a chatKey
 * session (text + buttons/list), then calls the shared createRecurrente core.
 */

import type { ChannelContext } from "../channels/contract.ts";
import type { WaSession, WaSessionStore } from "../channels/whatsapp/session.ts";
import type { SupabaseLike } from "../server/contracts.ts";
import type { Frecuencia } from "../server/recurrentes.ts";
import { createRecurrente } from "./recurring.ts";

export const RECURRING_FLOW = "recurring";

const FRECUENCIA_ROWS = [
  { data: "rc:diario", label: "Diario" },
  { data: "rc:semanal", label: "Semanal" },
  { data: "rc:quincenal", label: "Quincenal" },
  { data: "rc:mensual", label: "Mensual" },
  { data: "rc:anual", label: "Anual" },
];

export interface WaRecurringDeps {
  supabase: SupabaseLike;
}

export async function startRecurringFlow(ch: ChannelContext, sessions: WaSessionStore): Promise<void> {
  sessions.start(ch.identity.chatKey, RECURRING_FLOW, "monto");
  await ch.reply("🔄 Nuevo recurrente.\n\nMandame el *monto* (ej: 1500):");
}

function parseMonto(text: string): number | null {
  const n = parseFloat(text.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Advance the guided recurrente one step. `input` carries the inbound text and
 * buttonData; the flow reads whichever the current step expects.
 */
export async function advanceRecurringFlow(
  ch: ChannelContext,
  deps: WaRecurringDeps,
  ownership: Record<string, unknown>,
  session: WaSession,
  sessions: WaSessionStore,
  input: { text?: string; buttonData?: string },
): Promise<void> {
  const chatKey = ch.identity.chatKey;
  const data = session.data;

  switch (session.step) {
    case "monto": {
      const monto = parseMonto(input.text ?? "");
      if (monto === null) {
        await ch.reply("Mandame un monto válido (ej: 1500).");
        return;
      }
      data.monto = monto;
      session.step = "tipo";
      sessions.set(chatKey, session);
      await ch.replyWithButtons("¿Es un ingreso o un gasto?", [
        { label: "Ingreso", data: "rct:ingreso" },
        { label: "Gasto", data: "rct:egreso" },
      ]);
      return;
    }
    case "tipo": {
      const tipo = input.buttonData === "rct:ingreso" ? "ingreso" : input.buttonData === "rct:egreso" ? "egreso" : null;
      if (!tipo) {
        await ch.replyWithButtons("Elegí ingreso o gasto:", [
          { label: "Ingreso", data: "rct:ingreso" },
          { label: "Gasto", data: "rct:egreso" },
        ]);
        return;
      }
      data.tipo = tipo;
      session.step = "moneda";
      sessions.set(chatKey, session);
      await ch.replyWithButtons("¿En qué moneda?", [
        { label: "ARS", data: "rcm:ARS" },
        { label: "USD", data: "rcm:USD" },
      ]);
      return;
    }
    case "moneda": {
      const moneda = input.buttonData === "rcm:USD" ? "USD" : input.buttonData === "rcm:ARS" ? "ARS" : null;
      if (!moneda) {
        await ch.replyWithButtons("Elegí la moneda:", [
          { label: "ARS", data: "rcm:ARS" },
          { label: "USD", data: "rcm:USD" },
        ]);
        return;
      }
      data.moneda = moneda;
      session.step = "frecuencia";
      sessions.set(chatKey, session);
      await ch.replyWithMenu("¿Con qué frecuencia?", [{ items: FRECUENCIA_ROWS }]);
      return;
    }
    case "frecuencia": {
      const freq = (input.buttonData ?? "").replace("rc:", "") as Frecuencia;
      if (!FRECUENCIA_ROWS.some((r) => r.data === input.buttonData)) {
        await ch.replyWithMenu("Elegí la frecuencia de la lista:", [{ items: FRECUENCIA_ROWS }]);
        return;
      }
      data.frecuencia = freq;
      session.step = "descripcion";
      sessions.set(chatKey, session);
      await ch.reply("Por último, mandame una descripción corta (ej: Alquiler, Netflix):");
      return;
    }
    case "descripcion": {
      const descripcion = (input.text ?? "").trim();
      if (!descripcion) {
        await ch.reply("Mandame una descripción (ej: Alquiler).");
        return;
      }
      sessions.clear(chatKey);
      const ok = await createRecurrente(deps.supabase, {
        ownership,
        monto: data.monto as number,
        tipo: data.tipo as "ingreso" | "egreso",
        moneda: data.moneda as string,
        frecuencia: data.frecuencia as Frecuencia,
        descripcion,
      });
      await ch.reply(ok
        ? `✅ Listo, cargué el recurrente: ${descripcion} · ${data.monto} ${data.moneda} (${data.frecuencia}).`
        : "❌ No pude guardar el recurrente. Probá de nuevo.");
      return;
    }
    default:
      sessions.clear(chatKey);
  }
}
