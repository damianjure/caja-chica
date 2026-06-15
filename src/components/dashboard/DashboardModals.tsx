import { type Dispatch, type SetStateAction } from 'react';
import { type Movimiento, type Empresa } from '../../services/api';
import { ModalShell } from '../ui/ModalShell';
import { ConfirmDestructive } from '../ui/ConfirmDestructive';
import { type MovementEditForm, type ConfirmationModalState } from '../../types/dashboard';
import { type PendingCompanyItem } from '../../hooks/dashboard/useCompanyAssignment';
import { type PendingCategoryAssignment } from '../../dashboard/categoryAssignment';

interface DashboardModalsProps {
  editingMovement: Movimiento | null;
  movementEditForm: MovementEditForm | null;
  setMovementEditForm: Dispatch<SetStateAction<MovementEditForm | null>>;
  onCloseMovementEdit: () => void;
  onSaveMovementEdit: () => void;
  onDeleteMovement: (id: string) => void;

  editingCompany: Empresa | null;
  companyEditName: string;
  setCompanyEditName: Dispatch<SetStateAction<string>>;
  onCloseCompanyEdit: () => void;
  onSaveCompanyEdit: () => void;

  pendingItem: PendingCompanyItem | null;
  isAssigning: boolean;
  companiesList: string[];
  readDefaultEmpresa: () => string;
  onAssignCompany: (empresa: string) => void;
  onCancelPending: () => void;

  pendingCategory: PendingCategoryAssignment | null;
  isAssigningCategory: boolean;
  categoriesList: string[];
  onAssignCategory: (categoria: string, create: boolean) => void;
  onCancelPendingCategory: () => void;

  confirmationModal: ConfirmationModalState | null;
  confirmationInput: string;
  setConfirmationInput: Dispatch<SetStateAction<string>>;
  isConfirmingAction: boolean;
  onCloseConfirmation: () => void;
  onRunConfirmation: () => void;
}

