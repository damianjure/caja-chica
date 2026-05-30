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
  awaitingCompany: boolean;
  pendingNewCompanyName: string | null;
  pendingSuggestNombre: string | null;
  empresaOptions: Array<{ id: string; nombre: string }> | null;
  categoriaOptions: Array<{ id: string; nombre: string }> | null;
  awaitingCategoria: boolean;
  pendingNewCategoriaName: string | null;
  pendingSuggestCategoria: string | null;
  /** When set, confirming the review updates this existing movement instead of inserting a new one. */
  editMovementId: string | null;
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
  const maybeUnref = (sweepTimer as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") maybeUnref.call(sweepTimer);
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
  awaitingCompany?: boolean;
  pendingNewCompanyName?: string | null;
  pendingSuggestNombre?: string | null;
  empresaOptions?: Array<{ id: string; nombre: string }> | null;
  categoriaOptions?: Array<{ id: string; nombre: string }> | null;
  awaitingCategoria?: boolean;
  pendingNewCategoriaName?: string | null;
  pendingSuggestCategoria?: string | null;
  editMovementId?: string | null;
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
    awaitingCompany: args.awaitingCompany ?? false,
    pendingNewCompanyName: args.pendingNewCompanyName ?? null,
    pendingSuggestNombre: args.pendingSuggestNombre ?? null,
    empresaOptions: args.empresaOptions ?? null,
    categoriaOptions: args.categoriaOptions ?? null,
    awaitingCategoria: args.awaitingCategoria ?? false,
    pendingNewCategoriaName: args.pendingNewCategoriaName ?? null,
    pendingSuggestCategoria: args.pendingSuggestCategoria ?? null,
    editMovementId: args.editMovementId ?? null,
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

export function updatePendingExtraction(id: string, patch: Partial<Pick<PendingExtraction, "data" | "editingField" | "awaitingCompany" | "pendingNewCompanyName" | "pendingSuggestNombre" | "empresaOptions" | "categoriaOptions" | "awaitingCategoria" | "pendingNewCategoriaName" | "pendingSuggestCategoria">>): PendingExtraction | null {
  const entry = getPendingExtraction(id);
  if (!entry) return null;
  if (patch.data !== undefined) entry.data = { ...entry.data, ...patch.data };
  if (patch.editingField !== undefined) entry.editingField = patch.editingField;
  if (patch.awaitingCompany !== undefined) entry.awaitingCompany = patch.awaitingCompany;
  if (patch.pendingNewCompanyName !== undefined) entry.pendingNewCompanyName = patch.pendingNewCompanyName;
  if (patch.pendingSuggestNombre !== undefined) entry.pendingSuggestNombre = patch.pendingSuggestNombre;
  if (patch.empresaOptions !== undefined) entry.empresaOptions = patch.empresaOptions;
  if (patch.categoriaOptions !== undefined) entry.categoriaOptions = patch.categoriaOptions;
  if (patch.awaitingCategoria !== undefined) entry.awaitingCategoria = patch.awaitingCategoria;
  if (patch.pendingNewCategoriaName !== undefined) entry.pendingNewCategoriaName = patch.pendingNewCategoriaName;
  if (patch.pendingSuggestCategoria !== undefined) entry.pendingSuggestCategoria = patch.pendingSuggestCategoria;
  return entry;
}

export function deletePendingExtraction(id: string): void {
  pendingExtractions.delete(id);
}

export function clearPendingExtractionsByChat(chatId: number): void {
  for (const [id, entry] of pendingExtractions) {
    if (entry.chatId === chatId) pendingExtractions.delete(id);
  }
}

export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Note shown when the empresa is unresolved (null) OR confidence is below threshold.
 * Empty string = no note. Single source of truth — bot/quickActions re-exports this.
 */
export function buildLowConfidenceNote(args: { empresa: string | null; confidence: number }): string {
  if (args.empresa === null) return "⚠️ No estoy seguro de la empresa — elegí abajo o editá.";
  if (args.confidence < LOW_CONFIDENCE_THRESHOLD) return "⚠️ Confianza baja — revisá los datos antes de confirmar.";
  return "";
}

export function buildReviewCardText(data: PendingExtractionData): string {
  const montoStr = data.monto !== null ? `$${data.monto.toLocaleString("es-AR")} ${data.moneda}` : "❓ Sin monto";
  const empresaStr = data.empresa ?? "Sin empresa";
  const tipoEmoji = data.tipo === "ingreso" ? "💚" : "🔴";

  // Low-confidence or unresolved empresa note (canonical helper)
  const note = buildLowConfidenceNote({ empresa: data.empresa, confidence: data.confidence });
  const noteLines = note ? `\n${note}` : "";

  return (
    `🧾 *Detecté este movimiento:*\n\n` +
    `${tipoEmoji} *${data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1)}*\n` +
    `💰 ${montoStr}\n` +
    `🏢 ${empresaStr}\n` +
    `📝 ${data.descripcion}\n` +
    `📂 ${data.categoria}` +
    (data.fecha ? `\n📅 ${data.fecha}` : "") +
    noteLines
  );
}

export function buildReviewKeyboard(
  extractionId: string,
  categoriaOptions?: Array<{ id: string; nombre: string }> | null,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const quickPickRows: Array<Array<{ text: string; callback_data: string }>> = [];
  if (categoriaOptions && categoriaOptions.length > 0) {
    const opts = categoriaOptions.slice(0, 6);
    const row = opts.map((opt, i) => ({
      text: opt.nombre,
      callback_data: `er:ca:${extractionId}:${i}`,
    }));
    quickPickRows.push(row);
  }
  return {
    inline_keyboard: [
      ...quickPickRows,
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
