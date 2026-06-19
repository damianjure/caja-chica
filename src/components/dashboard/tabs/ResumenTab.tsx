
import { useMemo, useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Wallet, Building2, Repeat } from 'lucide-react';
import { ChartCard, HorizontalBarList, GroupedBarChart, WaterfallChart } from '../Charts';
import { EmptyState, MetricCard, MetricChip, SectionCard } from '../primitives';
import type { ForecastResult } from '../../../dashboard/forecast';
import { buildMonthlyChartData, buildCashflowBridge, getMonthlySummaries, buildMonthlyComparison } from '../../../dashboard/summary';
import type { Movimiento } from '../../../services/api';

interface ResumenTabProps {
  arsIngreso: string;
  arsEgreso: string;
  arsNeto: string;
  usdNeto: string;
  companyCount: number;
  history: Movimiento[];
  companiesList: string[];
  topExpenseCategories: Array<{ label: string; value: number; secondary?: string }>;
  topCompanies: Array<{ label: string; value: number; valueLabel?: string; secondary?: string; supportingValue?: string; segments?: Array<{ value: number; colorClass: string; label: string; currency?: 'ARS' | 'USD' }> }>;
  incomeTags: Array<{ label: string; value: string; secondary?: string }>;
  netPositive: boolean;
  canWriteData: boolean;
  forecast: ForecastResult;
  projectedArsFormatted: string;
  projectedUsdFormatted: string;
  insights: string[];
  recurrentesCount: number;
  onMetricNavigate?: (metric: 'ingresos' | 'gastos' | 'utilidad' | 'usd' | 'empresas' | 'recurrentes') => void;
}

function CompanyFilterPills({
  companyNames, hiddenCompanies, onReset, onToggle,
}: {
  companyNames: string[];
  hiddenCompanies: Set<string>;
  onReset: () => void;
  onToggle: (name: string) => void;
}) {
  if (companyNames.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por empresa">
      <button type="button" onClick={onReset} aria-pressed={hiddenCompanies.size === 0}
        className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition ${hiddenCompanies.size === 0 ? 'border-[var(--app-border-strong)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] font-semibold' : 'border-[var(--app-border)] text-[var(--app-text-3)] hover:text-[var(--app-text-1)]'}`}>
        Todas
      </button>
      {companyNames.map((name) => {
        const on = !hiddenCompanies.has(name);
        return (
          <button key={name} type="button" onClick={() => onToggle(name)} aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition ${on ? 'border-[var(--app-strong-surface)] bg-[color-mix(in_srgb,var(--app-strong-surface)_16%,transparent)] text-[var(--app-text-1)] font-medium' : 'border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text-3)] opacity-45 hover:opacity-75'}`}>
            {name}
          </button>
        );
      })}
    </div>
  );
}

