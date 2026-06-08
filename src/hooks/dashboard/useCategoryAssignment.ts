import { useState, type Dispatch, type SetStateAction } from 'react';
import { api, type Movimiento } from '../../services/api';
import type { PendingCategoryAssignment } from '../../dashboard/categoryAssignment';

export interface CategoryAssignmentResult {
  pendingCategory: PendingCategoryAssignment | null;
  setPendingCategory: Dispatch<SetStateAction<PendingCategoryAssignment | null>>;
  isAssigningCategory: boolean;
  assignPendingCategory: (
    categoria: string,
    opts: { create: boolean },
    onSaved: (saved: Movimiento[]) => void,
    onError: () => void,
  ) => Promise<void>;
}

function normalizeMovement(item: Movimiento): Movimiento {
  return { ...item, conciliado: item.conciliado ?? true };
}

export function useCategoryAssignment(): CategoryAssignmentResult {
  const [pendingCategory, setPendingCategory] = useState<PendingCategoryAssignment | null>(null);
  const [isAssigningCategory, setIsAssigningCategory] = useState(false);

  const assignPendingCategory = async (
    categoria: string,
    opts: { create: boolean },
    onSaved: (saved: Movimiento[]) => void,
    onError: () => void,
  ) => {
    if (!pendingCategory) return;
    setIsAssigningCategory(true);
    try {
      if (opts.create) {
        // Best-effort: if it already exists the backend rejects it — ignore and
        // still save the movement with the chosen category label.
        try { await api.createCategoria(categoria); } catch { /* non-fatal */ }
      }
      const { suggested: _suggested, originalText, ...item } = pendingCategory;
      const saved = await api.saveMovimientos([{ ...item, categoria }], originalText);
      onSaved(saved.map(normalizeMovement));
      setPendingCategory(null);
    } catch {
      onError();
    } finally {
      setIsAssigningCategory(false);
    }
  };

  return { pendingCategory, setPendingCategory, isAssigningCategory, assignPendingCategory };
}
