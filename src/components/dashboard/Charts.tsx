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
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-neutral-900 md:text-lg">{title}</h3>
        {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-5 border-t border-neutral-200 pt-4">{footer}</div> : null}
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

  const summary = data.length === 0
    ? `Gráfico de evolución mensual en ${currency}: sin datos.`
    : `Gráfico de evolución mensual en ${currency}: ${data.length} meses. ${data.map((item) => `${item.label}: ingresos ${formatCompact(item.income, currency)}, gastos ${formatCompact(item.expense, currency)}, saldo ${formatCompact(item.net, currency)}`).join('; ')}.`;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6" role="img" aria-label={summary}>
      {data.map((item) => {
        const incomeHeight = `${Math.max((item.income / max) * 100, item.income > 0 ? 10 : 0)}%`;
        const expenseHeight = `${Math.max((item.expense / max) * 100, item.expense > 0 ? 10 : 0)}%`;
        const netOffset = item.net === 0 ? '50%' : `${Math.min(85, Math.max(22, 50 - (item.net / max) * 28))}%`;

        return (
          <div key={item.label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-3 flex h-40 items-end justify-center gap-3 relative">
              <div className="absolute left-1/2 top-1/2 h-px w-[72%] -translate-x-1/2" style={{ backgroundColor: 'var(--chart-baseline)' }} />
              <div
                className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-1 text-xs font-semibold shadow-sm text-white"
                style={{ top: netOffset, backgroundColor: item.net >= 0 ? 'var(--chart-net)' : 'var(--chart-expense)' }}
                title={`Saldo ${formatCompact(item.net, currency)}`}
              >
                {item.net >= 0 ? '↑ ' : '↓ '}{formatCompact(item.net, currency)}
              </div>
              <div className="w-5 rounded-full" style={{ height: incomeHeight, backgroundColor: 'var(--chart-income)' }} title={`Ingresos ${formatCompact(item.income, currency)}`} />
              <div className="w-5 rounded-full" style={{ height: expenseHeight, backgroundColor: 'var(--chart-expense)' }} title={`Gastos ${formatCompact(item.expense, currency)}`} />
              <div className="w-5 rounded-full opacity-60" style={{ height: '50%', backgroundColor: 'var(--chart-baseline)' }} title="Línea de referencia del saldo" />
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

  const summary = `Lista comparativa de ${items.length} ítems. ${items.slice(0, 5).map((item) => `${item.label}: ${item.valueLabel ?? formatCompact(item.value, currency)}`).join('; ')}${items.length > 5 ? `, y ${items.length - 5} más` : ''}.`;

  return (
    <div className="space-y-3" role="list" aria-label={summary}>
      {items.map((item) => (
        <div key={item.label} role="listitem" className="space-y-2">
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

