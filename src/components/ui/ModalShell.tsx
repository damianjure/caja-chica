import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

interface ModalShellProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  description?: string;
  closeOnBackdrop?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalShellProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

// Focusable selectors for trap.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let modalIdCounter = 0;
const nextId = () => `modal-${++modalIdCounter}`;

export function ModalShell({
  title,
  children,
  onClose,
  size = "lg",
  description,
  closeOnBackdrop = true,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleIdRef = useRef<string>(nextId());
  const descriptionIdRef = useRef<string>(nextId());

  // Esc to close + focus trap + return-focus on unmount.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const node = dialogRef.current;
      if (!node) return;
      const els = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = els[0] ?? node;
      first.focus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const allEls: HTMLElement[] = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      const els = allEls.filter((el: HTMLElement) => !el.hasAttribute("data-skip-focus"));
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
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: "color-mix(in srgb, var(--app-text-1) 42%, transparent)" }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleIdRef.current}
        aria-describedby={description ? descriptionIdRef.current : undefined}
        className={`w-full ${SIZE_CLASSES[size]} max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-neutral-300 overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id={titleIdRef.current} className="text-lg font-bold text-neutral-900 truncate">
              {title}
            </h2>
            {description && (
              <p id={descriptionIdRef.current} className="text-sm text-neutral-600 mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex items-center justify-center h-11 w-11 rounded-xl border border-neutral-300 hover:border-[var(--app-text-2)] active:scale-[0.94] transition-transform text-neutral-700 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}
