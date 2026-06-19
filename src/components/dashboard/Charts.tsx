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

  // Alto dinámico: compacto con pocos datos, crece hasta 240 a medida que entran meses.
  const W = 720, padL = 24, padR = 24, padT = 28, padB = 34;
  const H = Math.min(240, Math.max(150, 110 + n * 22));
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

  const visibles = [show.income && 'ingresos', show.expense && 'gastos', show.net && 'saldo'].filter(Boolean).join(', ');
  const summary = `Evolución mensual en ${currency}. Series visibles: ${visibles || 'ninguna'}.${show.net ? ` ${data.map((d) => `${d.label}: saldo ${formatCompact(d.net, currency)}`).join('; ')}.` : ''}`;

  // Mobile: los meses recientes como tarjetas con números grandes (el SVG solo dibuja la tendencia).
  const lastMonths = data.slice(-2);
  const current = data[n - 1];

  return (
    <>
      {/* Desktop: gráfico con etiquetas de saldo sobre cada punto */}
      <svg viewBox={`0 0 ${W} ${H}`} className="hidden md:block w-full h-auto overflow-visible anim-fade-in" role="img" aria-label={summary}>
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

      {/* Mobile: trazos limpios + tarjetas legibles con los números */}
      <div className="md:hidden anim-fade-in" role="img" aria-label={summary}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" aria-hidden="true">
          <line x1={padL} y1={base} x2={W - padR} y2={base} stroke="var(--chart-baseline)" strokeWidth={1} />
          {show.income && <path d={closeArea(incLine)} fill="var(--chart-income)" fillOpacity={0.15} />}
          {show.expense && <path d={closeArea(expLine)} fill="var(--chart-expense)" fillOpacity={0.12} />}
          {show.income && <path d={incLine} fill="none" stroke="var(--chart-income)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
          {show.expense && <path d={expLine} fill="none" stroke="var(--chart-expense)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
          {show.net && <path d={netLine} fill="none" stroke="var(--chart-net)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
          {show.net && <circle cx={x(n - 1)} cy={yNet(nets[n - 1])} r={5} fill="var(--app-surface-1)" stroke="var(--chart-net)" strokeWidth={3} />}
          {data.map((d, i) => (
            <text key={d.label} x={x(i)} y={H - 10} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--app-text-3)">
              {d.label}
            </text>
          ))}
        </svg>
        <div className="mt-3 flex gap-2">
          {lastMonths.map((d) => (
            <div key={d.label} className="flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2.5 text-center">
              <div className="text-xs text-[var(--app-text-3)] mb-1">{d.label}</div>
              {show.income && <div className="text-sm font-bold tabular-nums text-[var(--chart-income)]">+{formatCompact(d.income, currency)}</div>}
              {show.expense && <div className="text-sm font-bold tabular-nums text-[var(--chart-expense)]">−{formatCompact(d.expense, currency)}</div>}
            </div>
          ))}
          {show.net && (
            <div className="flex-1 rounded-xl border border-[var(--chart-net)] bg-[var(--app-surface-2)] px-3 py-2.5 text-center">
              <div className="text-xs text-[var(--app-text-3)] mb-1">Saldo</div>
              <div className="text-base font-extrabold tabular-nums text-[var(--chart-net)]">{formatCompact(current.net, currency)}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Grouped bar chart: two bars per month (income / expense) + net marker line.
 * Uses same data shape as AreaTrendChart.
 */
export function GroupedBarChart({
  data,
  currency = 'ARS',
}: {
  data: Array<{ label: string; income: number; expense: number; net: number }>;
  currency?: 'ARS' | 'USD';
}) {
  const n = data.length;
  if (n === 0) return null;

  const W = 720, padL = 28, padR = 16, padT = 36, padB = 32;
  const H = Math.min(220, Math.max(140, 100 + n * 16));
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const base = H - padB;

  const maxV = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1) * 1.12;
  const yv = (v: number) => padT + (1 - Math.max(0, v) / maxV) * chartH;

  const groupW = chartW / n;
  const barW = Math.min(groupW * 0.32, 28);
  const gap = barW * 0.2;
  const groupCx = (i: number) => padL + groupW * i + groupW / 2;
  const incX = (i: number) => groupCx(i) - gap / 2 - barW;
  const expX = (i: number) => groupCx(i) + gap / 2;

  const netPts = data.map((d, i) => ({ x: groupCx(i), y: yv(d.net) }));
  const netPath = netPts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  const summary = `Ingresos y gastos mensuales en ${currency}. ${data.map((d) => `${d.label}: ingreso ${formatCompact(d.income, currency)}, gasto ${formatCompact(d.expense, currency)}, neto ${formatCompact(d.net, currency)}`).join('; ')}.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible anim-fade-in" role="img" aria-label={summary}>
      {/* Baseline */}
      <line x1={padL} y1={base} x2={W - padR} y2={base} stroke="var(--chart-baseline)" strokeWidth={1} />

      {data.map((d, i) => {
        const incH = Math.max(0, (d.income / maxV) * chartH);
        const expH = Math.max(0, (d.expense / maxV) * chartH);
        return (
          <g key={d.label}>
            {/* Income bar */}
            <rect x={incX(i)} y={base - incH} width={barW} height={incH} rx={3} fill="var(--chart-income)" fillOpacity={0.75} />
            {/* Expense bar */}
            <rect x={expX(i)} y={base - expH} width={barW} height={expH} rx={3} fill="var(--chart-expense)" fillOpacity={0.75} />
            {/* Month label */}
            <text x={groupCx(i)} y={H - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--app-text-3)">{d.label}</text>
          </g>
        );
      })}

      {/* Net line */}
      <path d={netPath} fill="none" stroke="var(--chart-net)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {netPts.map((p, i) => {
        const net = data[i].net;
        const showLabel = n <= 6;
        return (
          <g key={`net-${i}`}>
            <circle cx={p.x} cy={p.y} r={4} fill="var(--app-surface-1)" stroke="var(--chart-net)" strokeWidth={2.5} />
            {showLabel && (
              <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={10} fontWeight={700}
                fill={net >= 0 ? 'var(--chart-net)' : 'var(--chart-expense)'}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCompact(net, currency)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Puente de caja (waterfall). Ingresos (start) → resta categorías (down) → Saldo (end).
 * SVG puro + tokens. Segmentos de buildCashflowBridge (from/to por barra).
 */
export function WaterfallChart({
  segments,
  currency = 'ARS',
}: {
  segments: Array<{ label: string; kind: 'start' | 'down' | 'end'; value: number; from: number; to: number }>;
  currency?: 'ARS' | 'USD';
}) {
  const n = segments.length;
  if (n === 0) return null;

  const W = 720, padL = 20, padR = 20, padT = 26, padB = 44;
  const H = Math.min(260, Math.max(170, 120 + n * 14));
  const vals = segments.flatMap((s) => [s.from, s.to]);
  const maxV = Math.max(...vals, 1);
  const minV = Math.min(...vals, 0);
  const span = (maxV - minV) || 1;
  const y = (v: number) => padT + (1 - (v - minV) / span) * (H - padT - padB);
  const band = (W - padL - padR) / n;
  const barW = Math.min(46, band * 0.62);
  const cx = (i: number) => padL + (i + 0.5) * band;
  const color = (s: { kind: string; to: number }) =>
    s.kind === 'down' ? 'var(--chart-expense)' : (s.to >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)');
  const short = (l: string) => (l.length > 9 ? `${l.slice(0, 8)}…` : l);
  const end = segments[n - 1];
  const summary = `Puente de caja en ${currency}: de ingresos ${formatCompact(segments[0].to, currency)} a saldo ${formatCompact(end.to, currency)}.`;

  // Mobile: barras horizontales centradas en la línea base. Verde a la derecha (suma),
  // rojo a la izquierda (resta). Escala por la magnitud mayor.
  const magnitude = (s: typeof segments[number]) => (s.kind === 'down' ? s.value : Math.abs(s.to));
  const maxMag = Math.max(...segments.map(magnitude), 1);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="hidden md:block w-full h-auto overflow-visible anim-fade-in" role="img" aria-label={summary}>
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="var(--chart-baseline)" strokeWidth={1} strokeDasharray="3 4" />
        {segments.map((s, i) => {
          const top = y(Math.max(s.from, s.to));
          const h = Math.max(2, Math.abs(y(s.from) - y(s.to)));
          return (
            <g key={`${s.label}-${i}`}>
              <rect x={cx(i) - barW / 2} y={top} width={barW} height={h} rx={5} fill={color(s)} fillOpacity={s.kind === 'down' ? 0.9 : 1} />
              {i < n - 1 && (
                <line x1={cx(i) + barW / 2} y1={y(s.to)} x2={cx(i + 1) - barW / 2} y2={y(s.to)} stroke="var(--app-border-strong)" strokeWidth={1.5} strokeDasharray="2 3" />
              )}
              <text x={cx(i)} y={top - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--app-text-2)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.kind === 'down' ? '−' : ''}{formatCompact(s.kind === 'down' ? s.value : s.to, currency)}
              </text>
              <text x={cx(i)} y={H - 12} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--app-text-3)">{short(s.label)}</text>
            </g>
          );
        })}
      </svg>

      {/* Mobile: barras horizontales tipo lista */}
      <div className="md:hidden anim-fade-in" role="img" aria-label={summary}>
        {segments.map((s, i) => {
          const isDown = s.kind === 'down';
          const isNeg = isDown || s.to < 0;
          const pct = (magnitude(s) / maxMag) * 50; // mitad del ancho como máximo por lado
          const isEnd = s.kind === 'end';
          return (
            <div
              key={`${s.label}-${i}`}
              className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-2.5 py-1.5 ${isEnd ? 'mt-1 border-t border-[var(--app-border)] pt-2.5' : ''}`}
            >
              <span className={`truncate text-xs ${isEnd ? 'font-bold text-[var(--app-text-1)]' : 'text-[var(--app-text-2)]'}`}>{s.label}</span>
              <div className="relative h-5 rounded-md bg-[var(--app-surface-2)]">
                <div
                  className="absolute bottom-0 top-0 rounded-md"
                  style={{
                    [isNeg ? 'right' : 'left']: '50%',
                    width: `${pct}%`,
                    backgroundColor: isNeg ? 'var(--chart-expense)' : 'var(--chart-income)',
                    opacity: isEnd ? 0.5 : 1,
                  }}
                />
              </div>
              <span
                className="text-right text-sm font-extrabold tabular-nums"
                style={{ color: isEnd ? 'var(--chart-net)' : isNeg ? 'var(--chart-expense)' : 'var(--chart-income)' }}
              >
                {isNeg ? '−' : '+'}{formatCompact(isDown ? s.value : Math.abs(s.to), currency)}
              </span>
            </div>
          );
        })}
      </div>
    </>
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

