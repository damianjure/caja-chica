import type { TelegramLinkRecord } from "../server/telegramAccess.ts";
import type { CompanyChoice } from "../server/reportBotHelpers.ts";
import { startExtractionSweep } from "../server/extractionReview.ts";

function unrefInterval(timer: ReturnType<typeof setInterval>) {
  const maybeUnref = (timer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(timer);
}

// --- REPORT SESSION ---

export interface ReportSession {
  step: "temporalidad" | "date_pick" | "date_from" | "date_to" | "alcance" | "alcance_pick" | "tipo" | "format" | "destino";
  temporalidad?: "por_dia" | "ultimo_dia" | "ultima_semana" | "ultimo_mes" | "ultimo_anio" | "rango";
  period: "day" | "week" | "month" | "range";
  anchorDate?: string;
  month?: string;
  from?: string;
  to?: string;
  companyChoices?: CompanyChoice[];
  selectedCompanyIdx: Set<number>;
  tipo?: "ingreso" | "egreso" | "saldos";
  format?: "csv" | "pdf";
  linked: TelegramLinkRecord;
  expiresAt: number;
}

export const pendingReportSessions = new Map<number, ReportSession>();

const reportSessionSweep = setInterval(() => {
  const now = Date.now();
  for (const [chatId, s] of pendingReportSessions) {
    if (now > s.expiresAt) pendingReportSessions.delete(chatId);
  }
}, 5 * 60_000);
unrefInterval(reportSessionSweep);

export function getReportSession(chatId: number): ReportSession | null {
  const s = pendingReportSessions.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { pendingReportSessions.delete(chatId); return null; }
  return s;
}

export function clearReportSession(chatId: number) {
  pendingReportSessions.delete(chatId);
}

// --- RECURRENCE SESSION ---

export interface RecurrenceSession {
  step: "monto" | "tipo" | "moneda" | "frecuencia" | "descripcion";
  monto?: number;
  tipo?: "ingreso" | "egreso";
  moneda?: "ARS" | "USD";
  frecuencia?: "diario" | "semanal" | "quincenal" | "mensual" | "anual";
  linked: TelegramLinkRecord;
  expiresAt: number;
}

export const pendingRecurrenceSessions = new Map<number, RecurrenceSession>();

const recurrenceSessionSweep = setInterval(() => {
  const now = Date.now();
  for (const [chatId, s] of pendingRecurrenceSessions) {
    if (now > s.expiresAt) pendingRecurrenceSessions.delete(chatId);
  }
}, 5 * 60_000);
unrefInterval(recurrenceSessionSweep);

export function getRecurrenceSession(chatId: number): RecurrenceSession | null {
  const s = pendingRecurrenceSessions.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { pendingRecurrenceSessions.delete(chatId); return null; }
  return s;
}

// --- INPUT SESSION ---

export interface InputSession {
  kind: "empresa" | "categoria" | "buscar";
  linked: TelegramLinkRecord;
  expiresAt: number;
}

export const pendingInputSessions = new Map<number, InputSession>();

export function setInputSession(chatId: number, kind: InputSession["kind"], linked: TelegramLinkRecord) {
  pendingInputSessions.set(chatId, { kind, linked, expiresAt: Date.now() + 5 * 60_000 });
}

export function getInputSession(chatId: number): InputSession | null {
  const s = pendingInputSessions.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { pendingInputSessions.delete(chatId); return null; }
  return s;
}

// --- EXTRACTION SWEEP ---
// Call once at startup to activate the extraction session TTL sweep.
export function initSessions() {
  startExtractionSweep();
}
