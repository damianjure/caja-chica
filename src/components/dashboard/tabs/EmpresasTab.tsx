import {
  Building2, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Empresa, Movimiento } from '../../../services/api';
import { SectionCard, MetricCard, MetricChip } from '../primitives';
import { Input } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { topCategoriesByType, formatNumber, type TopCategory } from '../../../dashboard/summary';

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--app-border)] shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--app-text-1)] truncate">{summary.name}</p>
          <p className="text-xs text-[var(--app-text-3)] mt-0.5">{summary.movimientos} movimientos</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
                aria-label="Editar empresa"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--app-red-border)] text-[var(--chart-expense)] hover:border-red-400"
                aria-label="Borrar empresa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-border-strong)]"
            aria-label="Cerrar panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-[var(--app-border)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">Ingresos</div>
            <div className="font-semibold text-[var(--chart-income)] tabular-nums">{formatCurrency(p.ing, cur)}</div>
          </div>
          <div className="rounded-xl border border-[var(--app-border)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">Gastos</div>
            <div className="font-semibold text-[var(--chart-expense)] tabular-nums">{formatCurrency(p.gas, cur)}</div>
          </div>
          <div className="rounded-xl border border-[var(--app-border)] p-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">Saldo</div>
            <div className={`font-semibold tabular-nums ${p.sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(p.sal, cur)}</div>
          </div>
        </div>

        {/* Top categories */}
        {topCategories.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-text-3)] mb-2">Gastos por categoría</h4>
            <div className="space-y-1.5">
              {topCategories.map((c) => (
                <div key={c.category} className="flex items-center justify-between gap-3 text-sm py-1 border-b border-[var(--app-border)] last:border-0">
                  <span className="truncate text-[var(--app-text-2)]">{c.category}</span>
                  <span className="shrink-0 font-medium text-[var(--chart-expense)] tabular-nums text-xs">{formatCurrency(c.ars, 'ARS')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent movements */}
        {recentHistory.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--app-text-3)] mb-2">Movimientos recientes</h4>
            <div className="space-y-1.5">
              {recentHistory.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-1 border-b border-[var(--app-border)] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--app-text-1)] truncate">{m.descripcion}</p>
                    <p className="text-[11px] text-[var(--app-text-3)]">
                      {new Date(m.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
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
      <footer className="px-6 py-4 border-t border-[var(--app-border)] shrink-0">
        <button
          type="button"
          onClick={onViewAll}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--app-border-strong)] px-4 py-2.5 text-sm font-medium text-[var(--app-text-1)] hover:border-[var(--app-text-2)] transition-colors"
        >
          Ver todos los movimientos
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
  const [cur, setCur] = useState<'ARS' | 'USD'>('ARS');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState('');

  const salud = useMemo(
    () => [...companySummaries].sort((a, b) => pick(a, cur).sal - pick(b, cur).sal),
    [companySummaries, cur],
  );

  const masGasta = [...companySummaries].sort((a, b) => pick(b, cur).gas - pick(a, cur).gas)[0];
  const mejorSaldo = salud[salud.length - 1];
  const enRojo = companySummaries.filter((c) => pick(c, cur).sal < 0).length;

  const filteredSalud = useMemo(
    () =>
      companySearch
        ? salud.filter((c) => c.name.toLowerCase().includes(companySearch.toLowerCase()))
        : salud,
    [salud, companySearch],
  );

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
    } finally {
      setCreating(false);
    }
  };

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
      {/* ── Desktop: master-detail ──────────────────────────────────────── */}
      <div className="hidden lg:block space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--app-border)] px-4 py-3">
            <div className="text-xl font-bold text-[var(--app-text-1)]">{companySummaries.length}</div>
            <div className="text-xs uppercase tracking-widest text-[var(--app-text-3)] mt-0.5">Empresas</div>
          </div>
          <div className="rounded-xl border border-[var(--app-border)] px-4 py-3">
            <div className="text-xl font-bold text-[var(--chart-expense)] tabular-nums">{formatCurrency(pick(masGasta, cur).gas, cur)}</div>
            <div className="text-xs text-[var(--app-text-3)] mt-0.5 truncate">Más gasta: {masGasta.name}</div>
          </div>
          <div className="rounded-xl border border-[var(--app-border)] px-4 py-3">
            <div className={`text-xl font-bold tabular-nums ${pick(mejorSaldo, cur).sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(pick(mejorSaldo, cur).sal, cur)}</div>
            <div className="text-xs text-[var(--app-text-3)] mt-0.5 truncate">Mejor saldo: {mejorSaldo.name}</div>
          </div>
          <div className="rounded-xl border border-[var(--app-border)] px-4 py-3">
            <div className={`text-xl font-bold ${enRojo > 0 ? 'text-[var(--chart-expense)]' : 'text-[var(--app-text-1)]'}`}>{enRojo}</div>
            <div className="text-xs uppercase tracking-widest text-[var(--app-text-3)] mt-0.5">En rojo</div>
          </div>
        </div>

        {/* Search bar + currency toggle */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--app-text-3)]" aria-hidden="true" />
            <input
              type="search"
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="Buscar empresa…"
              aria-label="Buscar empresa"
              className="w-full rounded-md border border-[var(--app-border-strong)] pl-8 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
            />
          </div>
          <CurToggle cur={cur} setCur={setCur} />
          {canWriteData && (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="Nueva empresa…"
                aria-label="Nombre de la nueva empresa"
                className="rounded-md border border-[var(--app-border-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)] w-44"
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!newCompany.trim() || creating}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] border border-[var(--app-strong-surface)] px-3 py-2 text-xs font-medium text-[var(--app-strong-text)] disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                {creating ? 'Creando…' : 'Agregar'}
              </button>
            </div>
          )}
        </div>

        {/* Two-column master-detail */}
        <div className="flex border border-[var(--app-border)] rounded-xl overflow-hidden" style={{ minHeight: 440 }}>
          {/* Left: companies table */}
          <div className="w-[380px] shrink-0 border-r border-[var(--app-border)] overflow-y-auto">
            {filteredSalud.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--app-text-3)] text-center">Sin resultados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--app-surface-2)] border-b border-[var(--app-border)] z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Empresa</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Gastos</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {filteredSalud.map((c) => {
                    const p = pick(c, cur);
                    const isSelected = selectedCompany === c.name;
                    const lastAct = lastActivityByCompany.get(c.name);
                    return (
                      <tr
                        key={c.name}
                        onClick={() => setSelectedCompany(c.name)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-[var(--app-surface-3)]' : 'hover:bg-[var(--app-surface-2)]'}`}
                      >
                        <td className="px-4 py-2.5 min-w-0">
                          <div className="text-xs font-medium text-[var(--app-text-1)] truncate max-w-[140px]">{c.name}</div>
                          <div className="text-[11px] text-[var(--app-text-3)]">{c.movimientos} mov{lastAct ? ` · ${new Date(lastAct).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}` : ''}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs tabular-nums text-[var(--chart-expense)]">{formatCurrency(p.gas, cur)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-semibold tabular-nums ${p.sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(p.sal, cur)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 overflow-y-auto bg-[var(--app-surface-1)]">
            {!selectedSummary ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
                <Building2 className="w-10 h-10 text-[var(--app-text-3)] mb-3" />
                <p className="text-sm text-[var(--app-text-3)]">Seleccioná una empresa para ver su detalle.</p>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile: existing card layout ─────────────────────────────────── */}
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
          description="Ordenadas por saldo (las que están en rojo, primero). Agregá una para editarla o borrarla."
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
                          <button
                            onClick={() => { const item = customCompanies.find((entry) => entry.nombre === company.name); if (item) onEditCompany(item); }}
                            className="inline-flex items-center justify-center h-11 w-11 rounded-md border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
                            aria-label="Editar empresa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { const item = customCompanies.find((entry) => entry.nombre === company.name); if (item) onDeleteCompany(item); }}
                            className="inline-flex items-center justify-center h-11 w-11 rounded-md border border-[var(--app-red-border)] text-[var(--chart-expense)] hover:border-red-400"
                            aria-label="Borrar empresa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Ingresos {cur}</div>
                        <div className="font-medium text-[var(--chart-income)] tabular-nums">{formatCurrency(p.ing, cur)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Gastos {cur}</div>
                        <div className="font-medium text-[var(--chart-expense)] tabular-nums">{formatCurrency(p.gas, cur)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Saldo {cur}</div>
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
