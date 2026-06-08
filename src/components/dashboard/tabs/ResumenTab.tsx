
import { useMemo, useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Wallet, Building2, LineChart } from 'lucide-react';
import { ChartCard, HorizontalBarList, AreaTrendChart, WaterfallChart } from '../Charts';
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
}

export default function ResumenTab(props: ResumenTabProps) {
  const [pulseCurrency, setPulseCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [pulseSeries, setPulseSeries] = useState({ income: true, expense: true, net: true });
  const [hiddenCompanies, setHiddenCompanies] = useState<Set<string>>(new Set());

  const companyNames = useMemo(
    () => props.companiesList.filter((c) => c !== 'all').slice().sort((a, b) => a.localeCompare(b, 'es')),
    [props.companiesList],
  );
  const pulseData = useMemo(() => {
    const visible = companyNames.filter((c) => !hiddenCompanies.has(c));
    return buildMonthlyChartData(props.history, pulseCurrency, hiddenCompanies.size ? visible : null);
  }, [props.history, pulseCurrency, hiddenCompanies, companyNames]);
  const visibleCompanies = useMemo(() => companyNames.filter((c) => !hiddenCompanies.has(c)), [companyNames, hiddenCompanies]);
  const bridgeData = useMemo(
    () => buildCashflowBridge(props.history, pulseCurrency, hiddenCompanies.size ? visibleCompanies : null),
    [props.history, pulseCurrency, hiddenCompanies, visibleCompanies],
  );
  const comparison = useMemo(
    () => buildMonthlyComparison(getMonthlySummaries(props.history), pulseCurrency),
    [props.history, pulseCurrency],
  );

  const toggleCompany = (name: string) =>
    setHiddenCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (companyNames.filter((c) => !next.has(c)).length <= 1) return prev; // no apagar la última
        next.add(name);
      }
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard label="Ingresos ARS" value={props.arsIngreso} tone="success" icon={TrendingUp} />
        <MetricCard label="Gastos ARS" value={props.arsEgreso} tone="danger" icon={TrendingDown} />
        <MetricCard label="Utilidad ARS" value={props.arsNeto} tone={props.netPositive ? 'success' : 'danger'} icon={Wallet} critical={!props.netPositive} sub={props.netPositive ? undefined : 'requiere revisión'} />
        <MetricCard label="Caja USD" value={props.usdNeto} tone="neutral" icon={Wallet} />
        <MetricCard label="Empresas activas" value={String(props.companyCount)} tone="neutral" icon={Building2} />
      </div>

      {!props.netPositive && (
        <div role="status" className="rounded-xl border border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] px-4 py-3 text-sm text-[var(--app-amber-text)]">
          <strong>⚠️ Atención — utilidad negativa.</strong> Mejorá ingresos o reducí gastos para recuperar.{props.topExpenseCategories[0] ? ` "${props.topExpenseCategories[0].label}" es el gasto que más pesa.` : ''}
        </div>
      )}

      {(props.insights.length > 0 || comparison.hasPrev) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {props.insights.length > 0 && (
            <ChartCard title="Insight del período" description="Lo que cambió, en una mirada.">
              <ul className="space-y-1.5" role="list">
                {props.insights.map((t, i) => (
                  <li key={i} role="listitem" className="text-sm text-[var(--app-text-2)] leading-relaxed">{t}</li>
                ))}
              </ul>
            </ChartCard>
          )}
          {comparison.hasPrev && (
            <ChartCard title="Comparativa vs mes anterior" description={`Ingresos, gastos y utilidad en ${pulseCurrency} contra el mes pasado.`}>
              <div className="space-y-2.5">
                {([
                  ['Ingresos', comparison.ingresos, true] as const,
                  ['Gastos', comparison.gastos, false] as const,
                  ['Utilidad', comparison.utilidad, true] as const,
                ]).map(([label, row, upIsGood]) => {
                  const formatted = `${pulseCurrency} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(row.current)}`;
                  const up = (row.deltaPct ?? 0) >= 0;
                  const good = up === upIsGood;
                  return (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] pb-2 last:border-0 last:pb-0">
                      <span className="text-sm text-[var(--app-text-2)]">{label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums text-[var(--app-text-1)]">{formatted}</span>
                        {row.isNew ? (
                          <span className="text-xs font-medium tabular-nums w-16 text-right text-[var(--chart-income)]">nuevo</span>
                        ) : row.deltaPct === null ? (
                          <span className="text-xs text-[var(--app-text-3)] tabular-nums w-16 text-right">—</span>
                        ) : (
                          <span
                            className={`text-xs font-bold tabular-nums w-16 text-right ${good ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}
                            aria-label={`${up ? 'subió' : 'bajó'} ${Math.abs(row.deltaPct)} por ciento`}
                          >
                            <span aria-hidden="true">{up ? '▲' : '▼'} </span>{Math.abs(row.deltaPct)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* Pulso: hero, ancho completo */}
      <ChartCard
            title="Pulso mensual"
            description="Cuánto entró, salió y quedó, mes a mes."
            footer={
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar u ocultar series del gráfico">
                {([
                  ['income', 'Ingresos', '--chart-income'],
                  ['expense', 'Gastos', '--chart-expense'],
                  ['net', 'Saldo', '--chart-net'],
                ] as const).map(([key, label, color]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPulseSeries((s) => {
                      const next = { ...s, [key]: !s[key] };
                      if (!next.income && !next.expense && !next.net) return s; // no apagar la última serie
                      return next;
                    })}
                    aria-pressed={pulseSeries[key]}
                    aria-label={`${pulseSeries[key] ? 'Ocultar' : 'Mostrar'} ${label}`}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${pulseSeries[key] ? 'border-[var(--app-border-strong)] text-[var(--app-text-2)]' : 'border-[var(--app-border)] text-[var(--app-text-3)] line-through opacity-50'}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `var(${color})` }} />
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {companyNames.length > 1 ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por empresa">
                  <button
                    type="button"
                    onClick={() => setHiddenCompanies(new Set())}
                    aria-pressed={hiddenCompanies.size === 0}
                    className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition ${hiddenCompanies.size === 0 ? 'border-[var(--app-border-strong)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] font-semibold' : 'border-[var(--app-border)] text-[var(--app-text-3)] hover:text-[var(--app-text-1)]'}`}
                  >
                    Todas
                  </button>
                  {companyNames.map((name) => {
                    const on = !hiddenCompanies.has(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleCompany(name)}
                        aria-pressed={on}
                        aria-label={`${on ? 'Ocultar' : 'Mostrar'} ${name}`}
                        className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition ${on ? 'border-[var(--app-strong-surface)] bg-[color-mix(in_srgb,var(--app-strong-surface)_16%,transparent)] text-[var(--app-text-1)] font-medium' : 'border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text-3)] opacity-45 hover:opacity-75'}`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              ) : <span />}
              <div className="inline-flex shrink-0 self-end rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-2)] p-0.5 sm:self-auto" role="group" aria-label="Moneda del gráfico">
                {(['ARS', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPulseCurrency(c)}
                    aria-pressed={pulseCurrency === c}
                    className={`rounded-md px-3 py-1 text-xs font-bold tabular-nums transition ${pulseCurrency === c ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]' : 'text-[var(--app-text-3)] hover:text-[var(--app-text-1)]'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {pulseData.length === 0 ? (
              <EmptyState
                title={pulseCurrency === 'ARS' ? 'Aún no hay historia en pesos.' : 'Aún no hay historia en dólares.'}
                hint="Necesitamos al menos un par de movimientos para mostrarte el ritmo del mes."
                canWrite={props.canWriteData}
                cta={pulseCurrency === 'ARS' ? 'Cargá tu primer movimiento desde el campo de arriba.' : undefined}
                icon={<BarChart2 className="w-8 h-8" strokeWidth={1.5} />}
              />
            ) : (
              <AreaTrendChart data={pulseData} currency={pulseCurrency} show={pulseSeries} />
            )}
      </ChartCard>

      {/* Flujo + Gastos: 2-col compacto y balanceado */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Flujo de caja"
          description="Cómo cada categoría reduce la caja, del ingreso al saldo."
        >
          {bridgeData.length === 0 ? (
            <EmptyState
              title="Sin datos para el puente de caja."
              hint="Cargá ingresos y gastos para ver cómo se forma el saldo."
              canWrite={props.canWriteData}
              icon={<BarChart2 className="w-8 h-8" strokeWidth={1.5} />}
            />
          ) : (
            <WaterfallChart segments={bridgeData} currency={pulseCurrency} />
          )}
        </ChartCard>
        <ChartCard title="Gastos que más pesan" description="Top categorías por gasto.">
          <HorizontalBarList items={props.topExpenseCategories.map((item) => ({ ...item, accent: 'danger' as const }))} emptyLabel="Todavía no hay gastos cargados." />
        </ChartCard>
      </section>

      {props.incomeTags.length > 0 && (
        <ChartCard title="Etiquetas de ingreso" description="Qué tipo de ingreso entra más seguido.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.incomeTags.map((tag) => (
              <div key={tag.label} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[var(--app-text-1)]">{tag.label}</div>
                  <div className="text-sm font-semibold text-[var(--chart-income)] tabular-nums" aria-label={`Ingreso ${tag.value}`}><span aria-hidden="true">↑ </span>{tag.value}</div>
                </div>
                {tag.secondary ? <div className="mt-1 text-xs text-[var(--app-text-3)]">{tag.secondary}</div> : null}
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      <SectionCard
        title="Proyección a 30 días"
        description="Saldo estimado con los recurrentes activos (no incluye imprevistos)."
        icon={LineChart}
      >
        {props.forecast.occurrences.length === 0 ? (
          <EmptyState
            title="Sin recurrentes activos para proyectar."
            hint="Activá o creá recurrentes en la pestaña Recurrentes para ver la proyección."
            canWrite={props.canWriteData}
            icon={<LineChart className="w-8 h-8" strokeWidth={1.5} />}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricCard
                label="Saldo proyectado ARS"
                value={props.projectedArsFormatted}
                tone="neutral"
                icon={Wallet}
              />
              <MetricCard
                label="Saldo proyectado USD"
                value={props.projectedUsdFormatted}
                tone="neutral"
                icon={Wallet}
              />
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)] mb-2">
                Próximos movimientos
              </div>
              <ul className="space-y-1" role="list">
                {props.forecast.occurrences.slice(0, 8).map((occ, i) => (
                  <li
                    key={`${occ.date}-${i}`}
                    role="listitem"
                    className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--app-border)] last:border-0"
                  >
                    <span className="text-xs text-[var(--app-text-3)] tabular-nums w-16 shrink-0">{occ.date.slice(5)}</span>
                    <span className="text-sm text-[var(--app-text-2)] flex-1 truncate">{occ.descripcion || '—'}</span>
                    <span
                      className={`text-sm font-semibold tabular-nums shrink-0 ${occ.signedAmount >= 0 ? 'text-[var(--chart-income)]' : 'text-[var(--chart-expense)]'}`}
                      aria-label={`${occ.signedAmount >= 0 ? 'Ingreso' : 'Gasto'} ${Math.abs(occ.signedAmount)} ${occ.moneda}`}
                    >
                      {occ.signedAmount >= 0 ? '+' : '−'}{new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.abs(occ.signedAmount))} {occ.moneda}
                    </span>
                  </li>
                ))}
              </ul>
              {props.forecast.occurrences.length > 8 && (
                <p className="text-xs text-[var(--app-text-3)] mt-2">
                  y {props.forecast.occurrences.length - 8} movimiento{props.forecast.occurrences.length - 8 === 1 ? '' : 's'} más en los próximos 30 días.
                </p>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {!props.canWriteData && (
        <div className="rounded-xl border border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] px-4 py-3 text-sm text-[var(--app-amber-text)]">
          Estás en modo <strong>viewer</strong>. Podés ver todo, pero no cargar ni editar datos.
        </div>
      )}
    </div>
  );
}
