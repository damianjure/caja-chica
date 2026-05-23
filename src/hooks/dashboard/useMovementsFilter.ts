import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { type Movimiento } from '../../services/api';
import { filterMovements } from '../../dashboard/summary';

export interface MovementsFilterResult {
  selectedCompany: string;
  setSelectedCompany: Dispatch<SetStateAction<string>>;
  movementType: 'all' | 'ingreso' | 'egreso';
  setMovementType: Dispatch<SetStateAction<'all' | 'ingreso' | 'egreso'>>;
  movementCurrency: 'all' | 'ARS' | 'USD';
  setMovementCurrency: Dispatch<SetStateAction<'all' | 'ARS' | 'USD'>>;
  filteredMovimientos: Movimiento[];
  resetFilters: () => void;
}

export function useMovementsFilter(movimientos: Movimiento[]): MovementsFilterResult {
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [movementType, setMovementType] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [movementCurrency, setMovementCurrency] = useState<'all' | 'ARS' | 'USD'>('all');

  const filteredMovimientos = useMemo(
    () => filterMovements(movimientos, { company: selectedCompany, tipo: movementType, moneda: movementCurrency }),
    [movimientos, selectedCompany, movementType, movementCurrency],
  );

  const resetFilters = () => {
    setSelectedCompany('all');
    setMovementType('all');
    setMovementCurrency('all');
  };

  return {
    selectedCompany,
    setSelectedCompany,
    movementType,
    setMovementType,
    movementCurrency,
    setMovementCurrency,
    filteredMovimientos,
    resetFilters,
  };
}
