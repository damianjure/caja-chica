import { useState, useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";

export interface ConfirmModalProps {
  title: string;
  description: string;
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
  /** When provided, user must type this exact string to enable confirm. */
  requireText?: string;
  /** Optional free-form reason input (string). */
  askReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  details,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "neutral",
  requireText,
  askReason = false,
  reasonLabel = "Motivo (opcional)",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [confirmInput, setConfirmInput] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setConfirmInput("");
    setReason("");
  }, []);

  const requireTextOk = !requireText || confirmInput.trim() === requireText;
  const canConfirm = requireTextOk && !submitting;

  const confirmClasses =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-neutral-900 hover:bg-neutral-800 text-white";

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm(askReason ? reason.trim() || undefined : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={title} onClose={onCancel} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-700">{description}</p>
        {details && <div className="text-sm text-neutral-600">{details}</div>}

        {askReason && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
              {reasonLabel}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </label>
        )}

        {requireText && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
              Escribí <code className="font-mono">{requireText}</code> para confirmar
            </span>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-600"
            />
          </label>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-2xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className={`flex-1 rounded-2xl px-4 py-3 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
