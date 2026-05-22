import { MetricCard, PlaceholderPanel, SectionCard } from '../primitives';
import { HorizontalBarList } from '../Charts';

export default function IngresosTab({
  arsIngreso,
  usdIngreso,
  sourceCount,
  topIncomeSources,
  incomeTags,
  recentIncomes,
  formatCurrency,
}: {
  arsIngreso: string;
  usdIngreso: string;
  sourceCount: number;
  topIncomeSources: Array<{ label: string; value: number; valueLabel?: string; secondary?: string; supportingValue?: string; segments?: Array<{ value: number; colorClass: string; label: string; currency?: 'ARS' | 'USD' }> }>;
  incomeTags: Array<{ label: string; value: string; secondary?: string }>;
  recentIncomes: Array<{ id: string; created_at: string; empresa_nombre: string; categoria: string; descripcion: string; monto: number; moneda: 'ARS' | 'USD' }>;
  formatCurrency: (amount: number, currency: 'ARS' | 'USD') => string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Ingresos ARS" value={arsIngreso} tone="success" />
        <MetricCard label="Ingresos USD" value={usdIngreso} tone="success" />
        <MetricCard label="Fuentes detectadas" value={String(sourceCount)} />
      </div>

      <SectionCard title="Ingresos por empresa / origen" description="Acá ves de dónde viene la plata: empresa, frente comercial o descripción visible del cobro.">
        {topIncomeSources.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay ingresos cargados.</p>
        ) : (
          <HorizontalBarList items={topIncomeSources} emptyLabel="Todavía no hay ingresos cargados." />
        )}
      </SectionCard>

      <SectionCard title="Etiquetas de ingresos" description="10 etiquetas frecuentes para entender más rápido qué tipo de ingreso entra sin leer uno por uno.">
        {incomeTags.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay ingresos suficientes para proponer etiquetas.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {incomeTags.map((tag) => (
              <div key={tag.label} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-neutral-900">{tag.label}</div>
                  <div className="text-sm font-semibold text-green-600">{tag.value}</div>
                </div>
                {tag.secondary ? <div className="mt-1 text-xs text-neutral-500">{tag.secondary}</div> : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Últimos 5 ingresos" description="Los cobros más recientes para detectar rápido origen, categoría y moneda sin abrir el historial completo.">
        {recentIncomes.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay ingresos para mostrar.</p>
        ) : (
          <div className="space-y-3">
            {recentIncomes.map((income) => (
              <div key={income.id} className="rounded-xl border border-neutral-200 px-4 py-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-900">{income.descripcion}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {income.empresa_nombre} · {income.categoria}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{new Date(income.created_at).toLocaleString('es-AR')}</div>
                  </div>
                  <div className="text-sm font-semibold text-green-600">{formatCurrency(income.monto, income.moneda)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <PlaceholderPanel title="Cliente, producto y canal" body="Hoy resolvemos origen y etiquetas sobre empresa, categoría y descripción. Si querés cortes comerciales más finos, el paso serio es modelar cliente, producto y canal como dimensiones reales." />
    </div>
  );
}
