import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';

// A label is REQUIRED on every control so a field can never ship without an
// accessible name. Use `hideLabel` to keep a placeholder-only visual (the label
// stays in the accessibility tree as sr-only). Set `hideLabel` off to show it.

const CONTROL =
  'w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 text-[var(--app-text-1)] outline-none transition-colors focus-visible:border-[var(--app-text-2)] focus-visible:ring-2 focus-visible:ring-[var(--app-text-1)] disabled:opacity-50';

const LABEL = 'block text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)] mb-1.5';
const SR_ONLY = 'absolute h-px w-px -m-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]';

function Wrap({ id, label, hideLabel, className, children }: { id: string; label: string; hideLabel?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? SR_ONLY : LABEL}>{label}</label>
      {children}
    </div>
  );
}

type FieldExtras = { label: string; hideLabel?: boolean; wrapClassName?: string };

export function Input({ label, hideLabel, wrapClassName, className = '', id, ...rest }: ComponentPropsWithoutRef<'input'> & FieldExtras) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap id={fieldId} label={label} hideLabel={hideLabel} className={wrapClassName}>
      <input id={fieldId} className={`${CONTROL} ${className}`} {...rest} />
    </Wrap>
  );
}

export function Textarea({ label, hideLabel, wrapClassName, className = '', id, ...rest }: ComponentPropsWithoutRef<'textarea'> & FieldExtras) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap id={fieldId} label={label} hideLabel={hideLabel} className={wrapClassName}>
      <textarea id={fieldId} className={`${CONTROL} ${className}`} {...rest} />
    </Wrap>
  );
}

export function Select({ label, hideLabel, wrapClassName, className = '', id, children, ...rest }: ComponentPropsWithoutRef<'select'> & FieldExtras) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Wrap id={fieldId} label={label} hideLabel={hideLabel} className={wrapClassName}>
      <select id={fieldId} className={`${CONTROL} ${className}`} {...rest}>{children}</select>
    </Wrap>
  );
}
