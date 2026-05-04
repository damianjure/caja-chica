import { Moon, Sun } from 'lucide-react';

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
      className={`inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 ${compact ? '' : 'min-w-[132px] justify-center'}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  );
}
