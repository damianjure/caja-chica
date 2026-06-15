import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { useFitText } from '../../hooks/useFitText';

const TONE_CLASS = {
  neutral: 'text-[var(--app-text-1)]',
  success: 'text-[var(--chart-income)]',
  danger: 'text-[var(--chart-expense)]',
  warning: 'text-[var(--app-amber-text)]',
} as const;

type MetricTone = keyof typeof TONE_CLASS;

export function MetricCard({ label, value, tone = 'neutral', icon: Icon, sub, critical, onClick, navLabel, align = 'left', hero = false, delta }: { label: string; value: string; tone?: MetricTone; icon?: LucideIcon; sub?: string; critical?: boolean; onClick?: () => void; navLabel?: string; align?: 'left' | 'center'; hero?: boolean; delta?: { text: string; tone: 'success' | 'danger' } }) {
  const toneClass = TONE_CLASS[tone];

  const cardClass = critical
    ? 'border-[color-mix(in_srgb,var(--chart-expense)_50%,var(--app-border))] bg-[color-mix(in_srgb,var(--chart-expense)_10%,var(--app-surface-1))]'
    : 'border-[var(--app-border)] bg-[var(--app-surface-1)]';

  // Hero shows the period's headline number large; the auto-fit ceiling rises so
  // it can breathe but still never overflows the card on a narrow phone.
  const valueRef = useFitText<HTMLDivElement>(value, hero ? 40 : 24);
  const centered = align === 'center';

  const inner = (
    <div className={`flex h-full flex-col ${centered ? 'items-center justify-center text-center' : ''}`}>
      <div className={`flex items-center gap-1.5 mb-2 ${centered ? 'justify-center px-3' : ''}`}>
        {Icon && <Icon className="w-3.5 h-3.5 text-[var(--app-text-3)] shrink-0" aria-hidden="true" />}
        <span className="text-xs font-bold text-[var(--app-text-3)] uppercase tracking-widest">{label}</span>
        {delta && (
          <span className={`ml-auto text-xs font-bold tabular-nums ${delta.tone === 'success' ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>{delta.text}</span>
        )}
      </div>
      <div ref={valueRef} className={`w-full font-bold tracking-tight tabular-nums whitespace-nowrap overflow-hidden ${hero ? 'text-4xl' : 'text-2xl'} ${centered ? 'text-center' : ''} ${toneClass}`}>{value}</div>
      {sub && <div className={`mt-1 text-xs text-[var(--app-text-3)] ${centered ? 'text-center' : ''}`}>{sub}</div>}
    </div>
  );

  const pad = hero ? 'px-6 py-5' : 'px-5 py-4';

  // Touch cards are elevated (raised surface + shadow, lift on hover); stat
  // cards are flat and slightly recessed, so tappable vs read-only reads at a glance.
  if (onClick) {
    const touchCardClass = critical
      ? cardClass
      : 'border-[color-mix(in_srgb,var(--app-strong-surface)_34%,var(--app-border))] bg-[var(--app-surface-1)]';
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={navLabel ?? `Ver ${label}`}
        className={`relative ${pad} pr-10 rounded-xl border shadow-[var(--app-shadow-md)] ${touchCardClass} w-full text-left cursor-pointer transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text-1)]`}
      >
        {inner}
        <span className="absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--app-strong-surface)_15%,transparent)] text-[var(--app-strong-surface)]" aria-hidden="true">
          <ChevronRight className="w-4 h-4" />
        </span>
      </button>
    );
  }

  const flatClass = critical ? cardClass : 'border-[var(--app-border)] bg-[var(--app-surface-1)]';
  return <div className={`relative ${pad} rounded-xl border ${flatClass}`}>{inner}</div>;
}

// Compact, low-emphasis stat for counts that shouldn't compete with money
// figures (e.g. "Empresas 4", "Recurrentes 3"). Tappable when given onClick.
export function MetricChip({ label, value, icon: Icon, onClick, navLabel }: { label: string; value: string; icon?: LucideIcon; onClick?: () => void; navLabel?: string }) {
  const content = (
    <>
      {Icon && <Icon className="w-3.5 h-3.5 text-[var(--app-text-3)] shrink-0" aria-hidden="true" />}
      <span className="text-[var(--app-text-3)]">{label}</span>
      <span className="font-bold tabular-nums text-[var(--app-text-1)]">{value}</span>
    </>
  );
  const base = 'inline-flex items-center gap-1.5 rounded-full border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-1.5 text-xs';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={navLabel ?? `Ver ${label}`} className={`${base} shadow-[var(--app-shadow-sm)] transition-[border-color,transform] duration-150 hover:border-[var(--app-border-strong)] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text-1)]`}>
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}

export function SectionCard({ title, description, children, icon: Icon, action }: { title: string; description?: string; children: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <section className="bg-white border border-[var(--app-border)] rounded-xl px-6 py-7 md:px-8 md:py-9 shadow-[var(--app-shadow-sm)]">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[var(--app-text-3)] shrink-0" aria-hidden="true" />}
          <h2 className="text-xl font-bold text-[var(--app-text-1)] tracking-tight">{title}</h2>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {description && (
        <p className="text-sm text-[var(--app-text-3)] mb-6 leading-relaxed">{description}</p>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[128px] flex-col items-center justify-center rounded-xl border border-dashed border-[color-mix(in_srgb,var(--app-strong-surface)_55%,var(--app-border))] bg-[var(--app-surface-2)] px-5 py-5 text-center text-sm text-[var(--app-text-2)]">
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
    <div className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-[color-mix(in_srgb,var(--app-strong-surface)_55%,var(--app-border))] bg-[var(--app-surface-2)] px-6 py-8 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--app-strong-surface)_70%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-strong-surface)_12%,var(--app-surface-1))] text-[var(--app-strong-surface)]">{icon}</div>}
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
