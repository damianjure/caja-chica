import { HorizontalBarList, TrendBars } from '../Charts';
import { EmptyState, MetricCard, SectionCard } from '../primitives';

interface CategorySummaryView {
  name: string;
  egresoArs: number;
  egresoUsd: number;
  movimientos: number;
}

export default function GastosTab({
  arsEgreso,
  usdEgreso,
  categoryCount,
  canWriteData,
  categorySummaries,
  monthlyChartData,
  expenseCompanyOptions,
  selectedExpenseCompany,
  setSelectedExpenseCompany,
  expenseCompanies,
  recentExpenses,
  formatCurrency,
}: {
  arsEgreso: string;
  usdEgreso: string;
  categoryCount: number;
  canWriteData: boolean;
  categorySummaries: CategorySummaryView[];
  monthlyChartData: Array<{ label: string; income: number; expense: number; net: number }>;
  expenseCompanyOptions: string[];
  selectedExpenseCompany: string;
  setSelectedExpenseCompany: (value: string) => void;
  expenseCompanies: Array<{ label: string; value: number; secondary?: string }>;
  recentExpenses: Array<{ id: string; created_at: string; empresa_nombre: string; categoria: string; descripcion: string; monto: number; moneda: 'ARS' | 'USD' }>;
  formatCurrency: (amount: number, currency: 'ARS' | 'USD') => string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Gasto total ARS" value={arsEgreso} tone="danger" />
        <MetricCard label="Gasto total USD" value={usdEgreso} tone="danger" />
        <MetricCard label="Categorías activas" value={String(categoryCount)} />
      </div>

      <SectionCard title="Categorías de gasto" description="Top de categorías reales sobre los movimientos cargados.">
        <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {expenseCompanyOptions.map((company) => (
            <button
              key={company}
              onClick={() => setSelectedExpenseCompany(company)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedExpenseCompany === company
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400'
              }`}
            >
              {company === 'all' ? 'Todas las empresas' : company}
            </button>
          ))}
        </div>
        {categorySummaries.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center">
            <p className="font-semibold text-neutral-700 mb-1">Sin categorías todavía</p>
            <p className="text-sm text-neutral-500">Las categorías aparecen cuando cargás gastos con etiqueta.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categorySummaries.slice(0, 10).map((category) => (
              <div key={category.name} className="rounded-xl border border-neutral-200 px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-neutral-900">{category.name}</div>
                  <div className="text-xs text-neutral-500">{category.movimientos} movimientos</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600 tabular-nums" aria-label={`Gasto ${formatCurrency(category.egresoArs, 'ARS')}`}><span aria-hidden="true">↓ </span>{formatCurrency(category.egresoArs, 'ARS')}</div>
                  <div className="text-xs text-neutral-500 tabular-nums">{formatCurrency(category.egresoUsd, 'USD')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Gastos por empresa"
        description="Separá rápido qué empresa está traccionando más gasto en ARS dentro del período visible."
      >
        <HorizontalBarList items={expenseCompanies.map((item) => ({ ...item, accent: 'danger' as const }))} emptyLabel="Todavía no hay empresas con egresos." />
      </SectionCard>

      <SectionCard
        title="Últimos 5 gastos"
        description={selectedExpenseCompany === 'all' ? 'Los últimos egresos del dashboard completo.' : `Los últimos egresos de ${selectedExpenseCompany}.`}
      >
        {recentExpenses.length === 0 ? (
          <EmptyState
            title="Sin gastos cargados todavía."
            hint='Probá con "pagué 4500 de luz" en el campo de arriba — el bot lo entiende.'
            canWrite={canWriteData}
            cta="Cargá un gasto desde el composer."
          />
        ) : (
          <div className="space-y-3">
            {recentExpenses.map((expense) => (
              <div key={expense.id} className="rounded-xl border border-neutral-200 px-4 py-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-900">{expense.descripcion}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {expense.empresa_nombre} · {expense.categoria}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{new Date(expense.created_at).toLocaleString('es-AR')}</div>
                  </div>
                  <div className="text-sm font-semibold text-red-600 tabular-nums" aria-label={`Gasto ${formatCurrency(expense.monto, expense.moneda)}`}><span aria-hidden="true">↓ </span>{formatCurrency(expense.monto, expense.moneda)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Evolución mensual" description="La evolución te muestra si el ritmo del gasto acompaña o se come al ingreso en cada mes.">
        {monthlyChartData.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center">
            <p className="font-semibold text-neutral-700 mb-1">Sin datos suficientes</p>
            <p className="text-sm text-neutral-500">La evolución mensual aparece cuando tenés movimientos en más de un mes.</p>
          </div>
        ) : (
          <TrendBars data={monthlyChartData} currency="ARS" />
        )}
      </SectionCard>
    </div>
  );
}
