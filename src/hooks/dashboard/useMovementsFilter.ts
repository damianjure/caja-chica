import { useState, useMemo, useDeferredValue, type Dispatch, type SetStateAction } from 'react';
import { type Movimiento } from '../../services/api';
import { filterMovements, periodToRange, type DatePeriod } from '../../dashboard/summary';

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

  // ⚡ Bolt Performance Optimization:
  // Use useDeferredValue for the search text so that rapid typing doesn't
  // block the main thread by synchronously filtering the large history array.
  // Impact: Keeps the text input responsive even with 10k+ movements.
  const deferredSearchText = useDeferredValue(searchText);

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
    const q = deferredSearchText.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) =>
      `${m.descripcion ?? ''} ${m.empresa_nombre ?? ''} ${m.categoria ?? ''}`.toLowerCase().includes(q),
    );
  }, [movimientos, selectedCompany, movementType, movementCurrency, selectedCategory, dateRange, deferredSearchText]);

  const hasActiveFilters =
    selectedCompany !== 'all' ||
    movementType !== 'all' ||
    movementCurrency !== 'all' ||
    selectedCategory !== 'all' ||
    datePeriod !== 'all' ||
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
    filteredMovimientos,
    hasActiveFilters,
    resetFilters,
  };
}
