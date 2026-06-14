import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Share2, ChevronDown, Loader2, FileText, FileSpreadsheet, HardDriveUpload, Plus, Trash2, Search, Check } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from 'sonner';
import type { OnboardingState } from '../../../services/api';

function ExportMenu({
  onCsv, onPdf, onDrive, driveConnected, busy,
}: {
  onCsv: () => void;
  onPdf: () => void;
  onDrive: () => void;
  driveConnected: boolean;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = (icon: ReactNode, label: string, onClick: () => void) => (
    <button
      role="menuitem"
      onClick={() => { setOpen(false); onClick(); }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors"
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-strong-text)] transition duration-150 active:scale-[0.97] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" aria-hidden="true" />}
        Exportar
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Exportar" className="anim-fade-in-down absolute right-0 top-9 z-30 w-56 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-1.5 shadow-[var(--app-shadow-md)]">
          {item(<FileSpreadsheet className="h-4 w-4 text-[var(--app-text-3)]" />, 'CSV (lo que ves)', onCsv)}
          {item(<FileText className="h-4 w-4 text-[var(--app-text-3)]" />, 'PDF', onPdf)}
          {driveConnected && item(<HardDriveUpload className="h-4 w-4 text-[var(--app-text-3)]" />, 'Guardar en Drive', onDrive)}
        </div>
      )}
    </div>
  );
}

import type { Categoria } from '../../../services/api';
import type { DatePeriod } from '../../../dashboard/summary';
import { SectionCard } from '../primitives';

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

function Segmented<T extends string>({
  value, options, onChange, ariaLabel, tones,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  tones?: Partial<Record<T, 'income' | 'expense'>>;
}) {
  const activeClass = (id: T) => {
    const tone = tones?.[id];
    if (tone === 'income') return 'bg-[var(--app-green-surface)] text-[var(--chart-income)]';
    if (tone === 'expense') return 'bg-[var(--app-red-surface)] text-[var(--chart-expense)]';
    return 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]';
  };
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
              ? activeClass(o.id)
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

