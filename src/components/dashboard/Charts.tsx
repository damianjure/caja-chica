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
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-neutral-900 md:text-lg">{title}</h3>
        {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-5 border-t border-neutral-100 pt-4">{footer}</div> : null}
    </section>
  );
}

export function TrendBars({
  data,
  currency = 'ARS',
}: {
  data: Array<{ label: string; income: number; expense: number; net: number }>;
  currency?: 'ARS' | 'USD';
}) {
  const max = Math.max(...data.flatMap((item) => [item.income, item.expense]), 1);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {data.map((item) => {
        const incomeHeight = `${Math.max((item.income / max) * 100, item.income > 0 ? 10 : 0)}%`;
        const expenseHeight = `${Math.max((item.expense / max) * 100, item.expense > 0 ? 10 : 0)}%`;
        const netOffset = item.net === 0 ? '50%' : `${Math.min(85, Math.max(22, 50 - (item.net / max) * 28))}%`;

        return (
          <div key={item.label} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
            <div className="mb-3 flex h-40 items-end justify-center gap-3 relative">
              <div className="absolute left-1/2 top-1/2 h-px w-[72%] -translate-x-1/2 bg-neutral-200" />
              <div
                className={`absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-1 text-[11px] font-semibold shadow-sm ${
                  item.net >= 0
                    ? 'bg-emerald-900 text-white'
                    : 'bg-red-100 text-red-700'
                }`}
                style={{ top: netOffset }}
                title={`Saldo ${formatCompact(item.net, currency)}`}
              >
                {formatCompact(item.net, currency)}
              </div>
              <div className="w-5 rounded-full bg-green-500/85" style={{ height: incomeHeight }} title={`Ingresos ${formatCompact(item.income, currency)}`} />
              <div className="w-5 rounded-full bg-red-500/85" style={{ height: expenseHeight }} title={`Gastos ${formatCompact(item.expense, currency)}`} />
              <div className="w-5 rounded-full bg-neutral-200/80" style={{ height: '50%' }} title="Línea de referencia del saldo" />
            </div>
            <div className="text-center text-xs text-neutral-500">
              {item.net >= 0 ? 'Ingresó más de lo que salió' : 'Salió más de lo que ingresó'}
            </div>
            <div className="text-center text-xs font-semibold text-neutral-900">{item.label}</div>
          </div>
        );
      })}
    </div>
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
    return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-neutral-900">{item.label}</div>
              {item.secondary ? <div className="text-xs text-neutral-500">{item.secondary}</div> : null}
            </div>
            <div className="text-sm font-semibold text-neutral-900 text-right">{item.valueLabel ?? formatCompact(item.value, currency)}</div>
          </div>
          {item.supportingValue ? (
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
              <span>&nbsp;</span>
              <span>{item.supportingValue}</span>
            </div>
          ) : null}
          <div className="relative">
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
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
                  className={`h-full rounded-full ${
                    item.accent === 'success'
                      ? 'bg-green-500'
                      : item.accent === 'danger'
                        ? 'bg-red-500'
                        : 'bg-neutral-900'
                  }`}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BudgetComparisonList({
  items,
}: {
  items: Array<{ label: string; budget: number; actual: number; variance: number }>;
}) {
  const max = Math.max(...items.flatMap((item) => [item.budget, item.actual]), 1);

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">No hay datos de presupuesto para mostrar.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-neutral-900">{item.label}</div>
              <div className={`text-xs ${item.variance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {item.variance >= 0 ? 'Dentro de presupuesto' : 'Pasado de presupuesto'} · {formatCompact(item.variance)}
              </div>
            </div>
            <div className="text-right text-xs text-neutral-500">
              <div>Presup.: <span className="font-semibold text-neutral-900">{formatCompact(item.budget)}</span></div>
              <div>Real: <span className="font-semibold text-red-600">{formatCompact(item.actual)}</span></div>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500"><span>Presupuesto</span><span>{formatCompact(item.budget)}</span></div>
              <div className="h-2 rounded-full bg-neutral-200"><div className="h-full rounded-full bg-neutral-900" style={{ width: `${(item.budget / max) * 100}%` }} /></div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500"><span>Real</span><span>{formatCompact(item.actual)}</span></div>
              <div className="h-2 rounded-full bg-red-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${(item.actual / max) * 100}%` }} /></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
