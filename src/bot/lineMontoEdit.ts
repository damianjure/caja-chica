/**
 * In-memory store for "edit a ticket line's amount" in Telegram. After the user
 * taps ✏️ on a line, we remember which line awaits a new amount; the next text
 * message they send is parsed as the new monto. Single-instance invariant —
 * same as the other in-memory bot Maps (max-instances=1).
 */

interface PendingLineMontoEdit {
  lineId: string;
  movId: string;
  descripcion: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const store = new Map<number, PendingLineMontoEdit>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function setPendingLineMontoEdit(chatId: number, lineId: string, movId: string, descripcion: string): void {
  store.set(chatId, { lineId, movId, descripcion, expiresAt: Date.now() + TTL_MS });
}

export function getPendingLineMontoEdit(chatId: number): PendingLineMontoEdit | null {
  const entry = store.get(chatId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(chatId);
    return null;
  }
  return entry;
}

export function clearPendingLineMontoEdit(chatId: number): void {
  store.delete(chatId);
}

export function startLineMontoEditSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [chatId, entry] of store) {
      if (now > entry.expiresAt) store.delete(chatId);
    }
  }, SWEEP_INTERVAL_MS);
  const maybeUnref = (sweepTimer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(sweepTimer);
}

export function stopLineMontoEditSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
