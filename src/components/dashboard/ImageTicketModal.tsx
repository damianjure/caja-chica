/**
 * ImageTicketModal — web modal-first ticket review.
 *
 * After a photo/PDF is extracted, the user picks which lines to keep, edits
 * description/amount/category per line, and chooses the empresa (defaulting to
 * their preferred default — never the extracted merchant, which would silently
 * create a company). On confirm it persists via POST /api/movimientos/ticket
 * (one parent movement holding the total + child lines, editable later in
 * Movimientos).
 */

import { useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { ImageItemsExtractionResult, SaveTicketPayload } from "../../services/api";
import { ModalShell } from "../ui/ModalShell";

interface ImageTicketModalProps {
  extracted: ImageItemsExtractionResult;
  /** ['all', ...names] as built in DashboardApp. */
  companiesList: string[];
  defaultEmpresa: string;
  isSaving: boolean;
  onSave: (payload: SaveTicketPayload) => void;
  onCancel: () => void;
}

interface EditableLine {
  descripcion: string;
  monto: string; // string for controlled number input
  categoria: string;
  included: boolean;
}

function fmt(n: number, moneda: string) {
  return `$${n.toLocaleString("es-AR")} ${moneda}`;
}

export function ImageTicketModal({
  extracted, companiesList, defaultEmpresa, isSaving, onSave, onCancel,
}: ImageTicketModalProps) {
  const merchant = extracted.empresa?.trim() || "Ticket";

  const companyOptions = useMemo(() => {
    const names = companiesList.filter((c) => c !== "all");
    const set = new Set<string>(["Personal", ...names]);
    return Array.from(set);
  }, [companiesList]);

  const initialEmpresa = useMemo(() => {
    const d = defaultEmpresa.trim();
    return d && companyOptions.includes(d) ? d : "Personal";
  }, [defaultEmpresa, companyOptions]);

  const [empresa, setEmpresa] = useState(initialEmpresa);
  const [lines, setLines] = useState<EditableLine[]>(() => {
    if (extracted.items.length > 0) {
      return extracted.items.map((it) => ({
        descripcion: it.descripcion,
        monto: it.monto !== null ? String(it.monto) : "",
        categoria: it.categoria,
        included: true,
      }));
    }
    // No line items (handwritten / total-only): one synthetic line = the total.
    return [{
      descripcion: merchant,
      monto: extracted.total !== null ? String(extracted.total) : "",
      categoria: "Varios",
      included: true,
    }];
  });

  const patchLine = (idx: number, patch: Partial<EditableLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const payableLines = lines.filter((l) => l.included && Number(l.monto) > 0);
  const total = payableLines.reduce((acc, l) => acc + Math.abs(Number(l.monto)), 0);

  const handleSave = () => {
    if (payableLines.length === 0) return;
    onSave({
      empresa,
      moneda: extracted.moneda,
      descripcion: merchant,
      lineas: payableLines.map((l) => ({
        descripcion: l.descripcion.trim() || "Ítem",
        monto: Math.abs(Number(l.monto)),
        categoria: l.categoria.trim() || "Varios",
      })),
    });
  };

  const sourceLabel = extracted.sourceType === "pdf" ? "PDF" : "Imagen";

  return (
    <ModalShell
      title="Revisar ticket"
      description={`${sourceLabel} · ${merchant}${extracted.fecha ? ` · ${extracted.fecha}` : ""}`}
      onClose={onCancel}
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Empresa</label>
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className="rounded-md border border-[var(--app-border)] px-4 py-3 bg-[var(--app-surface-1)]"
          >
            {companyOptions.map((c) => (
              <option key={c} value={c}>{c}{c === defaultEmpresa.trim() ? " (default)" : ""}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">
              Renglones ({payableLines.length})
            </span>
            <span className="text-sm font-semibold text-[var(--app-text-2)]">Total {fmt(total, extracted.moneda)}</span>
          </div>

          {lines.map((line, idx) => (
            <div
              key={idx}
              className={`rounded-md border p-2.5 ${line.included ? "border-[var(--app-border-strong)] bg-[var(--app-surface-2)]" : "border-[var(--app-border)] opacity-60"}`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patchLine(idx, { included: !line.included })}
                  aria-pressed={line.included}
                  aria-label={line.included ? "Excluir renglón" : "Incluir renglón"}
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${line.included ? "border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]" : "border-[var(--app-border-strong)]"}`}
                >
                  {line.included && <Check className="h-3.5 w-3.5" />}
                </button>
                <input
                  value={line.descripcion}
                  onChange={(e) => patchLine(idx, { descripcion: e.target.value })}
                  placeholder="Descripción"
                  className="min-w-0 flex-1 rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.monto}
                  onChange={(e) => patchLine(idx, { monto: e.target.value })}
                  placeholder="0"
                  className="w-24 shrink-0 rounded-md border border-[var(--app-border)] px-3 py-2 text-sm text-right"
                />
              </div>
              <div className="mt-2 flex items-center gap-2 pl-7">
                <input
                  value={line.categoria}
                  onChange={(e) => patchLine(idx, { categoria: e.target.value })}
                  placeholder="Categoría"
                  className="min-w-0 flex-1 rounded-md border border-[var(--app-border)] px-3 py-2 text-xs"
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Quitar renglón"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-3)] hover:text-[var(--chart-expense)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--app-text-3)]">
          Se guarda como un movimiento en <span className="font-medium text-[var(--app-text-2)]">{empresa}</span>. Podés editar cada renglón después en Movimientos.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || payableLines.length === 0}
          className="rounded-md bg-[var(--app-strong-surface)] px-5 py-3 font-medium text-[var(--app-strong-text)] disabled:opacity-50"
        >
          {isSaving ? "Guardando…" : "Guardar ticket"}
        </button>
      </div>
    </ModalShell>
  );
}
