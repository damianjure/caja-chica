import { useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError, type ExtractedItem, type Movimiento, type Empresa, type Categoria } from '../../services/api';
import { getPendingCompanyAssignment } from '../../dashboard/companyAssignment';

export type ComposerCommitEvent =
  | { type: 'GESTIONAR_EMPRESA'; action: string; companyName: string }
  | { type: 'ELIMINAR_MOVIMIENTO'; deletedId?: string }
  | { type: 'REGISTRAR'; saved: Movimiento[] }
  | { type: 'PENDING_COMPANY'; item: ExtractedItem & { originalText: string } };

export interface ComposerOpts {
  categories: Categoria[];
  customCompanies: Empresa[];
  canWriteData: boolean;
  onCommit: (event: ComposerCommitEvent) => void;
  onWarning: (msg: string) => void;
}

export interface ComposerResult {
  inputText: string;
  setInputText: Dispatch<SetStateAction<string>>;
  isProcessing: boolean;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  handleProcess: () => Promise<void>;
}

function normalizeMovement(item: Movimiento): Movimiento {
  return { ...item, conciliado: item.conciliado ?? true };
}

export function useComposer(opts: ComposerOpts): ComposerResult {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    if (!opts.canWriteData) {
      opts.onWarning('Tenés acceso viewer: solo lectura.');
      return;
    }
    if (!inputText.trim() || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const result = await api.extract(inputText, opts.categories);

      if ('error' in result) {
        setError(result.error === 'no_data_found' ? 'No se entendió el comando.' : result.error);
      } else {
        switch (result.intent) {
          case 'GESTIONAR_EMPRESA': {
            const typed = result as { action: string; companyName: string };
            opts.onCommit({ type: 'GESTIONAR_EMPRESA', action: typed.action, companyName: typed.companyName });
            break;
          }
          case 'ELIMINAR_MOVIMIENTO': {
            const typed = result as { target: string };
            if (typed.target === 'last') {
              const response = await api.deleteLastMovimiento();
              opts.onCommit({ type: 'ELIMINAR_MOVIMIENTO', deletedId: response.id });
            }
            break;
          }
          case 'REGISTRAR': {
            const typed = result as { items: ExtractedItem[] };
            const pendingAssignment = getPendingCompanyAssignment(typed.items, inputText);
            if (pendingAssignment) {
              opts.onCommit({ type: 'PENDING_COMPANY', item: pendingAssignment });
              opts.onWarning('Elegí la empresa antes de guardar el movimiento.');
              break;
            }
            const saved = await api.saveMovimientos(typed.items, inputText);
            opts.onCommit({ type: 'REGISTRAR', saved: saved.map(normalizeMovement) });
            break;
          }
          default:
            setError('Intención no soportada todavía.');
        }

        setInputText('');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError('La IA no está disponible ahora mismo. Intentá en unos minutos.');
      } else {
        setError(err instanceof Error ? err.message : 'Error al procesar.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return { inputText, setInputText, isProcessing, error, setError, handleProcess };
}
