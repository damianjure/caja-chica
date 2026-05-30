import type { ReactNode } from 'react';
import { X, Share2 } from 'lucide-react';

import type { Categoria } from '../../../services/api';
import type { DatePeriod } from '../../../dashboard/summary';
import { MetricCard, SectionCard } from '../primitives';

type Tipo = 'all' | 'ingreso' | 'egreso';
type Moneda = 'all' | 'ARS' | 'USD';

const DATE_OPTS: { id: DatePeriod; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'anio', label: 'Año' },
  { id: 'rango', label: 'Rango' },
];
const TIPO_OPTS: { id: Tipo; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'ingreso', label: 'Ingresos' },
  { id: 'egreso', label: 'Gastos' },
];
const MONEDA_OPTS: { id: Moneda; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'ARS', label: 'ARS' },
  { id: 'USD', label: 'USD' },
];

function Segmented<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex gap-0.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-2)] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition duration-150 ${
            value === o.id
              ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]'
              : 'text-[var(--app-text-2)] hover:text-[var(--app-text-1)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SELECT_CLASS =
  'rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-[var(--app-text-1)]';

function Pill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-border)] bg-[var(--app-surface-2)] py-1 pl-3 pr-1.5 text-xs font-medium text-[var(--app-text-2)]">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Quitar filtro ${label}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--app-text-3)] hover:text-[var(--app-text-1)]"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export default function MovimientosTab({
  incomeCount,
  expenseCount,
  historyCount,
  companiesList,
  categories,
  selectedCompany,
  setSelectedCompany,
  movementType,
  setMovementType,
  movementCurrency,
  setMovementCurrency,
  selectedCategory,
  setSelectedCategory,
  datePeriod,
  setDatePeriod,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  hasActiveFilters,
  resetFilters,
  onExport,
  historyCards,
}: {
  incomeCount: number;
  expenseCount: number;
  historyCount: number;
  companiesList: string[];
  categories: Categoria[];
  selectedCompany: string;
  setSelectedCompany: (company: string) => void;
  movementType: Tipo;
  setMovementType: (value: Tipo) => void;
  movementCurrency: Moneda;
  setMovementCurrency: (value: Moneda) => void;
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  datePeriod: DatePeriod;
  setDatePeriod: (value: DatePeriod) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  onExport: () => void;
  historyCards: ReactNode;
}) {
  const dateLabel = DATE_OPTS.find((o) => o.id === datePeriod)?.label ?? 'Todo';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Ingresos" value={String(incomeCount)} tone="success" />
        <MetricCard label="Gastos" value={String(expenseCount)} tone="danger" />
        <MetricCard label="Total movimientos" value={String(historyCount)} />
      </div>

      <SectionCard title="Historial de movimientos" description="Filtrá por fecha, empresa, tipo, moneda o categoría. Todo lo cargado entra como conciliado por defecto.">
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={datePeriod} options={DATE_OPTS} onChange={setDatePeriod} ariaLabel="Filtrar por período" />
            <Segmented value={movementType} options={TIPO_OPTS} onChange={setMovementType} ariaLabel="Filtrar por tipo" />
            <Segmented value={movementCurrency} options={MONEDA_OPTS} onChange={setMovementCurrency} ariaLabel="Filtrar por moneda" />
            <select aria-label="Filtrar por empresa" className={SELECT_CLASS} value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
              {companiesList.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'Todas las empresas' : c}</option>
              ))}
            </select>
            <select aria-label="Filtrar por categoría" className={SELECT_CLASS} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="all">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onExport}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-strong-text)] hover:border-[var(--app-border-strong)] active:scale-[0.97] transition duration-150"
              title="Exportar / compartir los movimientos filtrados"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar
            </button>
          </div>

          {/* Rango personalizado */}
          {datePeriod === 'rango' && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-2)]">
              <label className="flex items-center gap-1.5">Desde
                <input type="date" className={SELECT_CLASS} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Fecha desde" />
              </label>
              <label className="flex items-center gap-1.5">Hasta
                <input type="date" className={SELECT_CLASS} value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Fecha hasta" />
              </label>
            </div>
          )}

          {/* Pills de filtro activo */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--app-border)] pt-3">
              {datePeriod !== 'all' && <Pill label={dateLabel} onClear={() => setDatePeriod('all')} />}
              {movementType !== 'all' && <Pill label={movementType === 'ingreso' ? 'Ingresos' : 'Gastos'} onClear={() => setMovementType('all')} />}
              {movementCurrency !== 'all' && <Pill label={movementCurrency} onClear={() => setMovementCurrency('all')} />}
              {selectedCompany !== 'all' && <Pill label={selectedCompany} onClear={() => setSelectedCompany('all')} />}
              {selectedCategory !== 'all' && <Pill label={selectedCategory} onClear={() => setSelectedCategory('all')} />}
              <button type="button" onClick={resetFilters} className="text-xs text-[var(--app-text-3)] underline underline-offset-2 hover:text-[var(--app-text-1)]">
                Limpiar todo
              </button>
            </div>
          )}

          {historyCards}
        </div>
      </SectionCard>
    </div>
  );
}
