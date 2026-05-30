/**
 * ImageReviewModal — editable review card after image extraction.
 *
 * The user sees the extracted fields pre-filled, can edit any of them,
 * then confirms → calls onSave with the final values, which uses the
 * existing POST /api/movimientos path (same as text composer).
 */

import { useState } from "react";
import type { ImageExtractionResult } from "../../services/api";
import { ModalShell } from "../ui/ModalShell";

interface ImageReviewModalProps {
  extracted: ImageExtractionResult;
  isSaving: boolean;
  onSave: (fields: ReviewFields) => void;
  onCancel: () => void;
}

export interface ReviewFields {
  monto: number | null;
  moneda: "ARS" | "USD";
  tipo: "ingreso" | "egreso";
  empresa: string;
  categoria: string;
  descripcion: string;
}

function confidenceLabel(c: number): string {
  if (c >= 0.8) return "Alta confianza";
  if (c >= 0.5) return "Confianza media";
  return "Confianza baja — revisá los datos";
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (c >= 0.5) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

export function ImageReviewModal({ extracted, isSaving, onSave, onCancel }: ImageReviewModalProps) {
  const [form, setForm] = useState<ReviewFields>({
    monto: extracted.monto,
    moneda: extracted.moneda,
    tipo: extracted.tipo,
    empresa: extracted.empresa ?? "",
    categoria: extracted.categoria,
    descripcion: extracted.descripcion,
  });

  const handleSave = () => {
    onSave(form);
  };

  const sourceLabel = extracted.sourceType === "handwritten"
    ? "Imagen (nota manuscrita)"
    : extracted.sourceType === "pdf"
    ? "PDF"
    : "Imagen (ticket/factura)";

  return (
    <ModalShell
      title="Revisar ticket extraído"
      description={`${sourceLabel} · ${confidenceLabel(extracted.confidence)}`}
      onClose={onCancel}
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <div className={`text-xs font-semibold px-3 py-2 rounded-md border ${confidenceColor(extracted.confidence)}`}>
          Confianza: {Math.round(extracted.confidence * 100)}% — {confidenceLabel(extracted.confidence)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as "ingreso" | "egreso" }))}
              className="rounded-md border border-neutral-200 px-4 py-3 bg-white"
            >
              <option value="egreso">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Moneda</label>
            <select
              value={form.moneda}
              onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value as "ARS" | "USD" }))}
              className="rounded-md border border-neutral-200 px-4 py-3 bg-white"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Monto</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.monto ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, monto: e.target.value ? Number(e.target.value) : null }))}
              placeholder="0"
              className="rounded-md border border-neutral-200 px-4 py-3"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Categoría</label>
            <input
              type="text"
              value={form.categoria}
              onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
              placeholder="Categoría"
              className="rounded-md border border-neutral-200 px-4 py-3"
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Empresa</label>
            <input
              type="text"
              value={form.empresa}
              onChange={(e) => setForm((p) => ({ ...p, empresa: e.target.value }))}
              placeholder="Empresa (o dejar vacío)"
              className="rounded-md border border-neutral-200 px-4 py-3"
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Descripción"
              rows={2}
              className="rounded-md border border-neutral-200 px-4 py-3 resize-none"
            />
          </div>
        </div>

        {extracted.fecha && (
          <p className="text-xs text-neutral-500">
            Fecha del ticket: <span className="font-medium text-neutral-700">{extracted.fecha}</span>
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-md border border-neutral-200 px-4 py-3 text-neutral-700 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !form.monto}
          className="rounded-md bg-neutral-900 px-5 py-3 text-white font-medium disabled:opacity-50"
        >
          {isSaving ? "Guardando…" : "Guardar movimiento"}
        </button>
      </div>
    </ModalShell>
  );
}
