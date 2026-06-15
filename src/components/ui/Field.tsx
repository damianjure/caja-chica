import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';

// A label is REQUIRED on every control so a field can never ship without an
// accessible name. Use `hideLabel` to keep a placeholder-only visual (the label
// stays in the accessibility tree as sr-only). Set `hideLabel` off to show it.
// `error` renders an inline, fix-oriented message and wires aria-invalid; the
// user's input is never cleared. `options` turns a text input into an
// autocomplete (datalist) to cut typing and avoid duplicate/typo'd entries.

const CONTROL =
  'w-full rounded-md border bg-[var(--app-surface-1)] text-[var(--app-text-1)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--app-text-1)] disabled:opacity-50';
const SIZE = {
  sm: 'px-3 py-1.5 text-xs font-medium',
  md: 'px-4 py-3',
} as const;
const BORDER_OK = 'border-[var(--app-border)] focus-visible:border-[var(--app-text-2)]';
const BORDER_ERR = 'border-[var(--app-red-border)] focus-visible:border-[var(--chart-expense)]';

const LABEL = 'flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)] mb-1.5';
const SR_ONLY = 'absolute h-px w-px -m-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]';

type FieldExtras = { label: string; hideLabel?: boolean; wrapClassName?: string; required?: boolean; error?: string; size?: keyof typeof SIZE };

function useField(id: string | undefined, error?: string) {
  const auto = useId();
  const fieldId = id ?? auto;
  const errorId = `${fieldId}-error`;
  return { fieldId, errorId, hasError: Boolean(error) };
}

function Wrap({ id, label, hideLabel, required, error, errorId, className, children }: { id: string; label: string; hideLabel?: boolean; required?: boolean; error?: string; errorId: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? SR_ONLY : LABEL}>
        {label}
        {required && !hideLabel && <span className="text-[var(--chart-expense)]" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && <p id={errorId} className="mt-1.5 text-xs font-medium text-[var(--chart-expense)]">{error}</p>}
    </div>
  );
}

const controlClass = (size: keyof typeof SIZE, className: string, hasError: boolean) => `${CONTROL} ${SIZE[size]} ${hasError ? BORDER_ERR : BORDER_OK} ${className}`;

export function Input({ label, hideLabel, wrapClassName, required, error, options, size = 'md', className = '', id, ...rest }: ComponentPropsWithoutRef<'input'> & FieldExtras & { options?: string[] }) {
  const { fieldId, errorId, hasError } = useField(id, error);
  const listId = `${fieldId}-list`;
  return (
    <Wrap id={fieldId} label={label} hideLabel={hideLabel} required={required} error={error} errorId={errorId} className={wrapClassName}>
      <input
        id={fieldId}
        className={controlClass(size, className, hasError)}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        list={options && options.length ? listId : undefined}
        {...rest}
      />
      {options && options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </Wrap>
  );
}

export function Textarea({ label, hideLabel, wrapClassName, required, error, size = 'md', className = '', id, ...rest }: ComponentPropsWithoutRef<'textarea'> & FieldExtras) {
  const { fieldId, errorId, hasError } = useField(id, error);
  return (
    <Wrap id={fieldId} label={label} hideLabel={hideLabel} required={required} error={error} errorId={errorId} className={wrapClassName}>
      <textarea
        id={fieldId}
        className={controlClass(size, className, hasError)}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        {...rest}
      />
    </Wrap>
  );
}

export function Select({ label, hideLabel, wrapClassName, required, error, size = 'md', className = '', id, children, ...rest }: ComponentPropsWithoutRef<'select'> & FieldExtras) {
  const { fieldId, errorId, hasError } = useField(id, error);
  return (
    <Wrap id={fieldId} label={label} hideLabel={hideLabel} required={required} error={error} errorId={errorId} className={wrapClassName}>
      <select
        id={fieldId}
        className={controlClass(size, className, hasError)}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        {...rest}
      >{children}</select>
    </Wrap>
  );
}
