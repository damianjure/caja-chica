/**
 * flows/extraction.ts — channel-agnostic extraction save core.
 *
 * The Gemini extraction itself is already channel-free (mediaExtract.ts); this
 * module owns what happens AFTER extraction: turning statement transactions
 * into pending-extraction data and persisting confirmed extractions as
 * movements. The review/batch UI (cards, keyboards, sessions) stays per-channel.
 */

import type { SupabaseLike } from "../server/contracts.ts";
import type { CreditCardExtractionItem } from "../server/gemini.ts";
import type { PendingExtraction } from "../server/extractionReview.ts";
import type { PendingExtractionData } from "../server/validation.ts";

/**
 * Map usable statement transactions (monto present) to pending-extraction
 * data: empresa defaults to "Personal", sourceType marks the real-date rule.
 */
export function statementItemsToPending(items: CreditCardExtractionItem[]): PendingExtractionData[] {
  return items
    .filter((it) => it.monto !== null)
    .map((item) => ({
      monto: item.monto,
      moneda: item.moneda,
      tipo: item.tipo,
      empresa: item.empresa && item.empresa.trim() ? item.empresa : "Personal",
      cuit: null,
      categoria: item.categoria,
      descripcion: item.descripcion,
      fecha: item.fecha,
      confidence: item.confidence,
      sourceType: "statement",
    }));
}

/** Insert a confirmed extraction as a movement (ownership from the entry's identity). */
export async function insertExtractionMovement(
  supabase: SupabaseLike,
  entry: PendingExtraction,
): Promise<{ id?: string; error?: unknown }> {
  const d = entry.data;
  const ownership = entry.dashboardId && entry.userId
    ? { owner_user_id: entry.userId, dashboard_id: entry.dashboardId, created_by_user_id: entry.userId }
    : { owner_user_id: entry.ownerUserId };
  const { data, error } = await supabase.from("movimientos").insert([{
    ...ownership,
    monto: Math.abs(d.monto ?? 0),
    tipo: d.tipo,
    moneda: d.moneda,
    categoria: d.categoria,
    empresa_nombre: d.empresa,
    descripcion: d.descripcion,
    original_text: `[${d.sourceType}] ${d.descripcion}`,
    source: d.sourceType,
    conciliado: true,
    conciliado_notas: null,
    // Statement transactions keep their real date so monthly reports stay
    // honest; receipts keep the legacy behavior (created_at = now).
    ...(d.sourceType === "statement" && d.fecha ? { created_at: `${d.fecha}T12:00:00.000Z` } : {}),
  }]).select("id");
  if (error) return { error };
  return { id: (data?.[0]?.id as string | undefined) };
}

export interface BatchSaveResult {
  saved: number;
  total: number;
  /** Entry ids that persisted — the caller clears their pending sessions. */
  savedIds: string[];
}

/** Persist a batch of confirmed extractions (album / statement "save all"). */
export async function saveExtractionBatch(
  supabase: SupabaseLike,
  entries: PendingExtraction[],
): Promise<BatchSaveResult> {
  let saved = 0;
  let total = 0;
  const savedIds: string[] = [];
  for (const entry of entries) {
    const { error } = await insertExtractionMovement(supabase, entry);
    if (!error) {
      saved += 1;
      total += Math.abs(entry.data.monto ?? 0);
      savedIds.push(entry.id);
    }
  }
  return { saved, total, savedIds };
}
