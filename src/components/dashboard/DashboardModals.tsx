import { type Dispatch, type SetStateAction } from 'react';
import { type Movimiento, type Empresa } from '../../services/api';
import { ModalShell } from '../ui/ModalShell';
import { ConfirmDestructive } from '../ui/ConfirmDestructive';
import { type MovementEditForm, type ConfirmationModalState } from '../../types/dashboard';
import { type PendingCompanyItem } from '../../hooks/dashboard/useCompanyAssignment';

interface DashboardModalsProps {
  editingMovement: Movimiento | null;
  movementEditForm: MovementEditForm | null;
  setMovementEditForm: Dispatch<SetStateAction<MovementEditForm | null>>;
  onCloseMovementEdit: () => void;
  onSaveMovementEdit: () => void;

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

  confirmationModal: ConfirmationModalState | null;
  confirmationInput: string;
  setConfirmationInput: Dispatch<SetStateAction<string>>;
  isConfirmingAction: boolean;
  onCloseConfirmation: () => void;
  onRunConfirmation: () => void;
}

export function DashboardModals({
  editingMovement, movementEditForm, setMovementEditForm, onCloseMovementEdit, onSaveMovementEdit,
  editingCompany, companyEditName, setCompanyEditName, onCloseCompanyEdit, onSaveCompanyEdit,
  pendingItem, isAssigning, companiesList, readDefaultEmpresa, onAssignCompany, onCancelPending,
  confirmationModal, confirmationInput, setConfirmationInput, isConfirmingAction, onCloseConfirmation, onRunConfirmation,
}: DashboardModalsProps) {
  return (
    <>
      {editingMovement && movementEditForm && (
        <ModalShell title="Editar movimiento" onClose={onCloseMovementEdit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={movementEditForm.tipo} onChange={(e) => setMovementEditForm((p) => p ? { ...p, tipo: e.target.value as 'ingreso' | 'egreso' } : p)} className="rounded-md border border-neutral-200 px-4 py-3">
              <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option>
            </select>
            <select value={movementEditForm.moneda} onChange={(e) => setMovementEditForm((p) => p ? { ...p, moneda: e.target.value as 'ARS' | 'USD' } : p)} className="rounded-md border border-neutral-200 px-4 py-3">
              <option value="ARS">ARS</option><option value="USD">USD</option>
            </select>
            <input value={movementEditForm.monto} onChange={(e) => setMovementEditForm((p) => p ? { ...p, monto: e.target.value } : p)} type="number" className="rounded-md border border-neutral-200 px-4 py-3" placeholder="Monto" />
            <input value={movementEditForm.categoria} onChange={(e) => setMovementEditForm((p) => p ? { ...p, categoria: e.target.value } : p)} className="rounded-md border border-neutral-200 px-4 py-3" placeholder="Categoría" />
            <input value={movementEditForm.empresa} onChange={(e) => setMovementEditForm((p) => p ? { ...p, empresa: e.target.value } : p)} className="rounded-md border border-neutral-200 px-4 py-3 md:col-span-2" placeholder="Empresa" />
            <textarea value={movementEditForm.descripcion} onChange={(e) => setMovementEditForm((p) => p ? { ...p, descripcion: e.target.value } : p)} className="rounded-md border border-neutral-200 px-4 py-3 md:col-span-2 min-h-[120px]" placeholder="Descripción" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onCloseMovementEdit} className="rounded-md border border-neutral-200 px-4 py-3 text-neutral-700">Cancelar</button>
            <button onClick={onSaveMovementEdit} className="rounded-md bg-neutral-900 px-5 py-3 text-white font-medium">Guardar cambios</button>
          </div>
        </ModalShell>
      )}

      {editingCompany && (
        <ModalShell title="Editar empresa" onClose={onCloseCompanyEdit}>
          <div className="space-y-4">
            <input value={companyEditName} onChange={(e) => setCompanyEditName(e.target.value)} className="w-full rounded-md border border-neutral-200 px-4 py-3" placeholder="Nombre de empresa" />
            <p className="text-sm text-neutral-500">Esto renombra la empresa para el dashboard. Los movimientos visibles también se actualizan en la UI.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onCloseCompanyEdit} className="rounded-md border border-neutral-200 px-4 py-3 text-neutral-700">Cancelar</button>
            <button onClick={onSaveCompanyEdit} className="rounded-md bg-neutral-900 px-5 py-3 text-white font-medium">Guardar cambios</button>
          </div>
        </ModalShell>
      )}

      {pendingItem && (
        <ModalShell title="Asignar empresa" onClose={() => { if (!isAssigning) onCancelPending(); }}>
          <div className="space-y-5">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Movimiento pendiente de empresa</div>
              <p className="mt-2 text-lg font-semibold text-neutral-900">¿A qué empresa cargamos esto?</p>
              <p className="mt-2 text-sm italic text-neutral-500">"{pendingItem.originalText}"</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {companiesList.filter((c) => c !== 'all').map((company) => {
                const isDefault = company === readDefaultEmpresa();
                return (
                  <button key={company} onClick={() => onAssignCompany(company)} disabled={isAssigning}
                    className={`rounded-xl border px-4 py-4 text-left font-medium transition-colors disabled:opacity-50 ${isDefault ? 'border-neutral-800 bg-neutral-900 text-white hover:border-[var(--app-text-2)]' : 'border-neutral-200 bg-white text-neutral-900 hover:border-[var(--app-text-2)]'}`}
                  >
                    {company}{isDefault && <span className="ml-2 text-xs uppercase tracking-widest opacity-70">default</span>}
                  </button>
                );
              })}
              <button onClick={() => onAssignCompany('Personal')} disabled={isAssigning}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-left font-medium text-neutral-600 transition-colors hover:border-[var(--app-text-2)] disabled:opacity-50"
              >
                Sin empresa (Personal)
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onCancelPending} disabled={isAssigning} className="rounded-md border border-neutral-200 px-4 py-3 text-neutral-700">Cancelar registro</button>
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
