// Compact segmented control for mutually-exclusive filters (tipo, período…).
// `tones` paints the active segment green/red for income/expense semantics.
export function Segmented<T extends string>({
  value, options, onChange, ariaLabel, tones,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  tones?: Partial<Record<T, 'income' | 'expense'>>;
}) {
  const activeClass = (id: T) => {
    const tone = tones?.[id];
    if (tone === 'income') return 'bg-[var(--app-green-surface)] text-[var(--chart-income)]';
    if (tone === 'expense') return 'bg-[var(--app-red-surface)] text-[var(--chart-expense)]';
    return 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]';
  };
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex gap-0.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-2)] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition duration-150 ${
            value === o.id
              ? activeClass(o.id)
              : 'text-[var(--app-text-2)] hover:text-[var(--app-text-1)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
