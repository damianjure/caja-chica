import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { Empresa, Movimiento } from '../../../services/api';
import { ChartCard, HorizontalBarList } from '../Charts';
import { SectionCard } from '../primitives';
import { topCategoriesByType, type TopCategory } from '../../../dashboard/summary';

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

  const topGastos = topCategoriesByType(history, drillCompany, 'egreso', 3);
  const topIngresos = topCategoriesByType(history, drillCompany, 'ingreso', 3);
  const drillLabel = drillCompany === 'all' ? 'todas las empresas' : drillCompany;

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
      {canWriteData && (
        <SectionCard title="Agregar empresa" description="Registrá una empresa para poder editarla y borrarla.">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              aria-label="Nombre de la empresa"
              value={newCompany}
              onChange={(event) => setNewCompany(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate(); }}
              placeholder="Nombre de la empresa"
              className="flex-1 rounded-xl border border-[var(--app-border)] px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
            />
            <button
              onClick={() => void handleCreate()}
              disabled={!newCompany.trim() || creating}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-900 px-5 py-3 text-white font-medium hover:border-[var(--app-text-2)] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Creando...' : 'Agregar'}
            </button>
          </div>
        </SectionCard>
      )}

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

      <SectionCard title="Comparación por empresa" description="Mirá cada unidad con ingresos, gastos y saldo neto por moneda.">
        {companySummaries.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
            <p className="font-semibold text-[var(--app-text-2)] mb-1">Sin empresas todavía</p>
            <p className="text-sm text-[var(--app-text-3)]">Las empresas se agregan automáticamente al registrar movimientos, o podés crearlas desde aquí.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <ChartCard title="Ranking de ingresos ARS" description="Vista rápida de qué empresa o frente comercial mueve más caja.">
              <HorizontalBarList items={topCompanies} emptyLabel="Todavía no hay empresas con actividad." />
            </ChartCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companySummaries.map((company) => (
                <div key={company.name} className="rounded-xl border border-[var(--app-border)] p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[var(--app-text-1)]">{company.name}</div>
                      <div className="text-xs text-[var(--app-text-3)]">{company.movimientos} movimientos</div>
                    </div>
                    {canWriteData && customCompanies.find((item) => item.nombre === company.name) && company.name !== 'Personal' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const item = customCompanies.find((entry) => entry.nombre === company.name);
                            if (item) onEditCompany(item);
                          }}
                          className="inline-flex items-center justify-center h-11 w-11 rounded-xl border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-text-2)]"
                          aria-label="Editar empresa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const item = customCompanies.find((entry) => entry.nombre === company.name);
                            if (item) onDeleteCompany(item);
                          }}
                          className="inline-flex items-center justify-center h-11 w-11 rounded-xl border border-red-200 text-[var(--chart-expense)] hover:border-red-400"
                          aria-label="Borrar empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                    <div>
                      <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Ingresos ARS</div>
                      <div className="font-medium text-[var(--chart-income)] tabular-nums">{formatCurrency(company.ingresosArs, 'ARS')}</div>
                    </div>
                    <div>
                      <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Gastos ARS</div>
                      <div className="font-medium text-[var(--chart-expense)] tabular-nums">{formatCurrency(company.gastosArs, 'ARS')}</div>
                    </div>
                    <div>
                      <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Saldo ARS</div>
                      <div className={`font-medium tabular-nums ${company.saldoArs >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(company.saldoArs, 'ARS')}</div>
                    </div>
                    <div>
                      <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Ingresos USD</div>
                      <div className="font-medium text-[var(--chart-income)] tabular-nums">{formatCurrency(company.ingresosUsd, 'USD')}</div>
                    </div>
                    <div>
                      <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Gastos USD</div>
                      <div className="font-medium text-[var(--chart-expense)] tabular-nums">{formatCurrency(company.gastosUsd, 'USD')}</div>
                    </div>
                    <div>
                      <div className="text-[var(--app-text-3)] uppercase tracking-widest text-xs mb-1">Saldo USD</div>
                      <div className={`font-medium tabular-nums ${company.saldoUsd >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{formatCurrency(company.saldoUsd, 'USD')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
