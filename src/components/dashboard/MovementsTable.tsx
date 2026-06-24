import { Fragment, memo, useMemo, useRef, useState } from 'react';
import {
  TrendingDown, TrendingUp, Loader2, Copy, Check, Pencil, Trash2, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown, ChevronsUpDown, ReceiptText, PenLine, FileText, Send, Repeat, Sparkles, MessageSquareText, X, Plus,
} from 'lucide-react';
import { type Movimiento, type MovementSource } from '../../services/api';
import { MovementLines } from './MovementLines';
import { Button } from '../ui/Button';
import { pageSlice, totalPages, pageList } from '../../dashboard/pagination';

const PER_PAGE = 25;

/**
 * Desktop-only (≥ lg) transaction table. Mirrors MovementCards' data + handlers
 * but renders a dense, sortable table instead of cards — the right density when
 * the user is scanning/comparing many rows on a wide screen. Below lg the cards
 * stay; this component is wrapped in `hidden lg:block` by the parent.
 */
interface MovementsTableProps {
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
  /** Row click → open the detail drawer (master-detail). */
  onSelect?: (item: Movimiento) => void;
  selectedId?: string | null;
}

type SortKey = 'fecha' | 'descripcion' | 'empresa' | 'monto';
type SortDir = 'asc' | 'desc';

/** Map the persisted `source` to a human label + icon for the Fuente column. */
export function sourceMeta(source: MovementSource | null | undefined): { label: string; Icon: typeof PenLine | null } {
  switch (source) {
    case 'web': return { label: 'Web', Icon: PenLine };
    case 'web_ticket':
    case 'photo':
    case 'handwritten':
    case 'multi': return { label: 'Ticket', Icon: ReceiptText };
    case 'pdf': return { label: 'PDF', Icon: FileText };
    case 'statement': return { label: 'Resumen', Icon: FileText };
    case 'telegram': return { label: 'Telegram', Icon: Send };
    case 'recurrente': return { label: 'Auto', Icon: Repeat };
    case 'demo': return { label: 'Demo', Icon: Sparkles };
    default: return { label: '—', Icon: null };
  }
}

function signedAmount(m: Movimiento): number {
  const v = Math.abs(m.monto ?? 0);
  return m.tipo === 'ingreso' ? v : -v;
}

