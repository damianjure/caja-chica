import { useEffect } from 'react';
import { TrendingDown, TrendingUp, X, Pencil, Copy, Check, Trash2, Building2, Tag, Calendar, CheckCircle2 } from 'lucide-react';
import { type Movimiento } from '../../services/api';
import { MovementLines } from './MovementLines';
import { sourceMeta } from './MovementsTable';

/**
 * Desktop master-detail panel (≥ lg). Slides in from the right when a table row
 * is selected, showing the full movement without leaving the list. Non-modal:
 * no backdrop, so the user keeps scanning the table; Escape / X close it.
 * Edit/Copy/Delete reuse the dashboard's existing handlers.
 */
interface MovementDetailDrawerProps {
  movement: Movimiento | null;
  canWriteData: boolean;
  copiedId: string | null;
  onClose: () => void;
  onEdit: (item: Movimiento) => void;
  onCopy: (item: Movimiento) => void;
  onDelete: (id: string) => void;
  onLinesChanged?: (id: string, total: number, hasLines: boolean) => void;
}

export function MovementDetailDrawer({
  movement, canWriteData, copiedId, onClose, onEdit, onCopy, onDelete, onLinesChanged,
}: MovementDetailDrawerProps) {
  useEffect(() => {
    if (!movement) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [movement, onClose]);

  if (!movement) return null;
  const isIncome = movement.tipo === 'ingreso';
  const amount = movement.monto !== null
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: movement.moneda || 'ARS' }).format(Math.abs(movement.monto))
    : 'Sin monto';
  const src = sourceMeta(movement.source);

  const Row = ({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) => (
    <div className="flex items-start gap-2 py-2 border-b border-[var(--app-border)] last:border-0">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-[var(--app-text-3)]" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs text-[var(--app-text-3)]">{label}</div>
        <div className="text-sm text-[var(--app-text-1)] break-words">{value}</div>
      </div>
    </div>
  );

  return (
    <aside
      role="complementary"
      aria-label="Detalle del movimiento"
      className="hidden lg:flex fixed inset-y-0 right-0 z-40 w-72 flex-col border-l border-[var(--app-border-strong)] bg-[var(--app-surface-1)] shadow-[-12px_0_40px_rgba(0,0,0,0.18)] anim-slide-in-right"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] px-5 py-4">
        <h2 className="text-sm font-bold text-[var(--app-text-2)]">Detalle del movimiento</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:bg-[var(--app-surface-2)] hover:text-[var(--app-text-1)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isIncome ? 'bg-[var(--app-green-surface)] text-[var(--chart-income)]' : 'bg-[var(--app-red-surface)] text-[var(--chart-expense)]'}`}>
            {isIncome ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </span>
          <div className="min-w-0">
            <div className={`text-2xl font-bold tabular-nums ${isIncome ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
              {movement.monto !== null ? `${isIncome ? '+' : '−'}${amount}` : amount}
            </div>
            <div className="text-xs text-[var(--app-text-3)]">{isIncome ? 'Ingreso' : 'Gasto'} · {movement.moneda || 'ARS'}</div>
          </div>
        </div>

        <p className="mt-4 text-sm text-[var(--app-text-1)] font-medium">{movement.descripcion || 'Sin descripción'}</p>
        {movement.original_text && (
          <p className="mt-1 text-xs italic text-[var(--app-text-3)]">"{movement.original_text}"</p>
        )}

        <div className="mt-4">
          <Row icon={Building2} label="Empresa" value={movement.empresa_nombre || 'Personal'} />
          <Row icon={Tag} label="Categoría" value={movement.categoria || '—'} />
          <Row icon={src.Icon ?? Tag} label="Fuente" value={src.label} />
          <Row icon={Calendar} label="Fecha" value={new Date(movement.created_at).toLocaleString('es-AR')} />
          <Row icon={CheckCircle2} label="Estado" value={movement.conciliado ? 'Conciliado' : 'Pendiente de conciliar'} />
        </div>

        {movement.has_lineas && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-[var(--app-text-3)] mb-2">Renglones del ticket</div>
            <MovementLines
              movimientoId={movement.id}
              moneda={movement.moneda || 'ARS'}
              canWrite={canWriteData}
              onChanged={(total, hasLines) => onLinesChanged?.(movement.id, total, hasLines)}
            />
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--app-border)] px-5 py-4">
        {canWriteData && (
          <button
            type="button"
            onClick={() => onEdit(movement)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] px-3 py-2 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
        )}
        <button
          type="button"
          onClick={() => onCopy(movement)}
          aria-label="Copiar movimiento"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
        >
          {copiedId === movement.id ? <Check className="h-4 w-4 text-[var(--chart-income)]" /> : <Copy className="h-4 w-4" />}
        </button>
        {canWriteData && (
          <button
            type="button"
            onClick={() => onDelete(movement.id)}
            aria-label="Borrar movimiento"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-3)] hover:border-red-400 hover:text-[var(--chart-expense)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </footer>
    </aside>
  );
}
