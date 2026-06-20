import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeMode = 'light' | 'dark';

export function ThemeToggle({
  theme,
  onToggle,
  compact = false,
}: {
  theme: ThemeMode;
  onToggle: () => void;
  compact?: boolean;
}) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`inline-flex items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2 text-sm font-medium text-[var(--app-text-2)] hover:border-[var(--app-text-2)] ${compact ? '' : 'min-w-[132px] justify-center'}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  );
}

export function ThemeSelector({
  preference,
  onChange,
}: {
  preference: ThemePreference;
  onChange: (p: ThemePreference) => void;
}) {
  const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ];

  return (
    <div className="flex gap-2" role="group" aria-label="Tema de la interfaz">
      {options.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-[var(--app-strong-surface)] border-[var(--app-strong-surface)] text-[var(--app-strong-text)]'
                : 'bg-[var(--app-surface-1)] border-[var(--app-border-strong)] text-[var(--app-text-2)] hover:border-[var(--app-text-2)]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
