import type { Categoria, Presupuesto } from '../../../services/api';
import { BudgetComparisonList, HorizontalBarList, TrendBars } from '../Charts';
import { MetricCard, SectionCard } from '../primitives';
import { SectionLoadingState } from '../LoadingStates';

interface CategorySummaryView {
  name: string;
  egresoArs: number;
  egresoUsd: number;
  movimientos: number;
}

export interface BudgetFormState {
  period: string;
  categoria: string;
  moneda: 'ARS' | 'USD';
  monto: string;
}

export default function GastosTab({
  arsEgreso,
  usdEgreso,
  categoryCount,
  budgetForm,
  setBudgetForm,
  budgetPeriod,
  setBudgetPeriod,
  initialBudgetPeriod,
  categories,
  canWriteData,
  onSaveBudget,
  isLoadingBudget,
  budgetVsActual,
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
  budgetForm: BudgetFormState;
  setBudgetForm: (updater: (prev: BudgetFormState) => BudgetFormState) => void;
  budgetPeriod: string;
  setBudgetPeriod: (value: string) => void;
  initialBudgetPeriod: string;
  categories: Categoria[];
  canWriteData: boolean;
  onSaveBudget: () => Promise<void>;
  isLoadingBudget: boolean;
  budgetVsActual: Array<Presupuesto & { actual: number; variance: number }>;
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

      {false /* presupuesto UI hidden — data/API preserved */ && <SectionCard title="Presupuesto vs real" description="Presupuestos reales por categoría para el período elegido.">
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_120px_120px_auto] gap-3">
          <input
            type="month"
            value={budgetForm.period}
            onChange={(event) => {
              const normalized = event.target.value || initialBudgetPeriod;
              setBudgetForm((prev) => ({ ...prev, period: normalized }));
              setBudgetPeriod(normalized);
            }}
            className="rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <input
            list="budget-categories"
            value={budgetForm.categoria}
            onChange={(event) => setBudgetForm((prev) => ({ ...prev, categoria: event.target.value }))}
            placeholder="Categoría"
            className="rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <datalist id="budget-categories">
            {categories.map((category) => (
              <option key={category.id} value={category.nombre} />
            ))}
          </datalist>
          <select
            value={budgetForm.moneda}
            onChange={(event) => setBudgetForm((prev) => ({ ...prev, moneda: event.target.value as 'ARS' | 'USD' }))}
            className="rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetForm.monto}
            onChange={(event) => setBudgetForm((prev) => ({ ...prev, monto: event.target.value }))}
            placeholder="Monto"
            className="rounded-xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
          />
          {canWriteData && (
            <button onClick={() => void onSaveBudget()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-900 px-5 py-3 text-white font-medium hover:border-[var(--app-text-2)]">
              Guardar presupuesto
            </button>
          )}
        </div>

        {isLoadingBudget ? (
          <SectionLoadingState message={`Cargando presupuestos de ${budgetPeriod}...`} />
        ) : budgetVsActual.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay presupuestos cargados para {budgetPeriod}. Empezá agregando uno arriba.</p>
        ) : (
          <BudgetComparisonList
            items={budgetVsActual.map((row) => ({
              label: `${row.categoria} · ${row.period}`,
              budget: row.monto,
              actual: row.actual,
              variance: row.variance,
            }))}
          />
        )}
      </SectionCard>}

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
          <p className="text-sm text-neutral-500">Todavía no hay gastos para analizar.</p>
        ) : (
          <div className="space-y-3">
            {categorySummaries.slice(0, 10).map((category) => (
              <div key={category.name} className="rounded-xl border border-neutral-200 px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-neutral-900">{category.name}</div>
                  <div className="text-xs text-neutral-500">{category.movimientos} movimientos</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600">{formatCurrency(category.egresoArs, 'ARS')}</div>
                  <div className="text-xs text-neutral-500">{formatCurrency(category.egresoUsd, 'USD')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Gastos por empresa"
        description="Separá rápido qué empresa está traccionando más egreso en ARS dentro del período visible."
      >
        <HorizontalBarList items={expenseCompanies.map((item) => ({ ...item, accent: 'danger' as const }))} emptyLabel="Todavía no hay empresas con egresos." />
      </SectionCard>

      <SectionCard
        title="Últimos 5 gastos"
        description={selectedExpenseCompany === 'all' ? 'Los últimos egresos del dashboard completo.' : `Los últimos egresos de ${selectedExpenseCompany}.`}
      >
        {recentExpenses.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay gastos para mostrar.</p>
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
                  <div className="text-sm font-semibold text-red-600">{formatCurrency(expense.monto, expense.moneda)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Evolución mensual" description="La evolución te muestra si el ritmo del gasto acompaña o se come al ingreso en cada mes.">
        {monthlyChartData.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin movimientos suficientes para construir evolución mensual.</p>
        ) : (
          <TrendBars data={monthlyChartData} currency="ARS" />
        )}
      </SectionCard>
    </div>
  );
}
