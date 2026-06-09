/**
 * MovementLines — inline editor for a ticket's persisted line items.
 *
 * Shown when a movement has_lineas and the user expands it. Lines load lazily.
 * Each line's descripción / monto / categoría is editable; saving calls
 * PATCH /lineas/:id and deleting calls DELETE /lineas/:id — both recompute the
 * parent total server-side. We mirror the new total locally via onChanged so
 * the parent card updates without a full reload.
 */

import { useEffect, useState } from "react";
import { Loader2, Check, Trash2 } from "lucide-react";
import { api, type MovimientoLinea } from "../../services/api";

interface MovementLinesProps {
  movimientoId: string;
  moneda: string;
  canWrite: boolean;
  onChanged: (total: number, hasLines: boolean) => void;
}

interface Row extends MovimientoLinea {
  _monto: string;
  _saving?: boolean;
}

export function MovementLines({ movimientoId, moneda, canWrite, onChanged }: MovementLinesProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getLineas(movimientoId)
      .then((r) => { if (alive) setRows(r.items.map((l) => ({ ...l, _monto: String(l.monto) }))); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [movimientoId]);

  const recompute = (next: Row[]) => {
    const total = next.reduce((acc, r) => acc + Number(r.monto || 0), 0);
    onChanged(total, next.length > 0);
  };

  const patch = (idx: number, p: Partial<Row>) =>
    setRows((prev) => (prev ? prev.map((r, i) => (i === idx ? { ...r, ...p } : r)) : prev));

  const save = async (idx: number) => {
    if (!rows) return;
    const row = rows[idx];
    const monto = Math.abs(Number(row._monto));
    if (!Number.isFinite(monto) || monto < 0) return;
    patch(idx, { _saving: true });
    try {
      await api.updateLinea(row.id, { monto, categoria: row.categoria, descripcion: row.descripcion });
      const next = rows.map((r, i) => (i === idx ? { ...r, monto, _monto: String(monto), _saving: false } : r));
      setRows(next);
      recompute(next);
    } catch {
      patch(idx, { _saving: false });
    }
  };

  const remove = async (idx: number) => {
    if (!rows) return;
    const row = rows[idx];
    patch(idx, { _saving: true });
    try {
      await api.deleteLinea(row.id);
      const next = rows.filter((_, i) => i !== idx);
      setRows(next);
      recompute(next);
    } catch {
      patch(idx, { _saving: false });
    }
  };

  if (error) return <p className="text-xs text-[var(--chart-expense)]">No se pudieron cargar los renglones.</p>;
  if (!rows) return <div className="flex items-center gap-2 text-xs text-[var(--app-text-3)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando renglones…</div>;
  if (rows.length === 0) return <p className="text-xs text-[var(--app-text-3)]">Sin renglones.</p>;

  return (
    <ul className="space-y-2">
      {rows.map((row, idx) => (
        <li key={row.id} className="rounded-md border border-[var(--app-border)] p-2">
          <div className="flex items-center gap-2">
            <input
              value={row.descripcion}
              disabled={!canWrite || row._saving}
              onChange={(e) => patch(idx, { descripcion: e.target.value })}
              className="min-w-0 flex-1 rounded border border-[var(--app-border)] px-2 py-1.5 text-xs disabled:opacity-60"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={row._monto}
              disabled={!canWrite || row._saving}
              onChange={(e) => patch(idx, { _monto: e.target.value })}
              className="w-20 shrink-0 rounded border border-[var(--app-border)] px-2 py-1.5 text-xs text-right disabled:opacity-60"
            />
            <span className="shrink-0 text-[10px] text-[var(--app-text-3)]">{moneda}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={row.categoria}
              disabled={!canWrite || row._saving}
              onChange={(e) => patch(idx, { categoria: e.target.value })}
              placeholder="Categoría"
              className="min-w-0 flex-1 rounded border border-[var(--app-border)] px-2 py-1.5 text-[11px] disabled:opacity-60"
            />
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={() => void save(idx)}
                  disabled={row._saving}
                  aria-label="Guardar renglón"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-text-2)] hover:text-[var(--chart-income)] disabled:opacity-50"
                >
                  {row._saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(idx)}
                  disabled={row._saving}
                  aria-label="Borrar renglón"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-text-3)] hover:text-[var(--chart-expense)] disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