function MovementsTableImpl({
  filteredHistory, hasActiveFilters, onResetFilters, onOpenCarga, canWriteData, hasMore, loadingMore,
  copiedId, page, onPageChange, onEdit, onCopy, onDelete, onLoadMore, onLinesChanged, onSelect, selectedId,
}: MovementsTableProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('fecha');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo<Movimiento[]>(() => {
    const rows: Movimiento[] = [...filteredHistory];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'descripcion': return dir * (a.descripcion || '').localeCompare(b.descripcion || '', 'es');
        case 'empresa': return dir * (a.empresa_nombre || '').localeCompare(b.empresa_nombre || '', 'es');
        case 'monto': return dir * (signedAmount(a) - signedAmount(b));
        case 'fecha':
        default: return dir * a.created_at.localeCompare(b.created_at);
      }
    });
    return rows;
  }, [filteredHistory, sortKey, sortDir]);

  const loadedPages = totalPages(sorted.length, PER_PAGE);
  const safePage = Math.min(Math.max(1, page), loadedPages);
  const pageItems = pageSlice<Movimiento>(sorted, safePage, PER_PAGE);
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

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key);
    setSortDir(key === 'descripcion' || key === 'empresa' ? 'asc' : 'desc');
  };

  const SortHeader = ({ label, col, align = 'left' }: { label: string; col: SortKey; align?: 'left' | 'right' }) => {
    const active = sortKey === col;
    return (
      <th scope="col" className={`px-3 py-2.5 font-semibold text-[var(--app-text-3)] ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          type="button"
          onClick={() => toggleSort(col)}
          aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
          className={`inline-flex items-center gap-1 hover:text-[var(--app-text-1)] transition-colors ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-[var(--app-text-1)]' : ''}`}
        >
          {label}
          {active ? (sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-70" />}
        </button>
      </th>
    );
  };

  if (filteredHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-[var(--app-border)] rounded-xl text-center text-[var(--app-text-3)]">
        <MessageSquareText className="w-10 h-10 mb-3 opacity-40" />
        {hasActiveFilters ? (
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
              {canWriteData ? 'Cargá un gasto por Telegram y aparece acá al toque.' : 'El dueño todavía no cargó nada.'}
            </p>
            {canWriteData && onOpenCarga && (
              <Button size="sm" onClick={onOpenCarga} className="mt-4"><Plus className="h-4 w-4" /> Cargar movimiento</Button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div ref={topRef} className="scroll-mt-24" />
      <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--app-border)] bg-[var(--app-surface-2)] text-xs uppercase tracking-wide">
            <tr>
              <SortHeader label="Fecha" col="fecha" />
              <SortHeader label="Descripción" col="descripcion" />
              <SortHeader label="Empresa" col="empresa" />
              <th scope="col" className="px-3 py-2.5 text-left font-semibold text-[var(--app-text-3)]">Categoría</th>
              <th scope="col" className="px-3 py-2.5 text-left font-semibold text-[var(--app-text-3)]">Fuente</th>
              <SortHeader label="Monto" col="monto" align="right" />
              {canWriteData && <th scope="col" className="px-3 py-2.5 w-px"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {pageItems.map((item: Movimiento) => {
              const isIncome = item.tipo === 'ingreso';
              const amount = item.monto !== null
                ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.moneda || 'ARS', maximumFractionDigits: 0 }).format(Math.abs(item.monto))
                : null;
              const src = sourceMeta(item.source);
              const isExpanded = expandedId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr
                    onClick={onSelect ? () => onSelect(item) : undefined}
                    aria-selected={selectedId === item.id || undefined}
                    className={`group transition-colors ${onSelect ? 'cursor-pointer' : ''} ${selectedId === item.id ? 'bg-[var(--app-surface-3)]' : 'hover:bg-[var(--app-surface-2)]'}`}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--app-text-3)] tabular-nums">
                      {new Date(item.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isIncome ? 'bg-[var(--app-green-surface)] text-[var(--chart-income)]' : 'bg-[var(--app-red-surface)] text-[var(--chart-expense)]'}`}>
                          {isIncome ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        </span>
                        <span className="truncate text-[var(--app-text-1)]" title={item.descripcion}>{item.descripcion || '—'}</span>
                        {item.has_lineas && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedId((p) => (p === item.id ? null : item.id)); }}
                            aria-expanded={isExpanded}
                            aria-label="Ver renglones del ticket"
                            className="shrink-0 text-[var(--app-text-3)] hover:text-[var(--app-text-1)]"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ReceiptText className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--app-text-2)]">{item.empresa_nombre || 'Personal'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--app-text-2)]">{item.categoria || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--app-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--app-text-2)]">
                        {src.Icon && <src.Icon className="h-3 w-3" />}{src.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap text-right font-semibold tabular-nums ${isIncome ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
                      {amount ? `${isIncome ? '+' : '−'}${amount}` : '—'}
                    </td>
                    {canWriteData && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-3)]" title="Editar" aria-label="Editar movimiento"><Pencil className="w-4 h-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); onCopy(item); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-3)]" title="Copiar" aria-label="Copiar movimiento">{copiedId === item.id ? <Check className="w-4 h-4 text-[var(--chart-income)]" /> : <Copy className="w-4 h-4" />}</button>
                          <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--chart-expense)] hover:bg-[var(--app-red-surface)]" title="Borrar" aria-label="Borrar movimiento"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {item.has_lineas && isExpanded && (
                    <tr>
                      <td colSpan={canWriteData ? 7 : 6} className="px-3 pb-3 pt-0 bg-[var(--app-surface-2)]">
                        <MovementLines
                          movimientoId={item.id}
                          moneda={item.moneda || 'ARS'}
                          canWrite={canWriteData}
                          onChanged={(total, hasLines) => onLinesChanged?.(item.id, total, hasLines)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {(loadedPages > 1 || hasMore) && (
        <nav className="flex items-center justify-center gap-1.5 pt-5" aria-label="Paginación de movimientos">
          <button onClick={() => goTo(safePage - 1)} disabled={safePage === 1} aria-label="Página anterior" className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[var(--app-border)] px-2 text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {tokens.map((t, i) =>
            t === 'ellipsis' ? (
              <span key={`e${i}`} className="px-1.5 text-sm text-[var(--app-text-3)]">…</span>
            ) : (
              <button key={t} onClick={() => goTo(t)} aria-label={`Página ${t}`} aria-current={t === safePage ? 'page' : undefined} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold tabular-nums transition-colors ${t === safePage ? 'border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]' : 'border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]'}`}>
                {t}
              </button>
            ),
          )}
          <button onClick={goNext} disabled={safePage >= loadedPages && !hasMore} aria-label="Página siguiente" className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[var(--app-border)] px-2 text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </nav>
      )}
    </>
  );
}

export const MovementsTable = memo(MovementsTableImpl);
