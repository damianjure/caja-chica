/**
 * whatsappReports.ts — WhatsApp guided "informe" flow (per-channel UI).
 *
 * WhatsApp can't do Telegram's inline multi-step keyboards, so this collects the
 * report params via list/button messages + a chatKey session, then calls the
 * shared core (generateAndDeliverReport). First cut: all companies, local file
 * destination (Drive upload from WhatsApp is a follow-up).
 */

import type { ChannelContext } from "../channels/contract.ts";
import type { WaSession, WaSessionStore } from "../channels/whatsapp/session.ts";
import type { SupabaseLike } from "../server/contracts.ts";
import { generateAndDeliverReport, type ReportParams } from "./reports.ts";

export const REPORT_FLOW = "report";

const PERIOD_ROWS = [
  { data: "rp:hoy", label: "Hoy" },
  { data: "rp:sem", label: "Última semana" },
  { data: "rp:mes", label: "Este mes" },
  { data: "rp:anio", label: "Este año" },
];

const TIPO_ROWS = [
  { data: "rt:all", label: "Todo" },
  { data: "rt:ing", label: "Solo ingresos" },
  { data: "rt:egr", label: "Solo gastos" },
  { data: "rt:sal", label: "Saldos" },
];

export interface WaReportDeps {
  supabase: SupabaseLike;
}

/** Begin the guided informe: ask for the period. */
export async function startReportFlow(ch: ChannelContext, sessions: WaSessionStore): Promise<void> {
  sessions.start(ch.identity.chatKey, REPORT_FLOW, "period");
  await ch.replyWithMenu("📊 ¿De qué período querés el informe?", [{ items: PERIOD_ROWS }]);
}

function applyPeriod(data: Record<string, unknown>, periodId: string, today: Date): boolean {
  const iso = today.toISOString().slice(0, 10);
  switch (periodId) {
    case "rp:hoy": data.period = "day"; data.anchorDate = iso; return true;
    case "rp:sem": data.period = "week"; data.anchorDate = iso; return true;
    case "rp:mes": data.period = "month"; data.month = iso.slice(0, 7); return true;
    case "rp:anio": {
      const y = iso.slice(0, 4);
      data.period = "range"; data.from = `${y}-01-01`; data.to = `${y}-12-31`; return true;
    }
    default: return false;
  }
}

const TIPO_MAP: Record<string, ReportParams["tipo"] | undefined> = {
  "rt:all": undefined,
  "rt:ing": "ingreso",
  "rt:egr": "egreso",
  "rt:sal": "saldos",
};

/**
 * Advance the guided informe one step from an inbound button tap. Returns when
 * the flow ends (report delivered or cancelled); the caller clears the session.
 */
export async function advanceReportFlow(
  ch: ChannelContext,
  deps: WaReportDeps,
  applyScope: (q: any) => any,
  session: WaSession,
  sessions: WaSessionStore,
  buttonData: string | undefined,
  today: Date = new Date(),
): Promise<void> {
  const chatKey = ch.identity.chatKey;
  const data = session.data;

  if (session.step === "period") {
    if (!buttonData || !applyPeriod(data, buttonData, today)) {
      await ch.replyWithMenu("Elegí el período de la lista:", [{ items: PERIOD_ROWS }]);
      return;
    }
    session.step = "tipo";
    sessions.set(chatKey, session);
    await ch.replyWithMenu("¿Qué querés ver?", [{ items: TIPO_ROWS }]);
    return;
  }

  if (session.step === "tipo") {
    if (!buttonData || !(buttonData in TIPO_MAP)) {
      await ch.replyWithMenu("Elegí una opción de la lista:", [{ items: TIPO_ROWS }]);
      return;
    }
    const tipo = TIPO_MAP[buttonData];
    if (tipo) data.tipo = tipo;
    session.step = "format";
    sessions.set(chatKey, session);
    await ch.replyWithButtons("¿En qué formato?", [
      { label: "CSV", data: "rf:csv" },
      { label: "PDF", data: "rf:pdf" },
    ]);
    return;
  }

  if (session.step === "format") {
    const format = buttonData === "rf:pdf" ? "pdf" : buttonData === "rf:csv" ? "csv" : null;
    if (!format) {
      await ch.replyWithButtons("Elegí el formato:", [
        { label: "CSV", data: "rf:csv" },
        { label: "PDF", data: "rf:pdf" },
      ]);
      return;
    }
    sessions.clear(chatKey);
    const params: ReportParams = {
      period: (data.period as ReportParams["period"]) ?? "month",
      anchorDate: data.anchorDate as string | undefined,
      month: data.month as string | undefined,
      from: data.from as string | undefined,
      to: data.to as string | undefined,
      tipo: data.tipo as ReportParams["tipo"] | undefined,
      companies: [],
    };
    await generateAndDeliverReport(ch, deps.supabase, applyScope, params, { format, destination: "local" });
    return;
  }

  // Unknown step → reset.
  sessions.clear(chatKey);
}
