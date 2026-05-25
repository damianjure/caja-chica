export interface MovementEditForm {
  tipo: 'ingreso' | 'egreso';
  moneda: 'ARS' | 'USD';
  monto: string;
  categoria: string;
  empresa: string;
  descripcion: string;
}

export interface ConfirmationPreview {
  title: string;
  meta?: string;
  amount?: string;
  arrow?: 'up' | 'down';
}

export interface ConfirmationModalState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'neutral';
  requireText?: string;
  details?: string;
  preview?: ConfirmationPreview;
  onConfirm: () => Promise<void> | void;
}
