import { memo, useRef, useState } from 'react';
import { TrendingDown, TrendingUp, MessageSquareText, Loader2, Copy, Check, Pencil, Trash2, Building2, Tag, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ReceiptText, X, Plus } from 'lucide-react';
import { type Movimiento } from '../../services/api';
import { MovementLines } from './MovementLines';
import { Button } from '../ui/Button';
import { pageSlice, totalPages, pageList } from '../../dashboard/pagination';

const PER_PAGE = 10;

interface MovementCardsProps {
  filteredHistory: Movimiento[];
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onOpenCarga?: () => void;
  canWriteData: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  copiedId: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onEdit: (item: Movimiento) => void;
  onCopy: (item: Movimiento) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  onLinesChanged?: (id: string, total: number, hasLines: boolean) => void;
}

function MovementCardsImpl({
  filteredHistory, hasActiveFilters, onResetFilters, onOpenCarga, canWriteData, hasMore, loadingMore,
  copiedId, page, onPageChange, onEdit, onCopy, onDelete, onLoadMore, onLinesChanged,
}: MovementCardsProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadedPages = totalPages(filteredHistory.length, PER_PAGE);
  const safePage = Math.min(Math.max(1, page), loadedPages);
  const pageItems = pageSlice(filteredHistory, safePage, PER_PAGE);
  const tokens = pageList(safePage, loadedPages);

  const goTo = (next: number) => {
    if (next < 1) return;
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    topRef.current?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    onPageChange(next);
  };

  const goNext = () => {
    if (safePage < loadedPages) { goTo(safePage + 1); return; }
    if (hasMore) { onLoadMore(); goTo(safePage + 1); }
  };

  if (filteredHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-[var(--app-border)] rounded-xl text-center text-[var(--app-text-3)]">
        <MessageSquareText className="w-10 h-10 mb-3 opacity-40" />
        {hasActiveFilters ? (
          // Hay datos, pero los filtros activos los tapan: no es primer uso.
          <>
            <p className="font-medium text-[var(--app-text-2)]">Sin movimientos para estos filtros.</p>
            <p className="text-sm mt-1">Probá ampliar el período o sacar algún filtro.</p>
            <Button variant="secondary" size="sm" onClick={onResetFilters} className="mt-4">
              <X className="h-4 w-4" /> Limpiar filtros
            </Button>
          </>
        ) : (
          <>
            <p className="font-medium text-[var(--app-text-2)]">Todavía no hay movimientos.</p>
            <p className="text-sm mt-1">
              {canWriteData ? 'Cargá un gasto por Telegram y aparece acá al toque.' : 'El dueño todavía no cargó nada. Vas a verlos acá apenas pase.'}
            </p>
            {canWriteData && onOpenCarga && (
              <Button size="sm" onClick={onOpenCarga} className="mt-4">
                <Plus className="h-4 w-4" /> Cargar movimiento
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div ref={topRef} className="scroll-mt-24" />
      <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-4">
        {pageItems.map((item, index) => (
            <div
              key={item.id}
              style={{ animationDelay: `${Math.min(index * 40, 160)}ms` }}
              className="anim-card-in group bg-[var(--app-surface-1)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] rounded-xl p-5 shadow-sm relative overflow-hidden transition-[border-color] duration-150"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-md ${item.tipo === 'ingreso' ? 'bg-[var(--app-green-surface)] text-[var(--chart-income)]' : 'bg-[var(--app-red-surface)] text-[var(--chart-expense)]'}`}>
                    {item.tipo === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-[var(--app-text-3)] block leading-none mb-1">{item.categoria}</span>
                    <span className="text-lg font-semibold text-[var(--app-text-1)] tabular-nums">
                      {item.monto !== null
                        ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.moneda || 'ARS' }).format(item.monto)
                        : 'Monto no especificado'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canWriteData && (
                    <button onClick={() => onEdit(item)} className="inline-flex h-11 w-11 items-center justify-center text-[var(--app-text-3)] hover:text-[var(--app-text-1)] active:scale-[0.9] transition duration-100 rounded-md border border-transparent hover:border-[var(--app-text-2)]" title="Editar movimiento" aria-label="Editar movimiento">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => onCopy(item)} className="inline-flex h-11 w-11 items-center justify-center text-[var(--app-text-3)] hover:text-[var(--app-text-1)] active:scale-[0.9] transition duration-100 rounded-md border border-transparent hover:border-[var(--app-text-2)]" title="Copiar movimiento" aria-label="Copiar movimiento">
                    {copiedId === item.id ? <Check className="w-4 h-4 text-[var(--chart-income)]" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {canWriteData && (
                    <button onClick={() => onDelete(item.id)} className="inline-flex h-11 w-11 items-center justify-center text-[var(--app-text-3)] hover:text-[var(--chart-expense)] active:scale-[0.9] transition duration-100 rounded-md border border-transparent hover:border-red-400" title="Borrar movimiento" aria-label="Borrar movimiento">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-[var(--app-text-2)] italic line-clamp-2">"{item.original_text}"</p>
                <div className="flex flex-wrap gap-2">
                  {item.empresa_nombre && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-[var(--app-surface-2)] text-[var(--app-text-2)] rounded-md"><Building2 className="w-3 h-3" />{item.empresa_nombre}</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-[var(--app-surface-2)] text-[var(--app-text-2)] rounded-md"><Tag className="w-3 h-3" />{item.descripcion}</span>
                </div>
                {item.has_lineas && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                      aria-expanded={expandedId === item.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--app-text-2)] hover:text-[var(--app-text-1)]"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                      {expandedId === item.id ? 'Ocultar renglones' : 'Ver renglones del ticket'}
                      {expandedId === item.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {expandedId === item.id && (
                      <div className="mt-2">
                        <MovementLines
                          movimientoId={item.id}
                          moneda={item.moneda || 'ARS'}
                          canWrite={canWriteData}
                          onChanged={(total, hasLines) => onLinesChanged?.(item.id, total, hasLines)}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="pt-3 border-t border-[var(--app-border)]">
                  <span className="text-xs text-[var(--app-text-3)] font-mono">{new Date(item.created_at).toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>
          ))}
      </div>
      <div className="md:hidden overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] divide-y divide-[var(--app-border)]">
        {pageItems.map((item) => {
          const isIncome = item.tipo === 'ingreso';
          const amount = item.monto !== null
            ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.moneda || 'ARS', maximumFractionDigits: 0 }).format(Math.abs(item.monto))
            : null;
          const meta = [item.empresa_nombre || 'Personal', item.categoria, new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })]
            .filter(Boolean).join(' · ');
          const rowInner = (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isIncome ? 'bg-[var(--app-green-surface)] text-[var(--chart-income)]' : 'bg-[var(--app-red-surface)] text-[var(--chart-expense)]'}`}>
                  {isIncome ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--app-text-1)]">{item.categoria}</div>
                  <div className="truncate text-xs text-[var(--app-text-3)]">{meta}</div>
                </div>
              </div>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${isIncome ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
                {amount ? `${isIncome ? '+' : '−'}${amount}` : '—'}
              </span>
            </>
          );
          return (
            <div key={item.id}>
              <div className="flex items-stretch">
                {canWriteData ? (
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    aria-label={`Editar ${isIncome ? 'ingreso' : 'gasto'} ${item.categoria}`}
                    className="flex flex-1 items-center justify-between gap-3 px-3 py-3 text-left min-w-0 active:bg-[var(--app-surface-2)] transition-colors"
                  >
                    {rowInner}
                  </button>
                ) : (
                  <div className="flex flex-1 items-center justify-between gap-3 px-3 py-3 min-w-0">{rowInner}</div>
                )}
                {item.has_lineas && (
                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                    aria-expanded={expandedId === item.id}
                    aria-label="Ver renglones del ticket"
                    className="flex w-11 shrink-0 items-center justify-center border-l border-[var(--app-border)] text-[var(--app-text-3)] active:bg-[var(--app-surface-2)]"
                  >
                    {expandedId === item.id ? <ChevronUp className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />}
                  </button>
                )}
              </div>
              {item.has_lineas && expandedId === item.id && (
                <div className="px-3 pb-3">
                  <MovementLines
                    movimientoId={item.id}
                    moneda={item.moneda || 'ARS'}
                    canWrite={canWriteData}
                    onChanged={(total, hasLines) => onLinesChanged?.(item.id, total, hasLines)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(loadedPages > 1 || hasMore) && (
        <nav className="flex items-center justify-center gap-1.5 pt-5" aria-label="Paginación de movimientos">
          <button
            onClick={() => goTo(safePage - 1)}
            disabled={safePage === 1}
            aria-label="Página anterior"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[var(--app-border)] px-2 text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {tokens.map((t, i) =>
            t === 'ellipsis' ? (
              <span key={`e${i}`} className="px-1.5 text-sm text-[var(--app-text-3)]">…</span>
            ) : (
              <button
                key={t}
                onClick={() => goTo(t)}
                aria-label={`Página ${t}`}
                aria-current={t === safePage ? 'page' : undefined}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold tabular-nums transition-colors ${
                  t === safePage
                    ? 'border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]'
                    : 'border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]'
                }`}
              >
                {t}
              </button>
            ),
          )}
          <button
            onClick={goNext}
            disabled={safePage >= loadedPages && !hasMore}
            aria-label="Página siguiente"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[var(--app-border)] px-2 text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </nav>
      )}
    </>
  );
}

export const MovementCards = memo(MovementCardsImpl);
