import type { ReactNode } from 'react';

export function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' | 'warning' }) {
  const toneClass = {
    neutral: 'text-neutral-900',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-amber-600',
  }[tone];

  return (
    <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
      <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest block mb-1">{label}</span>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

export function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-5">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
        {description && <p className="text-sm text-neutral-500 mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
      <div className="font-semibold text-neutral-900 mb-1">{title}</div>
      <p>{body}</p>
    </div>
  );
}
