/**
 * ImageItemsReviewModal — interactive line-item selection after a receipt with
 * 2+ items is extracted. The user ticks which items to keep, then chooses
 * Separados (one movement per item) or Sumados (one movement with the total).
 * Web counterpart of the bot's lineItemsReview flow.
 *
 * Selection lives in local state; on confirm it calls onSave with the selected
 * items and the chosen grouping mode. The parent maps them to movements via
 * buildLineItemMovements (src/dashboard/lineItems.ts).
 */

import { useState } from "react";
import { Check } from "lucide-react";
import type { ImageItemsExtractionResult, ImageLineItem } from "../../services/api";
import { ModalShell } from "../ui/ModalShell";

interface ImageItemsReviewModalProps {
  extracted: ImageItemsExtractionResult;
  isSaving: boolean;
  onSave: (selected: ImageLineItem[], mode: "sep" | "sum") => void;
  onCancel: () => void;
}

function fmtMonto(monto: number | null, moneda: string): string {
  return monto !== null ? `$${monto.toLocaleString("es-AR")} ${moneda}` : "—";
}

export function ImageItemsReviewModal({ extracted, isSaving, onSave, onCancel }: ImageItemsReviewModalProps) {
  // Start with every item selected, matching the bot default.
  const [selected, setSelected] = useState<boolean[]>(() => extracted.items.map(() => true));

  const toggle = (idx: number) =>
    setSelected((prev) => prev.map((v, i) => (i === idx ? !v : v)));

  const allSelected = selected.every(Boolean);
  const setAll = (value: boolean) => setSelected(extracted.items.map(() => value));

  const selectedItems = extracted.items.filter((_, i) => selected[i]);
  const payableCount = selectedItems.filter((it) => it.monto !== null).length;
  const total = selectedItems.reduce((acc, it) => acc + Math.abs(it.monto ?? 0), 0);

  const sourceLabel = extracted.sourceType === "pdf" ? "PDF" : "Imagen (ticket/factura)";
  const headerBits = [
    extracted.empresa ?? "Ticket",
    extracted.fecha ?? null,
  ].filter(Boolean);

  const handleSave = (mode: "sep" | "sum") => {
    if (payableCount === 0) return;
    onSave(selectedItems, mode);
  };

  return (
    <ModalShell
      title="Elegí qué renglones guardar"
      description={`${sourceLabel} · ${headerBits.join(" · ")}`}
      onClose={onCancel}
      closeOnBackdrop={false}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--app-text-2)]">
            {payableCount}/{extracted.items.length} seleccionados · Total {fmtMonto(total, extracted.moneda)}
          </p>
          <button
            type="button"
            onClick={() => setAll(!allSelected)}
            className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)] hover:text-[var(--app-text-1)]"
          >
            {allSelected ? "Destildar todos" : "Tildar todos"}
          </button>
        </div>

        <ul className="space-y-2">
          {extracted.items.map((item, idx) => {
            const isOn = selected[idx];
            const qty = item.cantidad && item.cantidad > 1 ? `${item.cantidad}× ` : "";
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-pressed={isOn}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                    isOn
                      ? "border-[var(--app-strong-surface)] bg-[var(--app-surface-2)]"
                      : "border-[var(--app-border)] hover:bg-[var(--app-surface-2)]"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      isOn
                        ? "border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]"
                        : "border-[var(--app-border-strong)]"
                    }`}
                  >
                    {isOn && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--app-text-1)]">
                    {qty}{item.descripcion}
                    <span className="ml-2 text-xs text-[var(--app-text-3)]">{item.categoria}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--app-text-2)]">
                    {fmtMonto(item.monto, extracted.moneda)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-[var(--app-text-3)]">
          La empresa <span className="font-medium text-[var(--app-text-2)]">{extracted.empresa ?? "Personal"}</span> se aplica a todos los movimientos.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => handleSave("sum")}
          disabled={isSaving || payableCount === 0}
          className="rounded-md border border-[var(--app-border-strong)] px-4 py-3 font-medium text-[var(--app-text-1)] disabled:opacity-50"
          title="Un único movimiento con el total"
        >
          Sumados
        </button>
        <button
          onClick={() => handleSave("sep")}
          disabled={isSaving || payableCount === 0}
          className="rounded-md bg-[var(--app-strong-surface)] px-5 py-3 font-medium text-[var(--app-strong-text)] disabled:opacity-50"
          title="Un movimiento por cada renglón"
        >
          {isSaving ? "Guardando…" : "Separados"}
        </button>
      </div>
    </ModalShell>
  );
}
