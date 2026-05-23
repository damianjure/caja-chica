import { useState, type Dispatch, type SetStateAction } from 'react';
import { api, type ExtractedItem, type Movimiento } from '../../services/api';

export type PendingCompanyItem = ExtractedItem & { originalText: string };

export interface CompanyAssignmentResult {
  pendingItem: PendingCompanyItem | null;
  setPendingItem: Dispatch<SetStateAction<PendingCompanyItem | null>>;
  isAssigning: boolean;
  assignPendingMovement: (
    empresa: string,
    onSaved: (saved: Movimiento[]) => void,
    onError: () => void,
  ) => Promise<void>;
}

function normalizeMovement(item: Movimiento): Movimiento {
  return { ...item, conciliado: item.conciliado ?? true };
}

export function useCompanyAssignment(): CompanyAssignmentResult {
  const [pendingItem, setPendingItem] = useState<PendingCompanyItem | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const assignPendingMovement = async (
    empresa: string,
    onSaved: (saved: Movimiento[]) => void,
    onError: () => void,
  ) => {
    if (!pendingItem) return;
    setIsAssigning(true);
    try {
      const saved = await api.saveMovimientos([{ ...pendingItem, empresa }], pendingItem.originalText);
      onSaved(saved.map(normalizeMovement));
      setPendingItem(null);
    } catch {
      onError();
    } finally {
      setIsAssigning(false);
    }
  };

  return {
    pendingItem,
    setPendingItem,
    isAssigning,
    assignPendingMovement,
  };
}
