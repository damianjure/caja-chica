import { Pencil, Plus, Trash2, Building2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useState } from 'react';

import type { Empresa, Movimiento } from '../../../services/api';
import { SectionCard, MetricCard } from '../primitives';
import { topCategoriesByType, formatNumber, type TopCategory } from '../../../dashboard/summary';

function DrillPanel({
  title, items, accent, empty, onPick, formatCurrency,
}: {
  title: string;
  items: TopCategory[];
  accent: 'danger' | 'income';
  empty: string;
  onPick: (category: string) => void;
  formatCurrency: (amount: number, currency: 'ARS' | 'USD') => string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--app-text-3)]">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => onPick(c.category)}
              aria-label={`Ver movimientos de ${c.category}`}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2.5 text-left transition hover:border-[var(--app-border-strong)] active:scale-[0.99]"
            >
              <span className="truncate text-sm font-medium text-[var(--app-text-1)]">{c.category}</span>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${accent === 'danger' ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>
                {formatCurrency(c.ars, 'ARS')}{c.usd ? ` · ${formatCurrency(c.usd, 'USD')}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [drillCompany, setDrillCompany] = useState('all');
  const [cur, setCur] = useState<'ARS' | 'USD'>('ARS');

  const topGastos = topCategoriesByType(history, drillCompany, 'egreso', 3);
  const topIngresos = topCategoriesByType(history, drillCompany, 'ingreso', 3);
  const drillLabel = drillCompany === 'all' ? 'todas las empresas' : drillCompany;

  const pick = (c: CompanySummaryView) =>
    cur === 'ARS'
      ? { ing: c.ingresosArs, gas: c.gastosArs, sal: c.saldoArs }
      : { ing: c.ingresosUsd, gas: c.gastosUsd, sal: c.saldoUsd };

  const salud = [...companySummaries].sort((a, b) => pick(a).sal - pick(b).sal);
  const saludHint = (c: CompanySummaryView) => (pick(c).sal < 0 ? 'saldo negativo' : 'saldo positivo');
  const masGasta = [...companySummaries].sort((a, b) => pick(b).gas - pick(a).gas)[0];
  const mejorSaldo = salud[salud.length - 1];
  const enRojo = companySummaries.filter((c) => pick(c).sal < 0).length;

  const CurToggle = (
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

  return (
    <div className="space-y-6">
      {companySummaries.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard label="Más gasta" value={formatNumber(pick(masGasta).gas)} sub={masGasta.name} tone="danger" icon={TrendingDown} onClick={() => onDrilldown(masGasta.name, 'all')} navLabel={`Ver movimientos de ${masGasta.name}`} />
            <MetricCard label="Mejor saldo" value={formatNumber(pick(mejorSaldo).sal)} sub={mejorSaldo.name} tone={pick(mejorSaldo).sal >= 0 ? 'success' : 'danger'} icon={TrendingUp} onClick={() => onDrilldown(mejorSaldo.name, 'all')} navLabel={`Ver movimientos de ${mejorSaldo.name}`} />
            <MetricCard label="Empresas activas" value={String(companySummaries.length)} tone="neutral" icon={Building2} />
            <MetricCard label="En rojo" value={String(enRojo)} tone={enRojo > 0 ? 'danger' : 'neutral'} icon={Wallet} />
          </div>

          <SectionCard title="Salud por empresa" description={`Ingresos, gastos y saldo en ${cur} por empresa.`} action={CurToggle}>
            <div className="space-y-2">
              {salud.map((c) => {
                const p = pick(c);
                return (
                  <div key={c.name} className="flex flex-col gap-2 rounded-md border border-[var(--app-border)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--app-text-1)]">{c.name}</div>
                      <div className="text-xs text-[var(--app-text-3)]">{c.movimientos} mov · {saludHint(c)}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-6 sm:w-[26rem] sm:shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-3)]">Ingresos</div>
                        <div className="text-sm font-semibold tabular-nums text-[var(--chart-income)]">{formatCurrency(p.ing, cur)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-3)]">Gastos</div>
                        <div className="text-sm font-semibold tabular-nums text-[var(--chart-expense)]">{formatCurrency(p.gas, cur)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-3)]">Saldo</div>
                        <div className={`text-sm font-semibold tabular-nums ${p.sal >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(p.sal, cur)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </>
      )}

      <SectionCard
        title="Empresas"
        description="Tus empresas. Agregá una para editarla o borrarla."
        action={CurToggle}
      >
        {canWriteData && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              aria-label="Nombre de la empresa"
              value={newCompany}
              onChange={(event) => setNewCompany(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate(); }}
              placeholder="Nombre de la nueva empresa"
              className="flex-1 rounded-md border border-[var(--app-border)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
            />
            <button
              onClick={() => void handleCreate()}
              disabled={!newCompany.trim() || creating}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-5 py-2.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97] disabled:opacity-50 transition"
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Creando…' : 'Agregar empresa'}
            </button>
          </div>
        )}

        {companySummaries.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
            <p className="font-semibold text-[var(--app-text-2)] mb-1">Sin empresas todavía</p>
            <p className="text-sm text-[var(--app-text-3)]">Las empresas se agregan automáticamente al registrar movimientos, o podés crearlas desde aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companySummaries.map((company) => {
              const p = pick(company);
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

      <SectionCard
        title="Gastos e ingresos por categoría"
        description={`Top 3 de ${drillLabel}. Tocá una categoría para ver esos movimientos.`}
      >
        <div className="mb-4">
          <select
            aria-label="Elegir empresa para el detalle por categoría"
            value={drillCompany}
            onChange={(e) => setDrillCompany(e.target.value)}
            className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
          >
            {companiesList.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'Todas las empresas' : c}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DrillPanel title="Gastos que más pesan" items={topGastos} accent="danger" empty="Sin gastos en este alcance." onPick={(cat) => onDrilldown(drillCompany, cat)} formatCurrency={formatCurrency} />
          <DrillPanel title="Ingresos por categoría" items={topIngresos} accent="income" empty="Sin ingresos en este alcance." onPick={(cat) => onDrilldown(drillCompany, cat)} formatCurrency={formatCurrency} />
        </div>
      </SectionCard>
    </div>
  );
}
