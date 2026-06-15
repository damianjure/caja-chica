import type { ComponentPropsWithoutRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: Variant;
  size?: Size;
};

// Variant styles mirror the inline button patterns already used across the app
// (strong-surface = primary, app-border = secondary, red-border = danger), so
// migrating call sites is a visual no-op. Tokens, not hardcoded colors.
const VARIANT: Record<Variant, string> = {
  primary: 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] font-medium hover:opacity-90',
  secondary: 'border border-[var(--app-border)] text-[var(--app-text-2)] hover:border-[var(--app-text-2)]',
  danger: 'border border-[var(--app-red-border)] text-[var(--chart-expense)] hover:border-red-400',
  ghost: 'text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)]',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3',
};

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[opacity,border-color,background-color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text-1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
