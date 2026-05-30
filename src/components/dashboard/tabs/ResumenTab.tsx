
import { BarChart2, TrendingUp, TrendingDown, Wallet, Building2, LineChart } from 'lucide-react';
import { ChartCard, HorizontalBarList, TrendBars } from '../Charts';
import { EmptyState, MetricCard, SectionCard } from '../primitives';
import type { ForecastResult } from '../../../dashboard/forecast';

interface ResumenTabProps {
  arsIngreso: string;
  arsEgreso: string;
  arsNeto: string;
  usdNeto: string;
  companyCount: number;
  monthlyChartDataArs: Array<{ label: string; income: number; expense: number; net: number }>;
  monthlyChartDataUsd: Array<{ label: string; income: number; expense: number; net: number }>;
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
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard label="Ingresos ARS" value={props.arsIngreso} tone="success" icon={TrendingUp} />
        <MetricCard label="Gastos ARS" value={props.arsEgreso} tone="danger" icon={TrendingDown} />
        <MetricCard label="Utilidad ARS" value={props.arsNeto} tone={props.netPositive ? 'success' : 'danger'} icon={Wallet} />
        <MetricCard label="Caja USD" value={props.usdNeto} tone="neutral" icon={Wallet} />
        <MetricCard label="Empresas activas" value={String(props.companyCount)} tone="neutral" icon={Building2} />
      </div>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Pulso mensual ARS"
          description="La evolución compara mes contra mes cuánto entró, cuánto salió y qué saldo te quedó en pesos."
          footer={
            <div className="flex flex-wrap gap-3 text-xs text-[var(--app-text-3)]">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--chart-income)' }} />Ingresos</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--chart-expense)' }} />Gastos</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--chart-net)' }} />Saldo</span>
            </div>
          }
        >
          {props.monthlyChartDataArs.length === 0 ? (
            <EmptyState
              title="Aún no hay historia en pesos."
              hint="Necesitamos al menos un par de movimientos para mostrarte el ritmo del mes."
              canWrite={props.canWriteData}
              cta="Cargá tu primer movimiento desde el campo de arriba."
              icon={<BarChart2 className="w-8 h-8" strokeWidth={1.5} />}
            />
          ) : (
            <TrendBars data={props.monthlyChartDataArs} currency="ARS" />
          )}
        </ChartCard>

        <ChartCard
          title="Pulso mensual USD"
          description="La misma lectura, pero separada en dólares para no mezclar monedas ni distorsionar la tendencia."
        >
          {props.monthlyChartDataUsd.length === 0 ? (
            <p className="text-sm text-[var(--app-text-3)]">Todavía no hay historia suficiente para ver evolución en dólares.</p>
          ) : (
            <TrendBars data={props.monthlyChartDataUsd} currency="USD" />
          )}
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                  <div className="text-sm font-semibold text-green-600 tabular-nums" aria-label={`Ingreso ${tag.value}`}><span aria-hidden="true">↑ </span>{tag.value}</div>
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
                      className={`text-sm font-semibold tabular-nums shrink-0 ${occ.signedAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}
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