function Pill({ label, onClear, tone }: { label: string; onClear: () => void; tone?: 'income' | 'expense' }) {
  const toneClass = tone === 'income'
    ? 'border-[var(--app-green-border)] bg-[var(--app-green-surface)] text-[var(--chart-income)]'
    : tone === 'expense'
      ? 'border-[var(--app-red-border)] bg-[var(--app-red-surface)] text-[var(--chart-expense)]'
      : 'border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text-2)]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-xs font-medium ${toneClass}`}>
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Quitar filtro ${label}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-70 hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FilterCard({ label, value, tone = 'neutral', selected, onClick }: { label: string; value: string; tone?: 'neutral' | 'income' | 'expense'; selected: boolean; onClick: () => void }) {
  const valueColor = tone === 'income' ? 'text-[var(--chart-income)]' : tone === 'expense' ? 'text-[var(--chart-expense)]' : 'text-[var(--app-text-1)]';
  const selectedClass = selected
    ? (tone === 'income'
        ? 'border-[var(--app-green-border)] bg-[var(--app-green-surface)]'
        : tone === 'expense'
          ? 'border-[var(--app-red-border)] bg-[var(--app-red-surface)]'
          : 'border-[var(--app-border-strong)] bg-[var(--app-surface-3)]')
    : 'border-[var(--app-border)] bg-[var(--app-surface-1)] hover:border-[var(--app-border-strong)]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative px-5 py-4 rounded-xl border text-left shadow-[var(--app-shadow-sm)] transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text-1)] ${selectedClass}`}
    >
      <div className="text-xs font-bold text-[var(--app-text-3)] uppercase tracking-widest mb-2">{label}</div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums ${valueColor}`}>{value}</div>
      {selected && <Check className="absolute top-3 right-3 w-4 h-4 text-[var(--app-text-2)]" aria-hidden="true" />}
    </button>
  );
}

export default function MovimientosTab({
  totalCount,
  arsIngreso,
  arsEgreso,
  usdNeto,
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
  searchText,
  setSearchText,
  onOpenSearch,
  hasActiveFilters,
  resetFilters,
  canWriteData,
  onOpenCarga,
  onExportCsv,
  onExportPdf,
  onExportDrive,
  driveConnected,
  exporting,
  onboardingState,
  onDemoDeleted,
  historyCards,
}: {
  totalCount: number;
  arsIngreso: string;
  arsEgreso: string;
  usdNeto: string;
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
  searchText: string;
  setSearchText: (value: string) => void;
  onOpenSearch: () => void;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  canWriteData: boolean;
  onOpenCarga: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onExportDrive: () => void;
  driveConnected: boolean;
  exporting: boolean;
  onboardingState?: OnboardingState;
  onDemoDeleted?: () => void;
  historyCards: ReactNode;
}) {
  const dateLabel = DATE_OPTS.find((o) => o.id === datePeriod)?.label ?? 'Todo';
  const [deletingDemo, setDeletingDemo] = useState(false);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);

  const showDemoBanner = !demoBannerDismissed && onboardingState !== 'cleaned';

  const handleDeleteDemo = async () => {
    setDeletingDemo(true);
    try {
      await api.deleteDemoData();
      toast.success('Datos de muestra eliminados.');
      setDemoBannerDismissed(true);
      onDemoDeleted?.();
    } catch {
      toast.error('No se pudieron eliminar los datos de muestra.');
    } finally {
      setDeletingDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      {showDemoBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <span className="text-sm text-amber-800 dark:text-amber-300">
            Estás viendo datos de muestra.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleDeleteDemo()}
              disabled={deletingDemo}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
            >
              {deletingDemo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Borrar ahora
            </button>
            <button
              type="button"
              onClick={() => setDemoBannerDismissed(true)}
              aria-label="Cerrar aviso"
              className="p-0.5 text-amber-600 hover:text-amber-800 dark:text-amber-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <FilterCard label="Todos" value={`${totalCount} mov`} selected={movementType === 'all' && movementCurrency === 'all'} onClick={() => { setMovementType('all'); setMovementCurrency('all'); }} />
        <FilterCard label="Ingresos" value={arsIngreso} tone="income" selected={movementType === 'ingreso' && movementCurrency === 'all'} onClick={() => { setMovementType('ingreso'); setMovementCurrency('all'); }} />
        <FilterCard label="Gastos" value={arsEgreso} tone="expense" selected={movementType === 'egreso' && movementCurrency === 'all'} onClick={() => { setMovementType('egreso'); setMovementCurrency('all'); }} />
        <FilterCard label="En USD" value={usdNeto} selected={movementCurrency === 'USD'} onClick={() => { setMovementType('all'); setMovementCurrency('USD'); }} />
      </div>

      <SectionCard
        title="Movimientos"
        description="Filtrá por fecha, empresa, tipo, moneda o categoría."
        action={
          <div className="flex items-center gap-2">
            {canWriteData && (
              <button
                type="button"
                onClick={onOpenCarga}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--app-strong-surface)] px-3 py-1.5 text-xs font-bold text-[var(--app-strong-text)] transition duration-150 active:scale-[0.97]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Cargar
              </button>
            )}
            <ExportMenu onCsv={onExportCsv} onPdf={onExportPdf} onDrive={onExportDrive} driveConnected={driveConnected} busy={exporting} />
          </div>
        }
      >
        <div className="space-y-4">
          {/* Buscar: campo inline (filtra la lista) + acceso al buscador global */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-text-3)]" aria-hidden="true" />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por descripción, empresa o categoría…"
                aria-label="Buscar en movimientos"
                className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] py-2 pl-9 pr-3 text-sm text-[var(--app-text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
              />
            </div>
            <button
              type="button"
              onClick={onOpenSearch}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-text-2)] hover:border-[var(--app-text-2)] hover:text-[var(--app-text-1)] transition"
              title="Búsqueda global"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Global</span>
            </button>
          </div>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={datePeriod} options={DATE_OPTS} onChange={setDatePeriod} ariaLabel="Filtrar por período" />
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
              {movementType !== 'all' && <Pill label={movementType === 'ingreso' ? 'Ingresos' : 'Gastos'} tone={movementType === 'ingreso' ? 'income' : 'expense'} onClear={() => setMovementType('all')} />}
              {movementCurrency !== 'all' && <Pill label={movementCurrency} onClear={() => setMovementCurrency('all')} />}
              {selectedCompany !== 'all' && <Pill label={selectedCompany} onClear={() => setSelectedCompany('all')} />}
              {selectedCategory !== 'all' && <Pill label={selectedCategory} onClear={() => setSelectedCategory('all')} />}
              {searchText.trim() !== '' && <Pill label={`"${searchText.trim()}"`} onClear={() => setSearchText('')} />}
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
