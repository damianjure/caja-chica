
import { useMemo, useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Wallet, Building2, LineChart } from 'lucide-react';
import { ChartCard, HorizontalBarList, AreaTrendChart } from '../Charts';
import { EmptyState, MetricCard, SectionCard } from '../primitives';
import type { ForecastResult } from '../../../dashboard/forecast';
import { buildMonthlyChartData } from '../../../dashboard/summary';
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

  const companyNames = useMemo(() => props.companiesList.filter((c) => c !== 'all'), [props.companiesList]);
  const pulseData = useMemo(() => {
    const visible = companyNames.filter((c) => !hiddenCompanies.has(c));
    return buildMonthlyChartData(props.history, pulseCurrency, hiddenCompanies.size ? visible : null);
  }, [props.history, pulseCurrency, hiddenCompanies, companyNames]);
  const richData = pulseData.length >= 4;

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
        <MetricCard label="Utilidad ARS" value={props.arsNeto} tone={props.netPositive ? 'success' : 'danger'} icon={Wallet} />
        <MetricCard label="Caja USD" value={props.usdNeto} tone="neutral" icon={Wallet} />
        <MetricCard label="Empresas activas" value={String(props.companyCount)} tone="neutral" icon={Building2} />
      </div>

      {/* Layout adaptativo: con pocos datos el Pulso es compacto y comparte fila; al crecer (>=4 meses) ocupa toda la fila. */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={richData ? 'lg:col-span-2' : ''}>
          <ChartCard
            title="Pulso mensual"
            description="Cuánto entró, cuánto salió y qué saldo quedó, mes a mes. Filtrá por empresa y cambiá entre pesos y dólares."
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
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por empresa">
                  <button
                    type="button"
                    onClick={() => setHiddenCompanies(new Set())}
                    aria-pressed={hiddenCompanies.size === 0}
                    className={`rounded-full border px-3 py-1 text-xs transition ${hiddenCompanies.size === 0 ? 'border-[var(--app-border-strong)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]' : 'border-[var(--app-border)] text-[var(--app-text-3)] hover:text-[var(--app-text-1)]'}`}
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
                        className={`rounded-full border px-3 py-1 text-xs transition ${on ? 'border-[var(--app-border-strong)] text-[var(--app-text-2)]' : 'border-[var(--app-border)] text-[var(--app-text-3)] line-through opacity-50'}`}
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
        </div>

        <ChartCard title="Gastos que más pesan" description="Top categorías por gasto real. Más útil que un pie chart porque deja comparar magnitudes.">
          <HorizontalBarList items={props.topExpenseCategories.map((item) => ({ ...item, accent: 'danger' as const }))} emptyLabel="Todavía no hay gastos cargados." />
        </ChartCard>
        <ChartCard title="Empresas / frentes más fuertes" description="Las unidades con más tracción visible en ARS, ordenadas para priorizar rápido.">
          <HorizontalBarList items={props.topCompanies} emptyLabel="Todavía no hay empresas con actividad." />
        </ChartCard>
      </section>

      {props.incomeTags.length > 0 && (
        <ChartCard title="Etiquetas de ingreso" description="Qué tipo de ingreso entra más seguido, sin leer uno por uno.">
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
        description="Saldo estimado al procesar los recurrentes activos en los próximos 30 días. No incluye gastos imprevistos."
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

            {props.insights.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)] mb-2">
                  Tendencias del período
                </div>
                <ul className="space-y-1.5" role="list">
                  {props.insights.map((text, i) => (
                    <li key={i} role="listitem" className="text-sm text-[var(--app-text-2)] leading-relaxed">
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {!props.canWriteData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Estás en modo <strong>viewer</strong>. Podés ver todo, pero no cargar ni editar datos.
        </div>
      )}
    </div>
  );
}
