import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function MetricCard({ label, value, tone = 'neutral', icon: Icon, sub, critical }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' | 'warning'; icon?: LucideIcon; sub?: string; critical?: boolean }) {
  const toneClass = {
    neutral: 'text-[var(--app-text-1)]',
    success: 'text-[var(--chart-income)]',
    danger: 'text-[var(--chart-expense)]',
    warning: 'text-[var(--app-amber-text)]',
  }[tone];

  const cardClass = critical
    ? 'border-[color-mix(in_srgb,var(--chart-expense)_50%,var(--app-border))] bg-[color-mix(in_srgb,var(--chart-expense)_10%,var(--app-surface-1))]'
    : 'border-[var(--app-border)] bg-[var(--app-surface-1)]';

  return (
    <div className={`px-5 py-4 rounded-xl border shadow-[var(--app-shadow-sm)] ${cardClass}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--app-text-3)] shrink-0" aria-hidden="true" />}
        <span className="text-xs font-bold text-[var(--app-text-3)] uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--app-text-3)]">{sub}</div>}
    </div>
  );
}

export function SectionCard({ title, description, children, icon: Icon }: { title: string; description?: string; children: ReactNode; icon?: LucideIcon }) {
  return (
    <section className="bg-white border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[var(--app-text-3)] shrink-0" aria-hidden="true" />}
          <h2 className="text-xl font-bold text-[var(--app-text-1)] tracking-tight">{title}</h2>
        </div>
        {description && (
          <p className="text-sm text-[var(--app-text-3)] mt-1.5 leading-relaxed max-w-prose">{description}</p>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-surface-2)] px-5 py-4 text-sm text-[var(--app-text-2)]">
      <div className="font-semibold text-[var(--app-text-1)] mb-1">{title}</div>
      <p className="leading-relaxed">{body}</p>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  canWrite = true,
  cta,
  icon,
}: {
  title: string;
  hint?: string;
  canWrite?: boolean;
  cta?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-surface-2)] px-6 py-8 text-center">
      {icon && <div className="flex justify-center mb-3 text-[var(--app-text-3)]">{icon}</div>}
      <p className="text-sm font-medium text-[var(--app-text-2)]">{title}</p>
      {hint && <p className="mt-2 text-xs text-[var(--app-text-3)] max-w-sm mx-auto leading-relaxed">{hint}</p>}
      {canWrite && cta && (
        <p className="mt-3 text-xs font-medium text-[var(--app-text-1)] inline-flex items-center gap-1">
          <span aria-hidden="true">↑</span> {cta}
        </p>
      )}
    </div>
  );
}
