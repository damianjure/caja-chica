import { useRef } from 'react';
import { Camera, Send, Loader2, AlertCircle } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { Button } from './ui/Button';
import { Textarea } from './ui/Field';

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
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <ModalShell title="Cargar ticket o movimiento" onClose={onClose} size="md">
      <div
        className="space-y-3"
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
            {isExtracting ? 'Leyendo el documento…' : 'Subí un PDF, ticket o resumen de tarjeta'}
          </span>
          <span className="text-xs text-[var(--app-text-3)]">Leo tickets, facturas y resúmenes de tarjeta · detecto cada renglón y elegís cuáles guardar · JPG · PNG · PDF</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="sr-only"
          aria-label="Seleccionar PDF, ticket o resumen de tarjeta"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }}
        />

        <div className="flex items-center gap-3 text-xs text-[var(--app-text-3)]" aria-hidden="true">
          <span className="h-px flex-1 bg-[var(--app-border)]" />o escribilo a mano<span className="h-px flex-1 bg-[var(--app-border)]" />
        </div>

        <Textarea
          label="Movimiento en lenguaje natural"
          hideLabel
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSubmit(); }}
          placeholder="Ej: 'cobré 5 lucas por el laburito del taller'"
          className="min-h-[88px] resize-none text-base"
        />

        {error && <div role="alert" className="flex items-center gap-2 rounded-md border border-[var(--app-red-border)] bg-[var(--app-red-surface)] p-3 text-sm text-[var(--chart-expense)]"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {extractError && <div role="alert" className="flex items-center gap-2 rounded-md border border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] p-3 text-sm text-[var(--app-amber-text)]"><AlertCircle className="h-4 w-4 shrink-0" />{extractError}</div>}
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!inputText.trim() || isProcessing}
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isProcessing ? 'Procesando…' : 'Enviar'}
        </Button>
      </div>
    </ModalShell>
  );
}
