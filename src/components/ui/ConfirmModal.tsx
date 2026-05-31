import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";

export interface ConfirmModalPreview {
  title: string;
  meta?: string;
  amount?: string;
  arrow?: "up" | "down";
}

export interface ConfirmModalProps {
  title: string;
  description: string;
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
  preview?: ConfirmModalPreview;
  /** When provided, user must type this exact string to enable confirm. */
  requireText?: string;
  /** Optional free-form reason input (string). */
  askReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => Promise<void> | void;
  onCancel: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmModal({
  title,
  description,
  details,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "neutral",
  preview,
  requireText,
  askReason = false,
  reasonLabel = "Motivo (opcional)",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [confirmInput, setConfirmInput] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const submittingRef = useRef(submitting);

  useEffect(() => { onCancelRef.current = onCancel; });
  useEffect(() => { submittingRef.current = submitting; });

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const node = dialogRef.current;
      if (!node) return;
      const cancelBtn = node.querySelector<HTMLElement>("[data-cancel-button]");
      (cancelBtn ?? node.querySelectorAll<HTMLElement>(FOCUSABLE)[0])?.focus();
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!submittingRef.current) onCancelRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const els: HTMLElement[] = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (els.length === 0) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    focusFirst();
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDanger = tone === "danger";
  const requireTextOk = !requireText || confirmInput.trim().toUpperCase() === requireText.toUpperCase();
  const canConfirm = requireTextOk && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm(askReason ? reason.trim() || undefined : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="anim-backdrop-in fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: "color-mix(in srgb, var(--app-text-1) 42%, transparent)" }}
      onClick={() => { if (!submitting) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="anim-scale-in w-full max-w-[400px] bg-white border border-[var(--app-border)] rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon + title inline */}
        <div className="flex items-center gap-2.5 mb-3.5">
          <AlertCircle
            className={`w-[18px] h-[18px] shrink-0 ${isDanger ? "text-red-600" : "text-[var(--app-text-2)]"}`}
          />
          <h2
            id="confirm-modal-title"
            className="text-base font-semibold tracking-tight text-[var(--app-text-1)] m-0"
          >
            {title}
          </h2>
        </div>

        {/* Description */}
        <p id="confirm-modal-desc" className="text-[14.5px] leading-relaxed text-[var(--app-text-2)] mb-3.5">
          {description}
        </p>

        {/* Optional preview card */}
        {preview && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[var(--app-surface-2)] border border-[var(--app-border)] rounded-md mb-4 tabular-nums">
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-[var(--app-text-1)] truncate">{preview.title}</span>
              {preview.meta && (
                <span className="text-[11.5px] text-[var(--app-text-3)] truncate">{preview.meta}</span>
              )}
            </div>
            {preview.amount && (
              <span className="text-sm font-semibold text-[var(--app-text-1)] flex items-baseline gap-1 shrink-0">
                {preview.arrow && (
                  <span
                    aria-hidden="true"
                    className={`text-xs ${preview.arrow === "up" ? "text-green-600" : "text-red-600"}`}
                  >
                    {preview.arrow === "up" ? "↑" : "↓"}
                  </span>
                )}
                {preview.amount}
              </span>
            )}
          </div>
        )}

        {/* Details (text or node) */}
        {details && !requireText && (
          <div className="text-[12px] text-[var(--app-text-3)] leading-relaxed mb-4">{details}</div>
        )}

        {/* Reason textarea */}
        {askReason && (
          <label className="block mb-4 space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--app-text-3)]">
              {reasonLabel}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--app-border-strong)] px-3 py-2 text-sm text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
            />
          </label>
        )}

        {/* Require-text input */}
        {requireText && (
          <div className="mb-4">
            <label htmlFor="confirm-modal-require-input" className="block text-[12px] text-[var(--app-text-3)] leading-relaxed mb-2">
              {details ?? (
                <>Escribí <code className="font-mono">{requireText}</code> para confirmar.</>
              )}
            </label>
            <input
              id="confirm-modal-require-input"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-[var(--app-border-strong)] px-3.5 py-2.5 text-sm text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            data-cancel-button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 h-[38px] px-3.5 rounded-md text-[13.5px] font-medium text-[var(--app-text-2)] bg-transparent border border-[var(--app-border-strong)] hover:bg-[var(--app-surface-2)] hover:text-[var(--app-text-1)] active:scale-[0.97] transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className={`flex-1 h-[38px] px-3.5 rounded-md text-[13.5px] font-medium text-white border active:scale-[0.97] transition disabled:opacity-50 inline-flex items-center justify-center gap-2 ${
              isDanger
                ? "bg-red-600 border-red-600 hover:bg-red-700 hover:border-red-700"
                : "bg-neutral-900 border-neutral-900 hover:bg-neutral-800"
            }`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Confirmando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
