/**
 * Pure helpers for the web receipt line-item flow. Behavior mirrors the bot
 * (src/bot/extraction.ts): insertLineItemMovements for save grouping and
 * showReceiptReview's single-item collapse. Kept side-effect free and
 * dependency-light so it can be unit tested without loading api.ts at runtime.
 */

import type { ExtractedItem, ImageExtractionResult, ImageItemsExtractionResult, ImageLineItem } from "../services/api";

/**
 * Collapse an item-level extraction with fewer than 2 line items into a single
 * editable movement (same mapping the bot uses before showing its review card).
 */
export function toSingleReview(r: ImageItemsExtractionResult): ImageExtractionResult {
  const first = r.items[0];
  return {
    monto: r.total ?? first?.monto ?? null,
    moneda: r.moneda,
    tipo: "egreso",
    empresa: r.empresa,
    cuit: r.cuit,
    categoria: first?.categoria ?? "Varios",
    descripcion:
      first?.descripcion ??
      (r.empresa ? `Compra en ${r.empresa}` : "Gasto registrado desde foto"),
    fecha: r.fecha,
    confidence: r.confidence,
    sourceType: r.sourceType,
  };
}

/**
 * Turn the user-selected line items into movements to persist. Items without a
 * readable amount are dropped (they can't be a movement). Merchant metadata
 * applies to every item. "sum" → one movement with the total; "sep" → one per
 * item. Always egreso — receipts are expenses. Amounts use abs() so returns
 * count positive.
 */
export function buildLineItemMovements(
  items: ImageLineItem[],
  meta: { empresa: string | null; moneda: "ARS" | "USD" },
  mode: "sep" | "sum",
): ExtractedItem[] {
  const payable = items.filter((it) => it.monto !== null);
  if (payable.length === 0) return [];

  const empresa = meta.empresa;

  if (mode === "sum") {
    const total = payable.reduce((acc, it) => acc + Math.abs(it.monto ?? 0), 0);
    const desc =
      empresa && empresa !== "Personal"
        ? `Compra en ${empresa} (${payable.length} ítems)`
        : `Compra (${payable.length} ítems)`;
    return [{
      monto: total,
      tipo: "egreso",
      moneda: meta.moneda,
      categoria: "Varios",
      empresa: empresa || null,
      descripcion: desc,
    }];
  }

  return payable.map((it) => ({
    monto: Math.abs(it.monto ?? 0),
    tipo: "egreso",
    moneda: meta.moneda,
    categoria: it.categoria,
    empresa: empresa || null,
    descripcion: it.descripcion,
  }));
}
