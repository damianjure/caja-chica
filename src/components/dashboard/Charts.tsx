import type { ReactNode } from 'react';

function formatCompact(value: number, currency: 'ARS' | 'USD' = 'ARS') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: 0,
  }).format(value);
}

export function ChartCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--app-border)] bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-[var(--app-text-1)] md:text-lg">{title}</h3>
        {description ? <p className="mt-1 text-sm text-[var(--app-text-3)]">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-5 border-t border-[var(--app-border)] pt-4">{footer}</div> : null}
    </section>
  );
}

/**
 * Monthly pulse as a smooth area chart: income/expense as soft areas, net as a bold
 * line on top. One chart, switched between ARS/USD by the caller (replaces the old
 * twin TrendBars cards). Pure SVG + theme tokens, zero chart dependency.
 */
export interface ChartSeriesVisibility {
  income: boolean;
  expense: boolean;
  net: boolean;
}

export function AreaTrendChart({
  data,
  currency = 'ARS',
  show = { income: true, expense: true, net: true },
}: {
  data: Array<{ label: string; income: number; expense: number; net: number }>;
  currency?: 'ARS' | 'USD';
  show?: ChartSeriesVisibility;
}) {
  const n = data.length;
  if (n === 0) return null;

  const W = 720, H = 240, padL = 24, padR = 24, padT = 28, padB = 34;
  const base = H - padB;
  // Y-axis scales to the visible income/expense series so toggling re-fits the chart.
  const visibleVals = [
    ...(show.income ? data.map((d) => d.income) : []),
    ...(show.expense ? data.map((d) => d.expense) : []),
  ];
  const maxV = Math.max(...visibleVals, 1) * 1.1;
  const y = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);
  const x = (i: number) => padL + (i + 0.5) * ((W - padL - padR) / n);
  const nets = data.map((d) => d.net);
  const maxNet = Math.max(...nets.map((v) => Math.abs(v)), 1);
  const yNet = (v: number) => padT + (0.5 - (v / maxNet) * 0.42) * (H - padT - padB);

  const smooth = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    let p = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const xm = (pts[i - 1].x + pts[i].x) / 2;
      p += ` C ${xm} ${pts[i - 1].y} ${xm} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    return p;
  };

  const incLine = smooth(data.map((d, i) => ({ x: x(i), y: y(d.income) })));
  const expLine = smooth(data.map((d, i) => ({ x: x(i), y: y(d.expense) })));
  const netLine = smooth(nets.map((v, i) => ({ x: x(i), y: yNet(v) })));
  const closeArea = (line: string) => `${line} L ${x(n - 1)} ${base} L ${x(0)} ${base} Z`;

  const summary = `Evolución mensual en ${currency}: ${data
    .map((d) => `${d.label}: saldo ${formatCompact(d.net, currency)}`)
    .join('; ')}.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible anim-fade-in" role="img" aria-label={summary}>
      <line x1={padL} y1={base} x2={W - padR} y2={base} stroke="var(--chart-baseline)" strokeWidth={1} />
      {show.income && <path d={closeArea(incLine)} fill="var(--chart-income)" fillOpacity={0.15} />}
      {show.expense && <path d={closeArea(expLine)} fill="var(--chart-expense)" fillOpacity={0.12} />}
      {show.income && <path d={incLine} fill="none" stroke="var(--chart-income)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
      {show.expense && <path d={expLine} fill="none" stroke="var(--chart-expense)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
      {show.net && <path d={netLine} fill="none" stroke="var(--chart-net)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      {data.map((d, i) => (
        <g key={d.label}>
          {show.net && <circle cx={x(i)} cy={yNet(nets[i])} r={4} fill="var(--app-surface-1)" stroke="var(--chart-net)" strokeWidth={2.5} />}
          {show.net && (
            <text
              x={x(i)}
              y={yNet(nets[i]) - 10}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={nets[i] >= 0 ? 'var(--chart-net)' : 'var(--chart-expense)'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {nets[i] >= 0 ? '↑ ' : '↓ '}{formatCompact(nets[i], currency)}
            </text>
          )}
          <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--app-text-3)">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HorizontalBarList({
  items,
  currency = 'ARS',
  emptyLabel = 'Sin datos',
}: {
  items: Array<{
    label: string;
    value: number;
    valueLabel?: string;
    secondary?: string;
    supportingValue?: string;
    income?: number;
    expense?: number;
    segments?: Array<{ value: number; colorClass: string; label: string; currency?: 'ARS' | 'USD' }>;
    accent?: 'neutral' | 'success' | 'danger';
  }>;
  currency?: 'ARS' | 'USD';
  emptyLabel?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  if (items.length === 0) {
    return <p className="text-sm text-[var(--app-text-3)]">{emptyLabel}</p>;
  }

  const summary = `Lista comparativa de ${items.length} ítems. ${items.slice(0, 5).map((item) => `${item.label}: ${item.valueLabel ?? formatCompact(item.value, currency)}`).join('; ')}${items.length > 5 ? `, y ${items.length - 5} más` : ''}.`;

  return (
    <div className="space-y-3" role="list" aria-label={summary}>
      {items.map((item) => (
        <div key={item.label} role="listitem" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--app-text-1)]">{item.label}</div>
              {item.secondary ? <div className="text-xs text-[var(--app-text-3)]">{item.secondary}</div> : null}
            </div>
            <div className="text-sm font-semibold text-[var(--app-text-1)] text-right tabular-nums">{item.valueLabel ?? formatCompact(item.value, currency)}</div>
          </div>
          {item.supportingValue ? (
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--app-text-3)]">
              <span>&nbsp;</span>
              <span>{item.supportingValue}</span>
            </div>
          ) : null}
          <div className="relative">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-2)]">
              {item.segments && item.segments.length > 0 ? (
                <div className="flex h-full w-full overflow-hidden rounded-full">
                  {item.segments.map((segment) => (
                    <div
                      key={`${item.label}-${segment.label}`}
                      className={`h-full ${segment.colorClass}`}
                      style={{
                        width: `${(segment.value / Math.max(item.segments?.reduce((acc, current) => acc + current.value, 0), 1)) * 100}%`,
                      }}
                      title={`${segment.label} ${formatCompact(segment.value, segment.currency ?? currency)}`}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(item.value / max) * 100}%`,
                    backgroundColor:
                      item.accent === 'success'
                        ? 'var(--chart-income)'
                        : item.accent === 'danger'
                          ? 'var(--chart-expense)'
                          : 'var(--app-text-1)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

