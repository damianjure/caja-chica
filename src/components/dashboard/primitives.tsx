import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function MetricCard({ label, value, tone = 'neutral', icon: Icon }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' | 'warning'; icon?: LucideIcon }) {
  const toneClass = {
    neutral: 'text-neutral-900',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-amber-600',
  }[tone];

  return (
    <div className="bg-white px-5 py-4 rounded-xl border border-neutral-200 shadow-[var(--app-shadow-sm)]">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-neutral-500 shrink-0" aria-hidden="true" />}
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export function SectionCard({ title, description, children, icon: Icon }: { title: string; description?: string; children: ReactNode; icon?: LucideIcon }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-neutral-500 shrink-0" aria-hidden="true" />}
          <h2 className="text-xl font-bold text-neutral-900 tracking-tight">{title}</h2>
        </div>
        {description && (
          <p className="text-sm text-neutral-500 mt-1.5 leading-relaxed max-w-prose">{description}</p>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-neutral-600">
      <div className="font-semibold text-neutral-900 mb-1">{title}</div>
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
    <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-8 text-center">
      {icon && <div className="flex justify-center mb-3 text-neutral-400">{icon}</div>}
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {hint && <p className="mt-2 text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed">{hint}</p>}
      {canWrite && cta && (
        <p className="mt-3 text-xs font-medium text-neutral-900 inline-flex items-center gap-1">
          <span aria-hidden="true">↑</span> {cta}
        </p>
      )}
    </div>
  );
}
