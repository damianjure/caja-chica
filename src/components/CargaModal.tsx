import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, Send, Loader2, AlertCircle } from 'lucide-react';

interface CargaModalProps {
  open: boolean;
  onClose: () => void;
  inputText: string;
  setInputText: (v: string) => void;
  isProcessing: boolean;
  isExtracting: boolean;
  error: string | null;
  extractError: string | null;
  onSubmit: () => void;
  onImageFile: (file: File) => void;
}

export function CargaModal({
  open, onClose, inputText, setInputText, isProcessing, isExtracting, error, extractError, onSubmit, onImageFile,
}: CargaModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => textareaRef.current?.focus(), 40);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center bg-[color-mix(in_srgb,var(--app-text-1)_42%,transparent)] backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carga-modal-title"
        className="anim-scale-in flex w-full max-w-lg flex-col rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] shadow-[var(--app-shadow-md)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-5 py-4">
          <h2 id="carga-modal-title" className="text-base font-bold text-[var(--app-text-1)]">Cargar ticket o movimiento</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="space-y-3 px-5 py-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onImageFile(f); }}
        >
          {/* Primary action: snap/upload a ticket. Leads the hierarchy because
              it's the differentiating feature; typing it out is the fallback. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isExtracting}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--app-strong-surface)] bg-[var(--app-surface-2)] px-4 py-6 text-center hover:bg-[var(--app-surface-3)] disabled:opacity-60 transition-colors"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
              {isExtracting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </span>
            <span className="text-sm font-bold text-[var(--app-text-1)]">
              {isExtracting ? 'Leyendo el ticket…' : 'Subí una foto o PDF del ticket'}
            </span>
            <span className="text-xs text-[var(--app-text-3)]">Detecto cada renglón y elegís cuáles guardar · JPG · PNG · PDF</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="sr-only"
            aria-label="Seleccionar foto o PDF del ticket"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }}
          />

          <div className="flex items-center gap-3 text-xs text-[var(--app-text-3)]" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--app-border)]" />o escribilo a mano<span className="h-px flex-1 bg-[var(--app-border)]" />
          </div>

          <label htmlFor="carga-input" className="sr-only">Movimiento en lenguaje natural</label>
          <textarea
            id="carga-input"
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSubmit(); }}
            placeholder="Ej: 'cobré 5 lucas por el laburito del taller'"
            className="min-h-[88px] w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4 text-base text-[var(--app-text-1)] outline-none transition-[border-color,box-shadow] duration-150 focus:ring-2 focus:ring-[var(--app-text-1)]"
          />

          {error && <div role="alert" className="flex items-center gap-2 rounded-md border border-[var(--app-red-border)] bg-[var(--app-red-surface)] p-3 text-sm text-[var(--chart-expense)]"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          {extractError && <div role="alert" className="flex items-center gap-2 rounded-md border border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] p-3 text-sm text-[var(--app-amber-text)]"><AlertCircle className="h-4 w-4 shrink-0" />{extractError}</div>}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface-1)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--app-border)] px-4 py-2.5 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!inputText.trim() || isProcessing}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-5 py-2.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isProcessing ? 'Procesando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
