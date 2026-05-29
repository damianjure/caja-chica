
import { BarChart2, TrendingUp, TrendingDown, Wallet, Building2 } from 'lucide-react';
import { ChartCard, HorizontalBarList, TrendBars } from '../Charts';
import { EmptyState, MetricCard } from '../primitives';

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
  topExpenseLabel: string;
  topExpenseValue: string;
  netPositive: boolean;
  canWriteData: boolean;
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

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-6">
          <ChartCard
            title="Pulso mensual ARS"
            description="La evolución compara mes contra mes cuánto entró, cuánto salió y qué saldo te quedó en pesos."
            footer={
              <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
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
              <p className="text-sm text-neutral-500">Todavía no hay historia suficiente para ver evolución en dólares.</p>
            ) : (
              <TrendBars data={props.monthlyChartDataUsd} currency="USD" />
            )}
          </ChartCard>
        </div>

        <ChartCard title="Lo que necesita atención" description="Una lectura rápida para que entiendas dónde actuar sin escanear todo el dashboard.">
          <div className="space-y-3">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Resultado del período</div>
              <div className={`mt-2 text-2xl font-bold ${props.netPositive ? 'text-green-600' : 'text-red-600'}`}>{props.arsNeto}</div>
              <p className="mt-1 text-sm text-neutral-500">{props.netPositive ? 'El período viene sano en ARS.' : 'Los gastos están superando a los ingresos en ARS.'}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Cobertura operativa</div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">{props.companyCount}</div>
              <p className="mt-1 text-sm text-neutral-500">empresas o frentes con actividad visible en el dashboard.</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Top gasto</div>
              <div className="mt-2 text-lg font-semibold text-neutral-900">{props.topExpenseLabel}</div>
              <p className="mt-1 text-sm text-neutral-500">{props.topExpenseValue}</p>
            </div>
          </div>
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

      {!props.canWriteData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Estás en modo <strong>viewer</strong>. Podés ver todo, pero no cargar ni editar datos.
        </div>
      )}
    </div>
  );
}
