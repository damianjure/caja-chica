import type { PendingExtractionData } from "./validation.ts";

export interface PendingExtraction {
  id: string;
  chatId: number;
  dashboardId: string | null;
  userId: string | null;
  ownerUserId: string | null;
  data: PendingExtractionData;
  messageId: number;
  expiresAt: number;
  editingField: ExtractionField | null;
}

export type ExtractionField = "monto" | "empresa" | "categoria" | "descripcion" | "tipo" | "moneda";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const pendingExtractions = new Map<string, PendingExtraction>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startExtractionSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pendingExtractions) {
      if (now > entry.expiresAt) pendingExtractions.delete(id);
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopExtractionSweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export function createPendingExtraction(args: {
  chatId: number;
  dashboardId: string | null;
  userId: string | null;
  ownerUserId: string | null;
  data: PendingExtractionData;
  messageId: number;
}): PendingExtraction {
  const id = `${args.chatId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: PendingExtraction = {
    id,
    chatId: args.chatId,
    dashboardId: args.dashboardId,
    userId: args.userId,
    ownerUserId: args.ownerUserId,
    data: { ...args.data },
    messageId: args.messageId,
    expiresAt: Date.now() + TTL_MS,
    editingField: null,
  };
  pendingExtractions.set(id, entry);
  return entry;
}

export function getPendingExtraction(id: string): PendingExtraction | null {
  const entry = pendingExtractions.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingExtractions.delete(id);
    return null;
  }
  return entry;
}

export function getPendingExtractionByChat(chatId: number): PendingExtraction | null {
  for (const entry of pendingExtractions.values()) {
    if (entry.chatId === chatId && Date.now() <= entry.expiresAt && entry.editingField !== null) {
      return entry;
    }
  }
  return null;
}

export function updatePendingExtraction(id: string, patch: Partial<Pick<PendingExtraction, "data" | "editingField">>): PendingExtraction | null {
  const entry = getPendingExtraction(id);
  if (!entry) return null;
  if (patch.data !== undefined) entry.data = { ...entry.data, ...patch.data };
  if (patch.editingField !== undefined) entry.editingField = patch.editingField;
  return entry;
}

export function deletePendingExtraction(id: string): void {
  pendingExtractions.delete(id);
}

export function buildReviewCardText(data: PendingExtractionData): string {
  const montoStr = data.monto !== null ? `$${data.monto.toLocaleString("es-AR")} ${data.moneda}` : "❓ Sin monto";
  const empresaStr = data.empresa ?? "Sin empresa";
  const tipoEmoji = data.tipo === "ingreso" ? "💚" : "🔴";
  const confidenceWarn = data.confidence < 0.6 ? "\n⚠️ Confianza baja — revisá los datos." : "";

  return (
    `🧾 *Detecté este movimiento:*\n\n` +
    `${tipoEmoji} *${data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1)}*\n` +
    `💰 ${montoStr}\n` +
    `🏢 ${empresaStr}\n` +
    `📝 ${data.descripcion}\n` +
    `📂 ${data.categoria}` +
    (data.fecha ? `\n📅 ${data.fecha}` : "") +
    confidenceWarn
  );
}

export function buildReviewKeyboard(extractionId: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: [
      [
        { text: "✏️ Monto", callback_data: `er:edit:${extractionId}:monto` },
        { text: "🏢 Empresa", callback_data: `er:edit:${extractionId}:empresa` },
        { text: "📂 Categ.", callback_data: `er:edit:${extractionId}:categoria` },
      ],
      [
        { text: "📝 Descripción", callback_data: `er:edit:${extractionId}:descripcion` },
        { text: "↕️ Tipo", callback_data: `er:edit:${extractionId}:tipo` },
        { text: "💱 Moneda", callback_data: `er:edit:${extractionId}:moneda` },
      ],
      [
        { text: "✅ Confirmar", callback_data: `er:confirm:${extractionId}` },
        { text: "❌ Cancelar", callback_data: `er:cancel:${extractionId}` },
      ],
    ],
  };
}
