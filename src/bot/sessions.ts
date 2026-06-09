import type { TelegramLinkRecord } from "../server/telegramAccess.ts";
import type { CompanyChoice } from "../server/reportBotHelpers.ts";
import { startExtractionSweep, clearPendingExtractionsByChat } from "../server/extractionReview.ts";
import { startLineMontoEditSweep } from "./lineMontoEdit.ts";

function unrefInterval(timer: ReturnType<typeof setInterval>) {
  const maybeUnref = (timer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(timer);
}

// --- REPORT SESSION ---

export interface ReportSession {
  step: "temporalidad" | "date_pick" | "date_from" | "date_to" | "alcance" | "alcance_pick" | "tipo" | "download";
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

// --- INTENT CONFIRM SESSION ---
// Holds the slots understood from a spoken/typed command (informe / recurrente_nuevo /
// editar_ultimo) while we wait for the user to tap Confirmar or Editar.

export interface IntentConfirmSession {
  intent: "informe" | "recurrente_nuevo" | "editar_ultimo";
  rawSlots: Record<string, unknown>;
  linked: TelegramLinkRecord;
  expiresAt: number;
}

export const pendingIntentConfirmSessions = new Map<number, IntentConfirmSession>();

const intentConfirmSweep = setInterval(() => {
  const now = Date.now();
  for (const [chatId, s] of pendingIntentConfirmSessions) {
    if (now > s.expiresAt) pendingIntentConfirmSessions.delete(chatId);
  }
}, 5 * 60_000);
unrefInterval(intentConfirmSweep);

export function setIntentConfirmSession(
  chatId: number,
  intent: IntentConfirmSession["intent"],
  rawSlots: Record<string, unknown>,
  linked: TelegramLinkRecord,
): void {
  pendingIntentConfirmSessions.set(chatId, { intent, rawSlots, linked, expiresAt: Date.now() + 5 * 60_000 });
}

export function getIntentConfirmSession(chatId: number): IntentConfirmSession | null {
  const s = pendingIntentConfirmSessions.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { pendingIntentConfirmSessions.delete(chatId); return null; }
  return s;
}

export function clearIntentConfirmSession(chatId: number): void {
  pendingIntentConfirmSessions.delete(chatId);
}

// --- CROSS-SESSION CLEAR ---

export function clearRecurrenceSession(chatId: number): void {
  pendingRecurrenceSessions.delete(chatId);
}

/** Atomically clears all guided-flow session stores for the given chatId. */
export function clearChatSessions(chatId: number): void {
  pendingInputSessions.delete(chatId);
  clearReportSession(chatId);
  clearRecurrenceSession(chatId);
  clearIntentConfirmSession(chatId);
  clearPendingExtractionsByChat(chatId);
}

// --- EXTRACTION SWEEP ---
// Call once at startup to activate the extraction session TTL sweep.
export function initSessions() {
  startExtractionSweep();
  startLineMontoEditSweep();
}
