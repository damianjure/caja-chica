import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import type { ConfirmationModalState } from '../../types/dashboard';

/**
 * Destructive confirmation dialog.
 * Compact Stripe-style layout: icon+title inline, optional preview strip, dual buttons.
 * Focus trap + Esc-to-cancel + body scroll lock.
 */
interface ConfirmDestructiveProps {
  state: ConfirmationModalState;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  isWorking: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDestructive({
  state,
  inputValue,
  setInputValue,
  isWorking,
  onCancel,
  onConfirm,
}: ConfirmDestructiveProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const isWorkingRef = useRef(isWorking);
  const onCancelRef = useRef(onCancel);
  const isDanger = state.tone !== 'neutral';
  const requireTextOk = state.requireText
    ? inputValue.trim().toUpperCase() === state.requireText.toUpperCase()
    : true;

  // Keep refs synced so the keydown handler (installed once) sees current values.
  useEffect(() => {
    isWorkingRef.current = isWorking;
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const node = dialogRef.current;
      if (!node) return;
      const cancelBtn = node.querySelector<HTMLElement>('[data-cancel-button]');
      cancelBtn?.focus();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!isWorkingRef.current) onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const els: HTMLElement[] = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first: HTMLElement = els[0];
      const last: HTMLElement = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    focusFirst();
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: 'color-mix(in srgb, var(--app-text-1) 42%, transparent)' }}
      onClick={() => { if (!isWorking) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-destructive-title"
        aria-describedby="confirm-destructive-desc"
        className="anim-scale-in w-full max-w-[400px] bg-white border border-[var(--app-border)] rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-3.5">
          <AlertCircle className={`w-[18px] h-[18px] flex-shrink-0 ${isDanger ? 'text-[var(--chart-expense)]' : 'text-[var(--app-text-2)]'}`} />
          <h2 id="confirm-destructive-title" className="text-base font-semibold tracking-tight text-[var(--app-text-1)] m-0">
            {state.title}
          </h2>
        </div>
        <p id="confirm-destructive-desc" className="text-[14.5px] leading-relaxed text-[var(--app-text-2)] mb-3.5">
          {state.description}
        </p>

        {state.preview && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[var(--app-surface-2)] border border-[var(--app-border)] rounded-md mb-4 tabular-nums">
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-[var(--app-text-1)] truncate">{state.preview.title}</span>
              {state.preview.meta && (
                <span className="text-[11.5px] text-[var(--app-text-3)] truncate">{state.preview.meta}</span>
              )}
            </div>
            {state.preview.amount && (
              <span className="text-sm font-semibold text-[var(--app-text-1)] flex items-baseline gap-1 flex-shrink-0">
                {state.preview.arrow && (
                  <span aria-hidden="true" className={`text-xs ${state.preview.arrow === 'up' ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
                    {state.preview.arrow === 'up' ? '↑' : '↓'}
                  </span>
                )}
                {state.preview.amount}
              </span>
            )}
          </div>
        )}

        {state.details && !state.requireText && (
          <p className="text-[12px] text-[var(--app-text-3)] leading-relaxed mb-4">{state.details}</p>
        )}

        {state.requireText && (
          <div className="mb-4">
            <label htmlFor="confirm-require-input" className="block text-[12px] text-[var(--app-text-3)] leading-relaxed mb-2">
              {state.details ?? `Escribí ${state.requireText} para confirmar.`}
            </label>
            <input
              id="confirm-require-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={state.requireText}
              autoComplete="off"
              className="w-full rounded-md border border-[var(--app-border-strong)] px-3.5 py-2.5 text-sm text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-[var(--app-text-1)] focus:border-transparent"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            data-cancel-button
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            className="flex-1 h-[38px] px-3.5 rounded-md text-[13.5px] font-medium text-[var(--app-text-2)] bg-transparent border border-[var(--app-border-strong)] hover:bg-[var(--app-surface-2)] hover:text-[var(--app-text-1)] active:scale-[0.97] transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isWorking || !requireTextOk}
            className={`flex-1 h-[38px] px-3.5 rounded-md text-[13.5px] font-medium text-white border active:scale-[0.97] transition disabled:opacity-50 ${
              isDanger
                ? 'bg-red-600 border-red-600 hover:bg-red-700 hover:border-red-700'
                : 'bg-[var(--app-strong-surface)] border-[var(--app-strong-surface)] hover:bg-[var(--app-strong-surface)]'
            }`}
          >
            {isWorking ? 'Confirmando…' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
