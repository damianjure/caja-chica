import type { ComponentType } from 'react';
import {
  Building2, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Empresa, Movimiento } from '../../../services/api';
import { SectionCard, MetricCard, MetricChip } from '../primitives';
import { Input } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { topCategoriesByType, formatNumber, type TopCategory } from '../../../dashboard/summary';

const PAGE_SIZE = 8;

interface CompanySummaryView {
  name: string;
  ingresosArs: number;
  gastosArs: number;
  saldoArs: number;
  ingresosUsd: number;
  gastosUsd: number;
  saldoUsd: number;
  movimientos: number;
}

function pick(c: CompanySummaryView, cur: 'ARS' | 'USD') {
  return cur === 'ARS'
    ? { ing: c.ingresosArs, gas: c.gastosArs, sal: c.saldoArs }
    : { ing: c.ingresosUsd, gas: c.gastosUsd, sal: c.saldoUsd };
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + (words[1][0] ?? '')).toUpperCase();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) {
    return `Hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return `Ayer ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function CurToggle({ cur, setCur }: { cur: 'ARS' | 'USD'; setCur: (c: 'ARS' | 'USD') => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-0.5" role="group" aria-label="Moneda">
      {(['ARS', 'USD'] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCur(c)}
          aria-pressed={cur === c}
          className={`rounded-md px-3 py-1 text-xs font-bold tabular-nums transition ${cur === c ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]' : 'text-[var(--app-text-3)] hover:text-[var(--app-text-1)]'}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function KpiBadgeCard({
  label, value, sub, tone, icon: Icon,
}: {
  label: string; value: string; sub?: string; tone?: 'danger' | 'success'; icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-4 shadow-[var(--app-shadow-sm)]">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--app-surface-3)] flex items-center justify-center">
        <Icon className="w-5 h-5 text-[var(--app-text-3)]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-[var(--app-text-3)] mb-0.5">{label}</div>
        <div className={`text-xl font-bold tabular-nums leading-none ${tone === 'danger' ? 'text-[var(--chart-expense)]' : tone === 'success' ? 'text-[var(--chart-income)]' : 'text-[var(--app-text-1)]'}`}>
          {value}
        </div>
        {sub && <div className="text-xs text-[var(--app-text-3)] mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ── Company detail panel (desktop right column) ───────────────────────────────

function CompanyDetailPanel({
  summary,
  empresa,
  recentHistory,
  topCategories,
  canWriteData,
  cur,
  formatCurrency,
  onEdit,
  onDelete,
  onViewAll,
  onClose,
}: {
  summary: CompanySummaryView;
  empresa: Empresa | undefined;
  recentHistory: Movimiento[];
  topCategories: TopCategory[];
  canWriteData: boolean;
  cur: 'ARS' | 'USD';
  formatCurrency: (amount: number, currency: 'ARS' | 'USD') => string;
  onEdit: () => void;
  onDelete: () => void;
  onViewAll: () => void;
  onClose: () => void;
}) {
  const p = pick(summary, cur);
  const canEdit = canWriteData && !!empresa && summary.name !== 'Personal';
  const catTotal = topCategories.reduce((acc, c) => acc + c.ars, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--app-border)] shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--app-text-1)] truncate">{summary.name}</p>
          <p className="text-xs text-[var(--app-text-3)] mt-0.5">{summary.movimientos} movimientos</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--app-red-border)] text-[var(--chart-expense)] hover:border-red-400"
              aria-label="Borrar empresa"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
            aria-label="Cerrar panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
        {/* Mini KPI row */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">Ingresos</div>
            <div className="font-semibold text-[var(--chart-income)] tabular-nums text-xs leading-snug">{formatCurrency(p.ing, cur)}</div>
          </div>
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">Gastos</div>
            <div className="font-semibold text-[var(--chart-expense)] tabular-nums text-xs leading-snug">{formatCurrency(p.gas, cur)}</div>
          </div>
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">Saldo</div>
            <div className={`font-semibold tabular-nums text-xs leading-snug ${p.sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(p.sal, cur)}</div>
          </div>
        </div>

        {/* Top categories with progress bars */}
        {topCategories.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[var(--app-text-1)] mb-3">Gastos por categoría</h4>
            <div className="space-y-2.5">
              {topCategories.map((c) => {
                const pct = catTotal > 0 ? Math.round((c.ars / catTotal) * 100) : 0;
                return (
                  <div key={c.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--app-text-2)] truncate max-w-[120px]">{c.category}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-[var(--app-text-1)] tabular-nums">{formatCurrency(c.ars, 'ARS')}</span>
                        <span className="text-[10px] text-[var(--app-text-3)] w-7 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1 bg-[var(--app-surface-3)] rounded-full overflow-hidden">
                      <div
                        className="h-1 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%`, background: 'var(--chart-income)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent movements */}
        {recentHistory.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-[var(--app-text-1)] mb-3">Movimientos recientes</h4>
            <div className="space-y-0 divide-y divide-[var(--app-border)]">
              {recentHistory.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--app-text-1)] truncate">{m.descripcion || '—'}</p>
                    <p className="text-[11px] text-[var(--app-text-3)]">{fmtDate(m.created_at)}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${m.tipo === 'ingreso' ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
                    {m.tipo === 'ingreso' ? '+' : '−'}{formatCurrency(m.monto, m.moneda as 'ARS' | 'USD')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <footer className="px-5 py-3.5 border-t border-[var(--app-border)] shrink-0">
        <button
          type="button"
          onClick={onViewAll}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--app-border-strong)] px-4 py-2.5 text-xs font-medium text-[var(--app-text-1)] hover:border-[var(--app-text-2)] transition-colors"
        >
          Ver movimientos filtrados
        </button>
      </footer>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmpresasTab({
  companySummaries,
  topCompanies,
  customCompanies,
  canWriteData,
  onEditCompany,
  onDeleteCompany,
  onCreateCompany,
  formatCurrency,
  history,
  companiesList,
  onDrilldown,
}: {
  companySummaries: CompanySummaryView[];
  topCompanies: Array<{ label: string; value: number; valueLabel?: string; secondary?: string; supportingValue?: string; segments?: Array<{ value: number; colorClass: string; label: string; currency?: 'ARS' | 'USD' }> }>;
  customCompanies: Empresa[];
  canWriteData: boolean;
  onEditCompany: (company: Empresa) => void;
  onDeleteCompany: (company: Empresa) => void;
  onCreateCompany: (nombre: string) => Promise<void>;
  formatCurrency: (amount: number, currency: 'ARS' | 'USD') => string;
  history: Movimiento[];
  companiesList: string[];
  onDrilldown: (company: string, category: string) => void;
}) {
  const [newCompany, setNewCompany] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [cur, setCur] = useState<'ARS' | 'USD'>('ARS');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [withMovementsFilter, setWithMovementsFilter] = useState(false);
  const [page, setPage] = useState(0);

  const sortedByActivity = useMemo(
    () => [...companySummaries].sort((a, b) => b.movimientos - a.movimientos),
    [companySummaries],
  );

  const masGasta = [...companySummaries].sort((a, b) => pick(b, cur).gas - pick(a, cur).gas)[0];
  const enRojo = companySummaries.filter((c) => pick(c, cur).sal < 0).length;
  const totalSaldo = companySummaries.reduce((acc, c) => acc + pick(c, cur).sal, 0);

  const filteredDesktop = useMemo(() => {
    return sortedByActivity
      .filter((c) => !withMovementsFilter || c.movimientos > 0)
      .filter((c) => !companySearch || c.name.toLowerCase().includes(companySearch.toLowerCase()));
  }, [sortedByActivity, withMovementsFilter, companySearch]);

  const pageCount = Math.ceil(filteredDesktop.length / PAGE_SIZE);
  const paginatedRows = filteredDesktop.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lastActivityByCompany = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of history) {
      if (!m.empresa_nombre) continue;
      const curr = map.get(m.empresa_nombre);
      if (!curr || m.created_at > curr) map.set(m.empresa_nombre, m.created_at);
    }
    return map;
  }, [history]);

  const selectedSummary = useMemo(
    () => companySummaries.find((c) => c.name === selectedCompany) ?? null,
    [companySummaries, selectedCompany],
  );

  const selectedEmpresa = useMemo(
    () => customCompanies.find((c) => c.nombre === selectedCompany),
    [customCompanies, selectedCompany],
  );

  const selectedHistory = useMemo(
    () =>
      selectedCompany
        ? [...history]
            .filter((m) => m.empresa_nombre === selectedCompany)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 5)
        : [],
    [history, selectedCompany],
  );

  const selectedCategories = useMemo(
    () => (selectedCompany ? topCategoriesByType(history, selectedCompany, 'egreso', 5) : []),
    [history, selectedCompany],
  );

  const handleCreate = async () => {
    const trimmed = newCompany.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await onCreateCompany(trimmed);
      setNewCompany('');
      setShowCreateInput(false);
    } finally {
      setCreating(false);
    }
  };

  // Mobile sort (same as before)
  const salud = useMemo(
    () => [...companySummaries].sort((a, b) => pick(a, cur).sal - pick(b, cur).sal),
    [companySummaries, cur],
  );
  const mejorSaldo = salud[salud.length - 1];

  if (!masGasta || !mejorSaldo) {
    return (
      <div className="border-2 border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
        <p className="font-semibold text-[var(--app-text-2)] mb-1">Sin empresas todavía</p>
        <p className="text-sm text-[var(--app-text-3)]">Las empresas se agregan automáticamente al registrar movimientos, o podés crearlas desde aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Desktop ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:block space-y-4">
        {/* 3-col KPI row with icon badge */}
        <div className="grid grid-cols-3 gap-4">
          <KpiBadgeCard label="Empresas activas" value={String(companySummaries.length)} icon={Building2} />
          <KpiBadgeCard
            label="Saldo total"
            value={formatCurrency(totalSaldo, cur)}
            tone={totalSaldo >= 0 ? 'success' : 'danger'}
            icon={Wallet}
          />
          <KpiBadgeCard
            label="Mayor gasto"
            value={formatCurrency(pick(masGasta, cur).gas, cur)}
            sub={masGasta.name}
            tone="danger"
            icon={TrendingDown}
          />
        </div>

        {/* Toolbar */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--app-text-3)]" aria-hidden="true" />
            <input
              type="search"
              value={companySearch}
              onChange={(e) => { setCompanySearch(e.target.value); setPage(0); }}
              placeholder="Buscar empresa…"
              aria-label="Buscar empresa"
              className="w-full rounded-lg border border-[var(--app-border)] pl-8 pr-4 py-2 text-sm outline-none focus:border-[var(--app-border-strong)] bg-[var(--app-surface-1)]"
            />
          </div>
          <button
            type="button"
            onClick={() => { setWithMovementsFilter((p) => !p); setPage(0); }}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${withMovementsFilter ? 'border-[var(--app-strong-surface)] bg-[color-mix(in_srgb,var(--app-strong-surface)_14%,transparent)] text-[var(--app-text-1)]' : 'border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]'}`}
          >
            Con movimientos
          </button>
          <CurToggle cur={cur} setCur={setCur} />
          {canWriteData && !showCreateInput && (
            <button
              type="button"
              onClick={() => setShowCreateInput(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--app-strong-surface)] px-3 py-2 text-xs font-medium text-[var(--app-strong-text)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva empresa
            </button>
          )}
          {canWriteData && showCreateInput && (
            <>
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') setShowCreateInput(false); }}
                placeholder="Nombre de la empresa…"
                autoFocus
                className="rounded-lg border border-[var(--app-border-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--app-strong-surface)] w-44 bg-[var(--app-surface-1)]"
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!newCompany.trim() || creating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--app-strong-surface)] px-3 py-2 text-xs font-medium text-[var(--app-strong-text)] disabled:opacity-50"
              >
                {creating ? 'Creando…' : 'Agregar'}
              </button>
              <button type="button" onClick={() => setShowCreateInput(false)} className="text-xs text-[var(--app-text-3)] hover:text-[var(--app-text-1)]">Cancelar</button>
            </>
          )}
        </div>

        {/* Table + detail panel */}
        <div className="flex border border-[var(--app-border)] rounded-xl overflow-hidden" style={{ minHeight: 460 }}>
          {/* Left: wide table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="overflow-auto flex-1">
              {paginatedRows.length === 0 ? (
                <p className="px-4 py-10 text-sm text-[var(--app-text-3)] text-center">Sin resultados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--app-surface-2)] border-b border-[var(--app-border)] z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Empresa</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Movim.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Ingresos</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Gastos</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Saldo</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Última actividad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {paginatedRows.map((c) => {
                      const p = pick(c, cur);
                      const isSelected = selectedCompany === c.name;
                      const lastAct = lastActivityByCompany.get(c.name);
                      return (
                        <tr
                          key={c.name}
                          onClick={() => setSelectedCompany(isSelected ? null : c.name)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-[var(--app-surface-3)]' : 'hover:bg-[var(--app-surface-2)]'}`}
                        >
                          <td className="px-4 py-3 min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="h-7 w-7 shrink-0 rounded-md bg-[var(--app-surface-3)] flex items-center justify-center text-[10px] font-bold text-[var(--app-text-2)]">
                                {initials(c.name)}
                              </div>
                              <span className="text-sm font-medium text-[var(--app-text-1)] truncate max-w-[160px]">{c.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-sm tabular-nums text-[var(--app-text-2)]">{c.movimientos}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-sm tabular-nums text-[var(--chart-income)]">{formatCurrency(p.ing, cur)}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-sm tabular-nums text-[var(--chart-expense)]">{formatCurrency(p.gas, cur)}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`text-sm font-semibold tabular-nums ${p.sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(p.sal, cur)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs text-[var(--app-text-3)] whitespace-nowrap">{lastAct ? fmtDate(lastAct) : '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination footer */}
            {filteredDesktop.length > 0 && (
              <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 flex items-center justify-between shrink-0">
                <span className="text-xs text-[var(--app-text-3)]">
                  Mostrando {page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, filteredDesktop.length)} de {filteredDesktop.length} empresa{filteredDesktop.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      className={`inline-flex items-center justify-center h-7 w-7 rounded-md border text-xs font-medium transition-colors ${i === page ? 'border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]' : 'border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]'}`}
                      aria-current={i === page ? 'page' : undefined}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          {selectedSummary && (
            <div className="w-72 shrink-0 border-l border-[var(--app-border)] overflow-y-auto bg-[var(--app-surface-1)]">
              <CompanyDetailPanel
                summary={selectedSummary}
                empresa={selectedEmpresa}
                recentHistory={selectedHistory}
                topCategories={selectedCategories}
                canWriteData={canWriteData}
                cur={cur}
                formatCurrency={formatCurrency}
                onEdit={() => { if (selectedEmpresa) onEditCompany(selectedEmpresa); }}
                onDelete={() => { if (selectedEmpresa) onDeleteCompany(selectedEmpresa); }}
                onViewAll={() => onDrilldown(selectedSummary.name, 'all')}
                onClose={() => setSelectedCompany(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile ───────────────────────────────────────────────────────── */}
      <div className="lg:hidden space-y-6">
        {companySummaries.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <MetricCard label="Más gasta" value={formatNumber(pick(masGasta, cur).gas)} sub={masGasta.name} tone="danger" icon={TrendingDown} onClick={() => onDrilldown(masGasta.name, 'all')} navLabel={`Ver movimientos de ${masGasta.name}`} />
              <MetricCard label="Mejor saldo" value={formatNumber(pick(mejorSaldo, cur).sal)} sub={mejorSaldo.name} tone={pick(mejorSaldo, cur).sal >= 0 ? 'success' : 'danger'} icon={TrendingUp} onClick={() => onDrilldown(mejorSaldo.name, 'all')} navLabel={`Ver movimientos de ${mejorSaldo.name}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <MetricChip label="Empresas" value={String(companySummaries.length)} icon={Building2} />
              <MetricChip label="En rojo" value={String(enRojo)} icon={Wallet} />
            </div>
          </div>
        )}

        <SectionCard
          title="Empresas"
          description="Ordenadas por saldo (las que están en rojo, primero)."
          action={<CurToggle cur={cur} setCur={setCur} />}
        >
          {canWriteData && (
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input
                label="Nombre de la empresa"
                hideLabel
                wrapClassName="flex-1"
                value={newCompany}
                onChange={(event) => setNewCompany(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate(); }}
                placeholder="Nombre de la nueva empresa"
              />
              <Button onClick={() => void handleCreate()} disabled={!newCompany.trim() || creating}>
                <Plus className="w-4 h-4" />
                {creating ? 'Creando…' : 'Agregar empresa'}
              </Button>
            </div>
          )}

          {salud.length === 0 ? (
            <div className="border-2 border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
              <p className="font-semibold text-[var(--app-text-2)] mb-1">Sin empresas todavía</p>
              <p className="text-sm text-[var(--app-text-3)]">Las empresas se agregan automáticamente al registrar movimientos, o podés crearlas desde aquí.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {salud.map((company) => {
                const p = pick(company, cur);
                return (
                  <div key={company.name} className="rounded-xl border border-[var(--app-border)] p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[var(--app-text-1)]">{company.name}</div>
                        <div className="text-xs text-[var(--app-text-3)]">{company.movimientos} movimientos</div>
                      </div>
                      {canWriteData && customCompanies.find((item) => item.nombre === company.name) && company.name !== 'Personal' && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => { const item = customCompanies.find((entry) => entry.nombre === company.name); if (item) onEditCompany(item); }} className="inline-flex items-center justify-center h-11 w-11 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)]" aria-label="Editar empresa"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => { const item = customCompanies.find((entry) => entry.nombre === company.name); if (item) onDeleteCompany(item); }} className="inline-flex items-center justify-center h-11 w-11 rounded-md border border-[var(--app-red-border)] text-[var(--chart-expense)]" aria-label="Borrar empresa"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Ingresos</div>
                        <div className="font-medium text-[var(--chart-income)] tabular-nums">{formatCurrency(p.ing, cur)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Gastos</div>
                        <div className="font-medium text-[var(--chart-expense)] tabular-nums">{formatCurrency(p.gas, cur)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Saldo</div>
                        <div className={`font-medium tabular-nums ${p.sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(p.sal, cur)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
