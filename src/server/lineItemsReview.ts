import type { PhotoSourceType } from "./validation.ts";
import type { ReceiptItemsResult } from "./gemini.ts";

/**
 * Interactive line-item selection for receipts. When a photo yields several
 * line items, the user picks which ones to keep (checkboxes) and, on confirm,
 * chooses whether to save them as separate movements or summed into one.
 *
 * State lives in an in-memory Map (single-instance invariant — same as
 * extractionReview / pendingExtractionByChat). Sweep every 5 min with unref.
 */

export interface LineItemEntry {
  descripcion: string;
  monto: number | null;
  cantidad: number | null;
  categoria: string;
  selected: boolean;
}

export interface PendingLineItems {
  id: string;
  chatId: number;
  dashboardId: string | null;
  userId: string | null;
  ownerUserId: string | null;
  /** Merchant metadata — applied to every item on save. */
  empresa: string | null;
  cuit: string | null;
  moneda: "ARS" | "USD";
  fecha: string | null;
  sourceType: PhotoSourceType;
  items: LineItemEntry[];
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
/** Cap on items shown — keeps the keyboard within Telegram's limits. */
export const MAX_LINE_ITEMS = 40;

const pendingLineItems = new Map<string, PendingLineItems>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startLineItemsSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pendingLineItems) {
      if (now > entry.expiresAt) pendingLineItems.delete(id);
    }
  }, SWEEP_INTERVAL_MS);
  const maybeUnref = (sweepTimer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(sweepTimer);
}

export function stopLineItemsSweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export function createPendingLineItems(args: {
  chatId: number;
  dashboardId: string | null;
  userId: string | null;
  ownerUserId: string | null;
  meta: ReceiptItemsResult;
  sourceType: PhotoSourceType;
}): PendingLineItems {
  const id = `li_${args.chatId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const items: LineItemEntry[] = args.meta.items.slice(0, MAX_LINE_ITEMS).map((it) => ({
    descripcion: it.descripcion,
    monto: it.monto,
    cantidad: it.cantidad,
    categoria: it.categoria,
    selected: true,
  }));
  const entry: PendingLineItems = {
    id,
    chatId: args.chatId,
    dashboardId: args.dashboardId,
    userId: args.userId,
    ownerUserId: args.ownerUserId,
    empresa: args.meta.empresa && args.meta.empresa.trim() ? args.meta.empresa : "Personal",
    cuit: args.meta.cuit,
    moneda: args.meta.moneda,
    fecha: args.meta.fecha,
    sourceType: args.sourceType,
    items,
    expiresAt: Date.now() + TTL_MS,
  };
  pendingLineItems.set(id, entry);
  return entry;
}

export function getPendingLineItems(id: string): PendingLineItems | null {
  const entry = pendingLineItems.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingLineItems.delete(id);
    return null;
  }
  return entry;
}

export function deletePendingLineItems(id: string): void {
  pendingLineItems.delete(id);
}

export function toggleLineItem(id: string, idx: number): PendingLineItems | null {
  const entry = getPendingLineItems(id);
  if (!entry || idx < 0 || idx >= entry.items.length) return entry;
  entry.items[idx].selected = !entry.items[idx].selected;
  return entry;
}

export function setAllLineItems(id: string, selected: boolean): PendingLineItems | null {
  const entry = getPendingLineItems(id);
  if (!entry) return null;
  for (const item of entry.items) item.selected = selected;
  return entry;
}

export function selectedLineItems(entry: PendingLineItems): LineItemEntry[] {
  return entry.items.filter((it) => it.selected);
}

/** Minimal legacy-Markdown escape for user-facing strings in card text. */
function esc(value: string): string {
  return value.replace(/([_*`\[])/g, "\\$1");
}

function fmtMonto(monto: number | null, moneda: string): string {
  return monto !== null ? `$${monto.toLocaleString("es-AR")} ${moneda}` : "❓";
}

export function buildLineItemsCardText(entry: PendingLineItems): string {
  const selected = selectedLineItems(entry);
  const total = selected.reduce((acc, it) => acc + Math.abs(it.monto ?? 0), 0);
  const header =
    `🧾 *Ticket de ${esc(entry.empresa ?? "Personal")}*` +
    (entry.fecha ? ` · 📅 ${entry.fecha}` : "") +
    `\n_Detecté ${entry.items.length} ítem${entry.items.length !== 1 ? "s" : ""}. Tildá los que quieras guardar:_\n`;
  return (
    header +
    `\n*Seleccionados: ${selected.length}/${entry.items.length}* · Total ${fmtMonto(total, entry.moneda)}`
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function buildLineItemsKeyboard(
  entry: PendingLineItems,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  entry.items.forEach((item, i) => {
    const check = item.selected ? "✅" : "⬜";
    const qty = item.cantidad && item.cantidad > 1 ? `${item.cantidad}× ` : "";
    const label = `${check} ${qty}${truncate(item.descripcion, 22)} · ${fmtMonto(item.monto, entry.moneda)}`;
    rows.push([{ text: label, callback_data: `li:t:${entry.id}:${i}` }]);
  });
  const allSelected = entry.items.every((it) => it.selected);
  rows.push([
    {
      text: allSelected ? "⬜ Destildar todos" : "✅ Tildar todos",
      callback_data: `li:all:${entry.id}`,
    },
  ]);
  rows.push([
    { text: "💾 Guardar seleccionados", callback_data: `li:save:${entry.id}` },
  ]);
  rows.push([{ text: "❌ Cancelar", callback_data: `li:cancel:${entry.id}` }]);
  return { inline_keyboard: rows };
}

export function buildGroupingPromptText(entry: PendingLineItems): string {
  const selected = selectedLineItems(entry);
  const total = selected.reduce((acc, it) => acc + Math.abs(it.monto ?? 0), 0);
  return (
    `Vas a guardar *${selected.length} ítem${selected.length !== 1 ? "s" : ""}* ` +
    `por un total de ${fmtMonto(total, entry.moneda)}.\n\n` +
    `¿Cómo los registro?\n` +
    `• *Separados* → un movimiento por ítem\n` +
    `• *Sumados* → un único movimiento con el total`
  );
}

export function buildGroupingKeyboard(
  id: string,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: [
      [
        { text: "🧾 Separados", callback_data: `li:g:${id}:s` },
        { text: "➕ Sumados", callback_data: `li:g:${id}:u` },
      ],
      [{ text: "❌ Cancelar", callback_data: `li:cancel:${id}` }],
    ],
  };
}