export default function ResumenTab(props: ResumenTabProps) {
  const [chartCurrency, setChartCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [hiddenCompanies, setHiddenCompanies] = useState<Set<string>>(new Set());

  const nav = (m: 'ingresos' | 'gastos' | 'utilidad' | 'usd' | 'empresas' | 'recurrentes') =>
    props.onMetricNavigate ? () => props.onMetricNavigate!(m) : undefined;

  const companyNames = useMemo(
    () => props.companiesList.filter((c) => c !== 'all').slice().sort((a, b) => a.localeCompare(b, 'es')),
    [props.companiesList],
  );

  const visibleCompanies = useMemo(() => companyNames.filter((c) => !hiddenCompanies.has(c)), [companyNames, hiddenCompanies]);

  const pulseData = useMemo(() => {
    const visible = companyNames.filter((c) => !hiddenCompanies.has(c));
    return buildMonthlyChartData(props.history, chartCurrency, hiddenCompanies.size ? visible : null);
  }, [props.history, chartCurrency, hiddenCompanies, companyNames]);

  const bridgeData = useMemo(
    () => buildCashflowBridge(props.history, chartCurrency, hiddenCompanies.size ? visibleCompanies : null),
    [props.history, chartCurrency, hiddenCompanies, visibleCompanies],
  );

  const comparison = useMemo(
    () => buildMonthlyComparison(getMonthlySummaries(props.history), chartCurrency),
    [props.history, chartCurrency],
  );

  const toggleCompany = (name: string) =>
    setHiddenCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); }
      else {
        if (companyNames.filter((c) => !next.has(c)).length <= 1) return prev;
        next.add(name);
      }
      return next;
    });

  const currencyToggle = (
    <div className="inline-flex shrink-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-0.5" role="group" aria-label="Moneda del gráfico">
      {(['ARS', 'USD'] as const).map((c) => (
        <button key={c} type="button" onClick={() => setChartCurrency(c)} aria-pressed={chartCurrency === c}
          className={`rounded-md px-3 py-1 text-xs font-bold tabular-nums transition ${chartCurrency === c ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]' : 'text-[var(--app-text-3)] hover:text-[var(--app-text-1)]'}`}>
          {c}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI hierarchy: neto → ingresos → gastos → chips */}
      <div className="space-y-3">
        <MetricCard hero label="Utilidad acumulada · ARS" value={props.arsNeto} tone={props.netPositive ? 'success' : 'danger'} critical={!props.netPositive} sub={props.netPositive ? undefined : 'requiere revisión'} onClick={nav('utilidad')} navLabel="Ver todos los movimientos" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard label="Ingresos ARS" value={props.arsIngreso} tone="success" icon={TrendingUp} onClick={nav('ingresos')} navLabel="Ver ingresos en movimientos" />
          <MetricCard label="Gastos ARS" value={props.arsEgreso} tone="danger" icon={TrendingDown} onClick={nav('gastos')} navLabel="Ver gastos en movimientos" />
        </div>

        {/* vs. período anterior — inline con los KPIs */}
        {comparison.hasPrev && (
          <div className="grid grid-cols-3 gap-2">
            {([
              ['Ingresos', comparison.ingresos, true],
              ['Gastos', comparison.gastos, false],
              ['Utilidad', comparison.utilidad, true],
            ] as const).map(([label, row, upIsGood]) => {
              if (row.deltaPct === null || row.isNew) return null;
              const up = row.deltaPct >= 0;
              const good = up === upIsGood;
              return (
                <div key={label} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-3)] mb-0.5">{label} vs mes ant.</div>
                  <div className={`text-sm font-bold tabular-nums ${good ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
                    <span aria-hidden="true">{up ? '▲' : '▼'} </span>{Math.abs(row.deltaPct)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <MetricChip label="Neto USD" value={props.usdNeto} icon={Wallet} onClick={nav('usd')} navLabel="Ver movimientos en dólares" />
          <MetricChip label="Empresas" value={String(props.companyCount)} icon={Building2} onClick={nav('empresas')} navLabel="Ver empresas" />
          <MetricChip label="Recurrentes" value={String(props.recurrentesCount)} icon={Repeat} onClick={nav('recurrentes')} navLabel="Ver recurrentes" />
        </div>
      </div>

      {/* Visualización 1: Ingresos vs Gastos por mes (grouped bar) */}
      <ChartCard title="Ingresos vs gastos" description="Barras mensuales + línea de saldo neto.">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {companyNames.length > 1 ? (
            <CompanyFilterPills companyNames={companyNames} hiddenCompanies={hiddenCompanies} onReset={() => setHiddenCompanies(new Set())} onToggle={toggleCompany} />
          ) : <span />}
          <div className="flex items-center gap-3 justify-end">
            <div className="flex items-center gap-3 text-xs text-[var(--app-text-3)]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-income)', opacity: 0.75 }} />Ingreso</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-expense)', opacity: 0.75 }} />Gasto</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: 'var(--chart-net)' }} />Saldo</span>
            </div>
            {currencyToggle}
          </div>
        </div>
        {pulseData.length === 0 ? (
          <EmptyState title={chartCurrency === 'ARS' ? 'Aún no hay historia en pesos.' : 'Aún no hay historia en dólares.'} hint="Cargá movimientos y el gráfico aparece acá." canWrite={props.canWriteData} icon={<BarChart2 className="w-8 h-8" strokeWidth={1.5} />} />
        ) : (
          <GroupedBarChart data={pulseData} currency={chartCurrency} />
        )}
      </ChartCard>

      {/* Visualizaciones 2 y 3: Flujo de caja + Gastos que más pesan */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Flujo de caja" description="Cómo cada categoría reduce la caja.">
          {companyNames.length > 1 && (
            <div className="mb-4">
              <CompanyFilterPills companyNames={companyNames} hiddenCompanies={hiddenCompanies} onReset={() => setHiddenCompanies(new Set())} onToggle={toggleCompany} />
            </div>
          )}
          {bridgeData.length === 0 ? (
            <EmptyState title="Sin datos para el puente de caja." hint="Cargá ingresos y gastos para ver cómo se forma el saldo." canWrite={props.canWriteData} icon={<BarChart2 className="w-8 h-8" strokeWidth={1.5} />} />
          ) : (
            <WaterfallChart segments={bridgeData} currency={chartCurrency} />
          )}
        </ChartCard>

        <ChartCard title="Gastos que más pesan" description="Top categorías por gasto.">
          <HorizontalBarList items={props.topExpenseCategories.map((item) => ({ ...item, accent: 'danger' as const }))} emptyLabel="Todavía no hay gastos cargados." />
        </ChartCard>
      </section>

      {/* Proyección */}
      <SectionCard title="Proyección a 30 días" description="Saldo estimado con los recurrentes activos (no incluye imprevistos).">
        {props.forecast.occurrences.length === 0 ? (
          <EmptyState title="Sin recurrentes activos para proyectar." hint="Activá o creá recurrentes en la pestaña Recurrentes para ver la proyección." canWrite={props.canWriteData} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <MetricCard label="Saldo proyectado ARS" value={props.projectedArsFormatted} tone="neutral" icon={Wallet} />
              <MetricCard label="Saldo proyectado USD" value={props.projectedUsdFormatted} tone="neutral" icon={Wallet} />
            </div>
            <ul className="space-y-0 divide-y divide-[var(--app-border)]" role="list">
              {props.forecast.occurrences.slice(0, 8).map((occ, i) => (
                <li key={`${occ.date}-${i}`} role="listitem" className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-xs text-[var(--app-text-3)] tabular-nums w-12 shrink-0">{occ.date.slice(5)}</span>
                  <span className="text-sm text-[var(--app-text-2)] flex-1 truncate">{occ.descripcion || '—'}</span>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${occ.signedAmount >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}>
                    {occ.signedAmount >= 0 ? '+' : '−'}{new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.abs(occ.signedAmount))} {occ.moneda}
                  </span>
                </li>
              ))}
            </ul>
            {props.forecast.occurrences.length > 8 && (
              <p className="text-xs text-[var(--app-text-3)]">y {props.forecast.occurrences.length - 8} movimiento{props.forecast.occurrences.length - 8 === 1 ? '' : 's'} más en los próximos 30 días.</p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
