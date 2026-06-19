
import { useMemo, useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Building2, Repeat } from 'lucide-react';
import { ChartCard, HorizontalBarList, GroupedBarChart, WaterfallChart } from '../Charts';
import { EmptyState, MetricCard, SectionCard } from '../primitives';
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
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

  const nextOccurrence = props.forecast.occurrences[0];

  const ingDelta = comparison.hasPrev && !comparison.ingresos.isNew && comparison.ingresos.deltaPct !== null
    ? { text: `${comparison.ingresos.deltaPct >= 0 ? '+' : ''}${comparison.ingresos.deltaPct}% vs ant.`, tone: (comparison.ingresos.deltaPct >= 0 ? 'success' : 'danger') as 'success' | 'danger' }
    : undefined;
  const gasDelta = comparison.hasPrev && !comparison.gastos.isNew && comparison.gastos.deltaPct !== null
    ? { text: `${comparison.gastos.deltaPct >= 0 ? '+' : ''}${comparison.gastos.deltaPct}% vs ant.`, tone: (comparison.gastos.deltaPct <= 0 ? 'success' : 'danger') as 'success' | 'danger' }
    : undefined;

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

  const recentMovements = props.history.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* 4-KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <MetricCard
          label="Saldo total"
          value={props.arsNeto}
          tone={props.netPositive ? 'success' : 'danger'}
          critical={!props.netPositive}
          sub={`${props.companyCount} empresa${props.companyCount !== 1 ? 's' : ''}`}
          onClick={nav('utilidad')}
          navLabel="Ver todos los movimientos"
        />
        <MetricCard
          label="Ingresos del mes"
          value={props.arsIngreso}
          tone="success"
          icon={TrendingUp}
          delta={ingDelta}
          onClick={nav('ingresos')}
          navLabel="Ver ingresos en movimientos"
        />
        <MetricCard
          label="Gastos del mes"
          value={props.arsEgreso}
          tone="danger"
          icon={TrendingDown}
          delta={gasDelta}
          onClick={nav('gastos')}
          navLabel="Ver gastos en movimientos"
        />
        <MetricCard
          label="Recurrentes activos"
          value={String(props.recurrentesCount)}
          tone="neutral"
          icon={Repeat}
          sub={nextOccurrence ? `Próximo: ${nextOccurrence.date.slice(5)}` : undefined}
          onClick={nav('recurrentes')}
          navLabel="Ver recurrentes"
        />
      </div>

      {/* 2-col: chart + actividad reciente */}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <ChartCard title="Flujo de los últimos 6 meses" description="Ingresos y gastos mensuales + línea de saldo neto.">
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

        {/* Actividad reciente */}
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-5 py-5 shadow-[var(--app-shadow-sm)]">
          <h3 className="text-sm font-bold text-[var(--app-text-1)] mb-4">Actividad reciente</h3>
          {recentMovements.length === 0 ? (
            <EmptyState title="Sin movimientos todavía." hint="Cargá tu primer movimiento." canWrite={props.canWriteData} />
          ) : (
            <ul className="divide-y divide-[var(--app-border)]" role="list">
              {recentMovements.map((m) => (
                <li key={m.id} role="listitem" className="flex items-center gap-3 py-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.tipo === 'ingreso' ? 'bg-[var(--app-green-surface)]' : 'bg-[var(--app-red-surface)]'}`}>
                    {m.tipo === 'ingreso'
                      ? <TrendingUp className="w-3.5 h-3.5 text-[var(--app-green-text)]" aria-hidden="true" />
                      : <TrendingDown className="w-3.5 h-3.5 text-[var(--app-red-text)]" aria-hidden="true" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--app-text-1)] truncate">
                      {m.descripcion || '—'}
                    </div>
                    <div className="text-xs text-[var(--app-text-3)]">{timeAgo(m.created_at)}</div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums shrink-0 ${m.tipo === 'ingreso' ? 'text-[var(--app-green-text)]' : 'text-[var(--app-red-text)]'}`}>
                    {m.tipo === 'ingreso' ? '+' : '−'}{new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(m.monto)} {m.moneda}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Flujo de caja + Gastos que más pesan */}
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
              <MetricCard label="Saldo proyectado ARS" value={props.projectedArsFormatted} tone="neutral" />
              <MetricCard label="Saldo proyectado USD" value={props.projectedUsdFormatted} tone="neutral" />
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