export function DashboardModals({
  editingMovement, movementEditForm, setMovementEditForm, onCloseMovementEdit, onSaveMovementEdit, onDeleteMovement,
  editingCompany, companyEditName, setCompanyEditName, onCloseCompanyEdit, onSaveCompanyEdit,
  pendingItem, isAssigning, companiesList, readDefaultEmpresa, onAssignCompany, onCancelPending,
  pendingCategory, isAssigningCategory, categoriesList, onAssignCategory, onCancelPendingCategory,
  confirmationModal, confirmationInput, setConfirmationInput, isConfirmingAction, onCloseConfirmation, onRunConfirmation,
}: DashboardModalsProps) {
  return (
    <>
      {editingMovement && movementEditForm && (
        <ModalShell title="Editar movimiento" onClose={onCloseMovementEdit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select aria-label="Tipo de movimiento" value={movementEditForm.tipo} onChange={(e) => setMovementEditForm((p) => p ? { ...p, tipo: e.target.value as 'ingreso' | 'egreso' } : p)} className="rounded-md border border-[var(--app-border)] px-4 py-3">
              <option value="ingreso">Ingreso</option><option value="egreso">Gasto</option>
            </select>
            <select aria-label="Moneda" value={movementEditForm.moneda} onChange={(e) => setMovementEditForm((p) => p ? { ...p, moneda: e.target.value as 'ARS' | 'USD' } : p)} className="rounded-md border border-[var(--app-border)] px-4 py-3">
              <option value="ARS">ARS</option><option value="USD">USD</option>
            </select>
            <input aria-label="Monto" value={movementEditForm.monto} onChange={(e) => setMovementEditForm((p) => p ? { ...p, monto: e.target.value } : p)} type="number" className="rounded-md border border-[var(--app-border)] px-4 py-3" placeholder="Monto" />
            <input aria-label="Categoría" value={movementEditForm.categoria} onChange={(e) => setMovementEditForm((p) => p ? { ...p, categoria: e.target.value } : p)} className="rounded-md border border-[var(--app-border)] px-4 py-3" placeholder="Categoría" />
            <input aria-label="Empresa" value={movementEditForm.empresa} onChange={(e) => setMovementEditForm((p) => p ? { ...p, empresa: e.target.value } : p)} className="rounded-md border border-[var(--app-border)] px-4 py-3 md:col-span-2" placeholder="Empresa" />
            <textarea aria-label="Descripción" value={movementEditForm.descripcion} onChange={(e) => setMovementEditForm((p) => p ? { ...p, descripcion: e.target.value } : p)} className="rounded-md border border-[var(--app-border)] px-4 py-3 md:col-span-2 min-h-[120px]" placeholder="Descripción" />
          </div>
          <div className="flex items-center justify-between gap-3 mt-4">
            <button onClick={() => onDeleteMovement(editingMovement.id)} className="rounded-md border border-[var(--app-red-border)] px-4 py-3 text-[var(--chart-expense)] hover:border-red-400">Borrar</button>
            <div className="flex gap-3">
              <button onClick={onCloseMovementEdit} className="rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)]">Cancelar</button>
              <button onClick={onSaveMovementEdit} className="rounded-md bg-[var(--app-strong-surface)] px-5 py-3 text-[var(--app-strong-text)] font-medium">Guardar</button>
            </div>
          </div>
        </ModalShell>
      )}

      {editingCompany && (
        <ModalShell title="Editar empresa" onClose={onCloseCompanyEdit}>
          <div className="space-y-4">
            <input aria-label="Nombre de empresa" value={companyEditName} onChange={(e) => setCompanyEditName(e.target.value)} className="w-full rounded-md border border-[var(--app-border)] px-4 py-3" placeholder="Nombre de empresa" />
            <p className="text-sm text-[var(--app-text-3)]">Esto renombra la empresa para el dashboard. Los movimientos visibles también se actualizan en la UI.</p>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={onCloseCompanyEdit} className="rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)]">Cancelar</button>
            <button onClick={onSaveCompanyEdit} className="rounded-md bg-[var(--app-strong-surface)] px-5 py-3 text-[var(--app-strong-text)] font-medium">Guardar</button>
          </div>
        </ModalShell>
      )}

      {pendingItem && (
        <ModalShell title="Asignar empresa" onClose={() => { if (!isAssigning) onCancelPending(); }}>
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Movimiento pendiente de empresa</div>
              <p className="mt-2 text-lg font-semibold text-[var(--app-text-1)]">¿A qué empresa cargamos esto?</p>
              <p className="mt-2 text-sm italic text-[var(--app-text-3)]">"{pendingItem.originalText}"</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {companiesList.filter((c) => c !== 'all').map((company) => {
                const isDefault = company === readDefaultEmpresa();
                return (
                  <button key={company} onClick={() => onAssignCompany(company)} disabled={isAssigning}
                    className={`rounded-xl border px-4 py-4 text-left font-medium transition-colors disabled:opacity-50 ${isDefault ? 'border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] hover:border-[var(--app-text-2)]' : 'border-[var(--app-border)] bg-white text-[var(--app-text-1)] hover:border-[var(--app-text-2)]'}`}
                  >
                    {company}{isDefault && <span className="ml-2 text-xs uppercase tracking-widest opacity-70">default</span>}
                  </button>
                );
              })}
              <button onClick={() => onAssignCompany('Personal')} disabled={isAssigning}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-4 py-4 text-left font-medium text-[var(--app-text-2)] transition-colors hover:border-[var(--app-text-2)] disabled:opacity-50"
              >
                Sin empresa (Personal)
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={onCancelPending} disabled={isAssigning} className="rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)]">Cancelar registro</button>
          </div>
        </ModalShell>
      )}

      {pendingCategory && (
        <ModalShell title="Categoría" onClose={() => { if (!isAssigningCategory) onCancelPendingCategory(); }}>
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Categoría nueva sugerida</div>
              <p className="mt-2 text-lg font-semibold text-[var(--app-text-1)]">¿Creamos la categoría «{pendingCategory.suggested}»?</p>
              <p className="mt-2 text-sm italic text-[var(--app-text-3)]">"{pendingCategory.originalText}"</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button onClick={() => onAssignCategory(pendingCategory.suggested, true)} disabled={isAssigningCategory}
                className="rounded-xl border border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] px-4 py-4 text-left font-semibold text-[var(--app-strong-text)] transition-colors hover:border-[var(--app-text-2)] disabled:opacity-50"
              >
                Crear «{pendingCategory.suggested}»
              </button>
              <button onClick={() => onAssignCategory('Otros', false)} disabled={isAssigningCategory}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-4 py-4 text-left font-medium text-[var(--app-text-2)] transition-colors hover:border-[var(--app-text-2)] disabled:opacity-50"
              >
                Usar "Otros"
              </button>
            </div>
            {categoriesList.filter((c) => c !== 'all').length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)] mb-2">O usá una existente</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {categoriesList.filter((c) => c !== 'all').map((cat) => (
                    <button key={cat} onClick={() => onAssignCategory(cat, false)} disabled={isAssigningCategory}
                      className="rounded-lg border border-[var(--app-border)] bg-white px-3 py-2 text-left text-sm font-medium text-[var(--app-text-1)] transition-colors hover:border-[var(--app-text-2)] disabled:opacity-50"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={onCancelPendingCategory} disabled={isAssigningCategory} className="rounded-md border border-[var(--app-border)] px-4 py-3 text-[var(--app-text-2)]">Cancelar registro</button>
          </div>
        </ModalShell>
      )}

      {confirmationModal && (
        <ConfirmDestructive
          state={confirmationModal}
          inputValue={confirmationInput}
          setInputValue={setConfirmationInput}
          isWorking={isConfirmingAction}
          onCancel={onCloseConfirmation}
          onConfirm={onRunConfirmation}
        />
      )}
    </>
  );
}
