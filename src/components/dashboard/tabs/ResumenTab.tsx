import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { CollaborationPanel } from '../../CollaborationPanel';
import { AppViewer, DashboardMembersResponse } from '../../../services/api';
import { ChartCard, HorizontalBarList, TrendBars } from '../Charts';
import { MetricCard, SectionCard } from '../primitives';

interface ResumenTabProps {
  arsIngreso: string;
  arsEgreso: string;
  arsNeto: string;
  usdNeto: string;
  companyCount: number;
  totalAlerts: string[];
  monthlyChartDataArs: Array<{ label: string; income: number; expense: number; net: number }>;
  monthlyChartDataUsd: Array<{ label: string; income: number; expense: number; net: number }>;
  topExpenseCategories: Array<{ label: string; value: number; secondary?: string }>;
  topCompanies: Array<{ label: string; value: number; valueLabel?: string; secondary?: string; supportingValue?: string; segments?: Array<{ value: number; colorClass: string; label: string; currency?: 'ARS' | 'USD' }> }>;
  topExpenseLabel: string;
  topExpenseValue: string;
  netPositive: boolean;
  canWriteData: boolean;
  composer: ReactNode;
  viewer: AppViewer;
  dashboardAccess: DashboardMembersResponse | null;
  isLoadingCollaboration: boolean;
  loadCollaboration: () => Promise<void>;
  adminPanels: ReactNode;
}

export default function ResumenTab(props: ResumenTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard label="Ingresos ARS" value={props.arsIngreso} tone="success" />
        <MetricCard label="Gastos ARS" value={props.arsEgreso} tone="danger" />
        <MetricCard label="Utilidad ARS" value={props.arsNeto} tone={props.netPositive ? 'success' : 'danger'} />
        <MetricCard label="Caja USD" value={props.usdNeto} tone="neutral" />
        <MetricCard label="Empresas activas" value={String(props.companyCount)} tone="neutral" />
      </div>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-6">
          <ChartCard
            title="Pulso mensual ARS"
            description="La evolución compara mes contra mes cuánto entró, cuánto salió y qué saldo te quedó en pesos."
            footer={
              <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />Ingresos</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Gastos</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-900" />Saldo</span>
              </div>
            }
          >
            {props.monthlyChartDataArs.length === 0 ? (
              <p className="text-sm text-neutral-500">Todavía no hay historia suficiente para ver evolución en pesos.</p>
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
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Resultado del período</div>
              <div className={`mt-2 text-2xl font-bold ${props.netPositive ? 'text-green-600' : 'text-red-600'}`}>{props.arsNeto}</div>
              <p className="mt-1 text-sm text-neutral-500">{props.netPositive ? 'El período viene sano en ARS.' : 'Los egresos están superando a los ingresos en ARS.'}</p>
            </div>
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Cobertura operativa</div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">{props.companyCount}</div>
              <p className="mt-1 text-sm text-neutral-500">empresas o frentes con actividad visible en el dashboard.</p>
            </div>
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Top gasto</div>
              <div className="mt-2 text-lg font-semibold text-neutral-900">{props.topExpenseLabel}</div>
              <p className="mt-1 text-sm text-neutral-500">{props.topExpenseValue}</p>
            </div>
          </div>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="Gastos que más pesan" description="Top categorías por egreso real. Más útil que un pie chart porque deja comparar magnitudes.">
          <HorizontalBarList items={props.topExpenseCategories.map((item) => ({ ...item, accent: 'danger' as const }))} emptyLabel="Todavía no hay gastos cargados." />
        </ChartCard>
        <ChartCard title="Empresas / frentes más fuertes" description="Las unidades con más tracción visible en ARS, ordenadas para priorizar rápido.">
          <HorizontalBarList items={props.topCompanies} emptyLabel="Todavía no hay empresas con actividad." />
        </ChartCard>
      </section>

      <SectionCard title="Alertas operativas" description="Te marca rápido si la foto del período tiene algo raro.">
        {props.totalAlerts.length > 0 ? (
          <div className="space-y-3">
            {props.totalAlerts.map((alert) => (
              <div key={alert} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <TriangleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{alert}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Sin alertas fuertes por ahora. Bien.</p>
        )}
      </SectionCard>

      {!props.canWriteData && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Estás en modo <strong>viewer</strong>. Podés ver todo, pero no cargar ni editar datos.
        </div>
      )}

      {props.canWriteData && props.composer}

      <CollaborationPanel
        viewer={props.viewer}
        data={props.dashboardAccess}
        loading={props.isLoadingCollaboration}
        onRefresh={props.loadCollaboration}
      />

      {props.adminPanels}
    </div>
  );
}
