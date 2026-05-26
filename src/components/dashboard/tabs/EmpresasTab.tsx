import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { Empresa, Movimiento } from '../../../services/api';
import { ChartCard, HorizontalBarList } from '../Charts';
import { PlaceholderPanel, SectionCard } from '../primitives';
import InformesTab from './InformesTab';

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
  canUseDrive,
  canConnectDrive,
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
  canUseDrive: boolean;
  canConnectDrive: boolean;
}) {
  const [newCompany, setNewCompany] = useState('');
  const [creating, setCreating] = useState(false);

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
              className="flex-1 rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
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

      <SectionCard title="Comparación por empresa" description="Mirá cada unidad con ingresos, gastos y saldo neto por moneda.">
        {companySummaries.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay movimientos para comparar empresas.</p>
        ) : (
          <div className="space-y-6">
            <ChartCard title="Ranking de ingresos ARS" description="Vista rápida de qué empresa o frente comercial mueve más caja.">
              <HorizontalBarList items={topCompanies} emptyLabel="Todavía no hay empresas con actividad." />
            </ChartCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companySummaries.map((company) => (
                <div key={company.name} className="rounded-xl border border-neutral-200 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-neutral-900">{company.name}</div>
                      <div className="text-xs text-neutral-500">{company.movimientos} movimientos</div>
                    </div>
                    {canWriteData && customCompanies.find((item) => item.nombre === company.name) && company.name !== 'Personal' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const item = customCompanies.find((entry) => entry.nombre === company.name);
                            if (item) onEditCompany(item);
                          }}
                          className="inline-flex items-center justify-center h-11 w-11 rounded-xl border border-neutral-200 text-neutral-700 hover:border-[var(--app-text-2)]"
                          aria-label="Editar empresa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const item = customCompanies.find((entry) => entry.nombre === company.name);
                            if (item) onDeleteCompany(item);
                          }}
                          className="inline-flex items-center justify-center h-11 w-11 rounded-xl border border-red-200 text-red-600 hover:border-red-400"
                          aria-label="Borrar empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                    <div>
                      <div className="text-neutral-500 uppercase tracking-widest text-xs mb-1">Ingresos ARS</div>
                      <div className="font-medium text-green-600 tabular-nums">{formatCurrency(company.ingresosArs, 'ARS')}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-widest text-xs mb-1">Gastos ARS</div>
                      <div className="font-medium text-red-600 tabular-nums">{formatCurrency(company.gastosArs, 'ARS')}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-widest text-xs mb-1">Saldo ARS</div>
                      <div className={`font-medium tabular-nums ${company.saldoArs >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(company.saldoArs, 'ARS')}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-widest text-xs mb-1">Ingresos USD</div>
                      <div className="font-medium text-green-600 tabular-nums">{formatCurrency(company.ingresosUsd, 'USD')}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-widest text-xs mb-1">Gastos USD</div>
                      <div className="font-medium text-red-600 tabular-nums">{formatCurrency(company.gastosUsd, 'USD')}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-widest text-xs mb-1">Saldo USD</div>
                      <div className={`font-medium tabular-nums ${company.saldoUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(company.saldoUsd, 'USD')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <PlaceholderPanel title="Sucursales y unidades de negocio" body="Hoy estamos usando empresa como proxy de unidad. Si querés sucursal/canal reales, hay que modelarlos explícitamente en la base y en el parser." />

      <div className="border-t border-neutral-200 pt-6">
        <InformesTab
          history={history}
          companiesList={companiesList}
          canWriteData={canWriteData}
          canUseDrive={canUseDrive}
          canConnectDrive={canConnectDrive}
        />
      </div>
    </div>
  );
}
