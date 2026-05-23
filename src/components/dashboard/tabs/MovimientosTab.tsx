import { Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Categoria, Empresa } from '../../../services/api';
import { MetricCard, SectionCard } from '../primitives';

export default function MovimientosTab({
  incomeCount,
  expenseCount,
  historyCount,
  canWriteData,
  companiesList,
  selectedCompany,
  setSelectedCompany,
  movementType,
  setMovementType,
  movementCurrency,
  setMovementCurrency,
  customCompanies,
  categories,
  onEditCompany,
  onDeleteCompany,
  onDeleteCategory,
  historyCards,
}: {
  incomeCount: number;
  expenseCount: number;
  historyCount: number;
  canWriteData: boolean;
  composer: ReactNode;
  companiesList: string[];
  selectedCompany: string;
  setSelectedCompany: (company: string) => void;
  movementType: 'all' | 'ingreso' | 'egreso';
  setMovementType: (value: 'all' | 'ingreso' | 'egreso') => void;
  movementCurrency: 'all' | 'ARS' | 'USD';
  setMovementCurrency: (value: 'all' | 'ARS' | 'USD') => void;
  customCompanies: Empresa[];
  categories: Categoria[];
  onEditCompany: (company: Empresa) => void;
  onDeleteCompany: (company: Empresa) => void;
  onDeleteCategory: (category: Categoria) => void;
  historyCards: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Ingresos" value={String(incomeCount)} tone="success" />
        <MetricCard label="Gastos" value={String(expenseCount)} tone="danger" />
        <MetricCard label="Total movimientos" value={String(historyCount)} />
      </div>

      <SectionCard title="Transacciones filtrables" description="Filtrá por empresa y revisá el historial con trazabilidad sobre el texto original. Todo lo cargado entra como conciliado por defecto.">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 id="history-title" className="text-xl font-semibold">Historial de movimientos</h2>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              {companiesList.map((company) => {
                const companyEntity = customCompanies.find((item) => item.nombre === company);
                const isSelected = selectedCompany === company;
                const showActions = Boolean(canWriteData && companyEntity && isSelected);
                return (
                  <div
                    key={company}
                    className={`inline-flex items-center rounded-full text-xs font-medium whitespace-nowrap transition duration-150 border ${
                      isSelected
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white border-neutral-200 text-neutral-500 hover:border-[var(--app-text-2)]'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedCompany(company)}
                      className={`py-1.5 active:scale-[0.95] ${showActions ? 'pl-4 pr-2' : 'px-4'}`}
                    >
                      {company === 'all' ? 'Todas las empresas' : company}
                    </button>
                    {showActions && companyEntity && (
                      <span className="flex items-center gap-0.5 pr-1.5">
                        <button
                          onClick={(event) => { event.stopPropagation(); onEditCompany(companyEntity); }}
                          className="rounded-full p-1 text-white/60 hover:text-white transition-colors"
                          aria-label={`Editar ${company}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(event) => { event.stopPropagation(); onDeleteCompany(companyEntity); }}
                          className="rounded-full p-1 text-white/60 hover:text-red-300 transition-colors"
                          aria-label={`Eliminar ${company}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'ingreso', label: 'Ingresos' },
              { id: 'egreso', label: 'Gastos' },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setMovementType(filter.id as 'all' | 'ingreso' | 'egreso')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.95] ${
                  movementType === filter.id
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'
                }`}
              >
                {filter.label}
              </button>
            ))}
            {[
              { id: 'all', label: 'Todas las monedas' },
              { id: 'ARS', label: 'ARS' },
              { id: 'USD', label: 'USD' },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setMovementCurrency(filter.id as 'all' | 'ARS' | 'USD')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.95] ${
                  movementCurrency === filter.id
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide border-t border-neutral-200 pt-4">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest mr-2">Categorías:</span>
            {categories.map((category) => (
              <div key={category.id} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 pr-1.5">
                <span className="text-xs font-medium text-neutral-600">{category.nombre}</span>
                {canWriteData && (
                  <button
                    onClick={() => onDeleteCategory(category)}
                    className="rounded-full p-0.5 text-neutral-400 hover:text-red-600 transition-colors"
                    aria-label={`Eliminar categoría ${category.nombre}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {historyCards}
        </div>
      </SectionCard>
    </div>
  );
}
