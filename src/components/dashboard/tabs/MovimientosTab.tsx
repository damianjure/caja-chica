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
        <MetricCard label="Egresos" value={String(expenseCount)} tone="danger" />
        <MetricCard label="Total movimientos" value={String(historyCount)} />
      </div>

      <SectionCard title="Transacciones filtrables" description="Filtrá por empresa y revisá el historial con trazabilidad sobre el texto original. Todo lo cargado entra como conciliado por defecto.">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 id="history-title" className="text-xl font-semibold">Historial de movimientos</h2>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              {companiesList.map((company) => {
                const companyEntity = customCompanies.find((item) => item.nombre === company);
                return (
                  <div key={company} className="relative group">
                    <button
                      onClick={() => setSelectedCompany(company)}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition duration-150 active:scale-[0.95] ${selectedCompany === company ? 'bg-neutral-900 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:border-neutral-400'}`}
                    >
                      {company === 'all' ? 'Todas las empresas' : company}
                    </button>
                    {canWriteData && companyEntity && (
                      <div className="absolute -top-1 -right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(event) => { event.stopPropagation(); onEditCompany(companyEntity); }} className="bg-white border border-neutral-200 text-neutral-700 rounded-full p-0.5 shadow-sm">
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button onClick={(event) => { event.stopPropagation(); onDeleteCompany(companyEntity); }} className="bg-red-500 text-white rounded-full p-0.5 shadow-sm">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'ingreso', label: 'Ingresos' },
              { id: 'egreso', label: 'Egresos' },
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

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide border-t border-neutral-100 pt-4">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest mr-2">Categorías:</span>
            {categories.map((category) => (
              <div key={category.id} className="group relative">
                <span className="px-3 py-1 bg-neutral-100 text-neutral-600 rounded-full text-xs font-medium">{category.nombre}</span>
                {canWriteData && (
                  <button onClick={() => onDeleteCategory(category)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                    <Trash2 className="w-2.5 h-2.5" />
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
