import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { type Movimiento, type MovementSource } from '../../services/api';
import { filterMovements, periodToRange, type DatePeriod } from '../../dashboard/summary';

/** User-facing source filter groups (Ticket bundles every photo/scan variant). */
export type SourceFilter = 'all' | 'web' | 'telegram' | 'ticket' | 'pdf' | 'statement' | 'recurrente';

export const SOURCE_FILTER_OPTIONS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'Todas las fuentes' },
  { id: 'web', label: 'Web' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'ticket', label: 'Ticket / foto' },
  { id: 'pdf', label: 'PDF' },
  { id: 'statement', label: 'Resumen' },
  { id: 'recurrente', label: 'Recurrente' },
];

function matchesSource(source: MovementSource | null | undefined, filter: SourceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'ticket') return source === 'web_ticket' || source === 'photo' || source === 'handwritten' || source === 'multi';
  return source === filter;
}

export interface MovementsFilterResult {
  selectedCompany: string;
  setSelectedCompany: Dispatch<SetStateAction<string>>;
  movementType: 'all' | 'ingreso' | 'egreso';
  setMovementType: Dispatch<SetStateAction<'all' | 'ingreso' | 'egreso'>>;
  movementCurrency: 'all' | 'ARS' | 'USD';
  setMovementCurrency: Dispatch<SetStateAction<'all' | 'ARS' | 'USD'>>;
  selectedCategory: string;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
  datePeriod: DatePeriod;
  setDatePeriod: Dispatch<SetStateAction<DatePeriod>>;
  customFrom: string;
  setCustomFrom: Dispatch<SetStateAction<string>>;
  customTo: string;
  setCustomTo: Dispatch<SetStateAction<string>>;
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  selectedSource: SourceFilter;
  setSelectedSource: Dispatch<SetStateAction<SourceFilter>>;
  filteredMovimientos: Movimiento[];
  hasActiveFilters: boolean;
  resetFilters: () => void;
}

export function useMovementsFilter(movimientos: Movimiento[]): MovementsFilterResult {
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [movementType, setMovementType] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [movementCurrency, setMovementCurrency] = useState<'all' | 'ARS' | 'USD'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [datePeriod, setDatePeriod] = useState<DatePeriod>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<SourceFilter>('all');

  const dateRange = useMemo(() => {
    if (datePeriod === 'rango') return { from: customFrom || undefined, to: customTo || undefined };
    return periodToRange(datePeriod, new Date()) ?? { from: undefined, to: undefined };
  }, [datePeriod, customFrom, customTo]);

  const filteredMovimientos = useMemo(() => {
    const base = filterMovements(movimientos, {
      company: selectedCompany,
      tipo: movementType,
      moneda: movementCurrency,
      category: selectedCategory,
      from: dateRange.from,
      to: dateRange.to,
    });
    const bySource = selectedSource === 'all' ? base : base.filter((m) => matchesSource(m.source, selectedSource));
    const q = searchText.trim().toLowerCase();
    if (!q) return bySource;
    return bySource.filter((m) =>
      `${m.descripcion ?? ''} ${m.empresa_nombre ?? ''} ${m.categoria ?? ''}`.toLowerCase().includes(q),
    );
  }, [movimientos, selectedCompany, movementType, movementCurrency, selectedCategory, dateRange, searchText, selectedSource]);

  const hasActiveFilters =
    selectedCompany !== 'all' ||
    movementType !== 'all' ||
    movementCurrency !== 'all' ||
    selectedCategory !== 'all' ||
    datePeriod !== 'all' ||
    selectedSource !== 'all' ||
    searchText.trim() !== '';

  const resetFilters = () => {
    setSelectedCompany('all');
    setMovementType('all');
    setMovementCurrency('all');
    setSelectedCategory('all');
    setDatePeriod('all');
    setCustomFrom('');
    setCustomTo('');
    setSearchText('');
    setSelectedSource('all');
  };

  return {
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
    selectedSource,
    setSelectedSource,
    filteredMovimientos,
    hasActiveFilters,
    resetFilters,
  };
}
