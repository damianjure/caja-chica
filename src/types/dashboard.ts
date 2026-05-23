export interface MovementEditForm {
  tipo: 'ingreso' | 'egreso';
  moneda: 'ARS' | 'USD';
  monto: string;
  categoria: string;
  empresa: string;
  descripcion: string;
}

export interface ConfirmationModalState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'neutral';
  requireText?: string;
  details?: string;
  onConfirm: () => Promise<void> | void;
}
