import { useState, useEffect, type FormEvent } from 'react';
import { useBackClose } from '../../../hooks/useBackClose';
import { Pause, Play, Pencil, Trash2, Plus, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Recurrente, type RecurrenteRequest, type Frecuencia, type AppViewer } from '../../../services/api';
import { SectionCard, MetricCard, MetricChip } from '../primitives';
import { ModalShell } from '../../ui/ModalShell';
import { Button } from '../../ui/Button';
import { Input, Select } from '../../ui/Field';
import { Segmented } from '../../ui/Segmented';
import { buildRecurrentesSummary } from '../../../dashboard/recurrentesSummary';
import { ConfirmModal } from '../../ui/ConfirmModal';

const FRECUENCIA_LABELS: Record<Frecuencia, string> = {
  diario: 'Diario',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  anual: 'Anual',
};

const FRECUENCIA_OPTIONS: Frecuencia[] = ['diario', 'semanal', 'quincenal', 'mensual', 'anual'];

const badgePaused =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-[var(--app-surface-2)] text-[var(--app-text-2)] ring-1 ring-neutral-300/60 dark:bg-neutral-700/40 dark:text-neutral-300 dark:ring-neutral-500/40';

function formatMonto(monto: number, moneda: 'ARS' | 'USD'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(monto);
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const s = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  return s.replace('.', '').replace(/\b\w/, (c) => c.toUpperCase());
}

// "14 junio" when the month name is short enough to fit; otherwise "14/6".
function formatImpactDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const month = d.toLocaleDateString('es-AR', { month: 'long' });
  return month.length <= 6 ? `${d.getDate()} ${month}` : `${d.getDate()}/${d.getMonth() + 1}`;
}

function daysUntilLabel(isoDate: string): string {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  const days = Math.max(0, Math.round((target - Date.now()) / 86_400_000));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

interface FormState {
  monto: string;
  tipo: 'egreso' | 'ingreso';
  moneda: 'ARS' | 'USD';
  frecuencia: Frecuencia;
  categoria: string;
  empresa_nombre: string;
  descripcion: string;
  /** Día del mes 1-31. Solo aplica a frecuencia mensual. */
  dayOfMonth: string;
}

const EMPTY_FORM: FormState = {
  monto: '',
  tipo: 'egreso',
  moneda: 'ARS',
  frecuencia: 'mensual',
  categoria: '',
  empresa_nombre: 'Personal',
  descripcion: '',
  dayOfMonth: '1',
};

function recurrenteToForm(r: Recurrente): FormState {
  return {
    monto: String(r.monto),
    tipo: r.tipo,
    moneda: r.moneda,
    frecuencia: r.frecuencia,
    categoria: r.categoria ?? '',
    empresa_nombre: r.empresa_nombre ?? 'Personal',
    descripcion: r.descripcion ?? '',
    dayOfMonth: r.day_of_month ? String(r.day_of_month) : '1',
  };
}

function RecurrenteModal({
  initial,
  onClose,
  onSave,
}: {
  initial: FormState;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const isNew = initial.monto === '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.warning('El monto debe ser mayor a 0.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={isNew ? 'Nuevo recurrente' : 'Editar recurrente'} onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Monto" required inputMode="decimal" wrapClassName="sm:col-span-2" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} placeholder="0,00" />

          <Select label="Tipo" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as 'egreso' | 'ingreso' }))}>
            <option value="egreso">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Select>

          <Select label="Moneda" value={form.moneda} onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </Select>

          <Select label="Frecuencia" wrapClassName={form.frecuencia === 'mensual' ? '' : 'sm:col-span-2'} value={form.frecuencia} onChange={(e) => setForm((f) => ({ ...f, frecuencia: e.target.value as Frecuencia }))}>
            {FRECUENCIA_OPTIONS.map((f) => (
              <option key={f} value={f}>{FRECUENCIA_LABELS[f]}</option>
            ))}
          </Select>

          {form.frecuencia === 'mensual' && (
            <Select label="Día del mes" value={form.dayOfMonth} onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </Select>
          )}

          <Input label="Categoría" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} placeholder="servicios" />

          <Input label="Empresa" value={form.empresa_nombre} onChange={(e) => setForm((f) => ({ ...f, empresa_nombre: e.target.value }))} placeholder="Personal" />

          <Input label="Descripción" wrapClassName="sm:col-span-2" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="alquiler local" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

export default function RecurrentesTab({
  viewer: _viewer,
  canWriteData,
}: {
  viewer: AppViewer;
  canWriteData: boolean;
}) {
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Recurrente | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useBackClose(creating, () => setCreating(false));
  useBackClose(Boolean(editing), () => setEditing(null));
  useBackClose(Boolean(deleteTarget), () => setDeleteTarget(null));

  const load = async () => {
    try {
      const data = await api.listRecurrentes();
      setRecurrentes(data);
    } catch {
      toast.error('No se pudieron cargar los recurrentes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async (form: FormState) => {
    const monto = Number(form.monto);
    const body: RecurrenteRequest = {
      monto,
      tipo: form.tipo,
      moneda: form.moneda,
      frecuencia: form.frecuencia,
      categoria: form.categoria || undefined,
      empresa_nombre: form.empresa_nombre || 'Personal',
      descripcion: form.descripcion || undefined,
      day_of_month: form.frecuencia === 'mensual' ? Number(form.dayOfMonth) : null,
    };
    try {
      const created = await api.createRecurrente(body);
      setRecurrentes((prev) => [...prev, created]);
      setCreating(false);
      toast.success('Recurrente creado.');
    } catch {
      toast.error('No se pudo crear el recurrente.');
      throw new Error('create failed');
    }
  };

  const handleUpdate = async (form: FormState) => {
    if (!editing) return;
    const monto = Number(form.monto);
    const body: Partial<RecurrenteRequest> = {
      monto,
      tipo: form.tipo,
      moneda: form.moneda,
      frecuencia: form.frecuencia,
      categoria: form.categoria || undefined,
      empresa_nombre: form.empresa_nombre || 'Personal',
      descripcion: form.descripcion || undefined,
      day_of_month: form.frecuencia === 'mensual' ? Number(form.dayOfMonth) : null,
    };
    try {
      const updated = await api.updateRecurrente(editing.id, body);
      setRecurrentes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditing(null);
      toast.success('Recurrente actualizado.');
    } catch {
      toast.error('No se pudo actualizar el recurrente.');
      throw new Error('update failed');
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    try {
      const updated = await api.toggleRecurrente(id);
      setRecurrentes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(updated.is_active ? 'Recurrente activado.' : 'Recurrente pausado.');
    } catch {
      toast.error('No se pudo cambiar el estado.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteRecurrente(id);
      setRecurrentes((prev) => prev.filter((r) => r.id !== id));
      toast.success('Recurrente eliminado.');
    } catch {
      toast.error('No se pudo eliminar el recurrente.');
    } finally {
      setDeletingId(null);
    }
  };

  const summary = buildRecurrentesSummary(recurrentes);
  const proximos = [...recurrentes].sort(
    (a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime(),
  );
  const empresaOptions = ['all', ...Array.from(new Set(recurrentes.map((r) => r.empresa_nombre || 'Personal'))).sort()];
  const filtered = proximos.filter((r) =>
    (typeFilter === 'all' || r.tipo === typeFilter) &&
    (empresaFilter === 'all' || (r.empresa_nombre || 'Personal') === empresaFilter),
  );
  const hasRecurrenteFilters = typeFilter !== 'all' || empresaFilter !== 'all';
  const signedMonto = (r: Recurrente) => formatMonto(r.tipo === 'egreso' ? -r.monto : r.monto, r.moneda);
  const formatNextRun = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '');

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-[var(--app-text-3)] text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando recurrentes...
      </div>
    );
  }

  if (recurrentes.length === 0) {
    return (
      <SectionCard title="Recurrentes" description="Gastos e ingresos automáticos">
        <div className="border-2 border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
          <p className="font-semibold text-[var(--app-text-2)] mb-1">Sin recurrentes todavía</p>
          <p className="text-sm text-[var(--app-text-3)] mb-4">Creá tu primer movimiento recurrente para automatizar registros periódicos.</p>
          {canWriteData && (
            <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Nuevo recurrente</Button>
          )}
        </div>
        {creating && (
          <RecurrenteModal initial={EMPTY_FORM} onClose={() => setCreating(false)} onSave={handleCreate} />
        )}
      </SectionCard>
    );
  }

  // Resumen por frecuencia (mensual-equivalent impact per frequency type)
  const freqSummary = FRECUENCIA_OPTIONS.map((freq) => {
    const items = recurrentes.filter((r) => r.frecuencia === freq && r.is_active);
    const multiplier: Record<Frecuencia, number> = {
      diario: 30, semanal: 4.33, quincenal: 2, mensual: 1, anual: 1 / 12,
    };
    const monthlyArs = items.reduce((acc, r) => {
      const sign = r.tipo === 'egreso' ? -1 : 1;
      return r.moneda === 'ARS' ? acc + sign * r.monto * multiplier[freq] : acc;
    }, 0);
    return { freq, count: items.length, monthlyArs };
  }).filter((f) => f.count > 0);

  return (
    <div className="space-y-6">
      {/* Desktop: compact 3-cell KPI row */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-3">
        {[
          { label: 'Impacto mensual', value: formatMonto(summary.impactoMensualArs, 'ARS'), tone: summary.impactoMensualArs < 0 },
          { label: 'Próximo vencimiento', value: summary.proximaFechaIso ? formatImpactDate(summary.proximaFechaIso) : '—', sub: summary.proximaFechaIso ? daysUntilLabel(summary.proximaFechaIso) : undefined, tone: false },
          { label: 'Activos', value: String(summary.activos), tone: false },
        ].map(({ label, value, sub, tone }) => (
          <div key={label} className="rounded-xl border border-[var(--app-border)] px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-3)] mb-1">{label}</div>
            <div className={`text-xl font-bold tabular-nums ${tone ? 'text-[var(--chart-expense)]' : 'text-[var(--app-text-1)]'}`}>{value}</div>
            {sub && <div className="text-xs text-[var(--app-text-3)] mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Mobile: full cards */}
      <div className="space-y-3 lg:hidden">
        <MetricCard hero label="Impacto proyectado · 30 días" value={formatMonto(summary.proyeccion30dArs, 'ARS')} tone={summary.proyeccion30dArs < 0 ? 'danger' : 'success'} critical={summary.proyeccion30dArs < 0} sub="con recurrentes activos" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard label="Impacto mensual" value={formatMonto(summary.impactoMensualArs, 'ARS')} sub="Promedio" tone={summary.impactoMensualArs < 0 ? 'danger' : 'success'} />
          <MetricCard label="Próximo impacto" value={summary.proximaFechaIso ? formatImpactDate(summary.proximaFechaIso) : '—'} sub={summary.proximaFechaIso ? daysUntilLabel(summary.proximaFechaIso) : undefined} tone="warning" />
        </div>
        <div className="flex flex-wrap gap-2">
          <MetricChip label="Activos" value={String(summary.activos)} icon={Repeat} />
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <SectionCard
          title="Próximos recurrentes"
          description="Ordenados por próxima carga."
          action={canWriteData ? (
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Nuevo</Button>
          ) : undefined}
        >
          {/* Filtros — mismo formato que Movimientos */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented
              value={typeFilter}
              options={[{ id: 'all', label: 'Todos' }, { id: 'ingreso', label: 'Ingresos' }, { id: 'egreso', label: 'Gastos' }]}
              onChange={setTypeFilter}
              ariaLabel="Filtrar por tipo"
              tones={{ ingreso: 'income', egreso: 'expense' }}
            />
            <Select label="Filtrar por empresa" hideLabel size="sm" value={empresaFilter} onChange={(e) => setEmpresaFilter(e.target.value)}>
              {empresaOptions.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'Todas las empresas' : c}</option>
              ))}
            </Select>
            {hasRecurrenteFilters && (
              <button
                type="button"
                onClick={() => { setTypeFilter('all'); setEmpresaFilter('all'); }}
                className="text-xs text-[var(--app-text-3)] underline underline-offset-2 hover:text-[var(--app-text-1)]"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Desktop: dense table */}
          <div className="hidden lg:block overflow-hidden rounded-xl border border-[var(--app-border)]">
            {filtered.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-[var(--app-text-3)]">Sin recurrentes para este filtro.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[var(--app-surface-2)] border-b border-[var(--app-border)]">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Descripción</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Frecuencia</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Próxima</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Monto</th>
                    {canWriteData && <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--app-text-2)] uppercase tracking-wider">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {filtered.map((r) => (
                    <tr key={r.id} className={`transition-colors hover:bg-[var(--app-surface-2)] ${r.is_active ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-2.5 min-w-0">
                        <div className="font-medium text-xs text-[var(--app-text-1)] truncate max-w-[160px]">
                          {r.descripcion || r.empresa_nombre || 'Recurrente'}
                        </div>
                        <div className="text-[11px] text-[var(--app-text-3)]">
                          {r.tipo === 'egreso' ? 'Gasto' : 'Ingreso'}
                          {!r.is_active && <span className="ml-1 text-[var(--app-text-3)]">· Pausado</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--app-text-2)] whitespace-nowrap">
                        {FRECUENCIA_LABELS[r.frecuencia]}
                        {r.frecuencia === 'mensual' && r.day_of_month ? ` / día ${r.day_of_month}` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--app-text-2)] whitespace-nowrap">{formatNextRun(r.next_run_at)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-semibold tabular-nums ${r.tipo === 'egreso' ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>
                          {signedMonto(r)}
                        </span>
                      </td>
                      {canWriteData && (
                        <td className="px-2 py-1 text-right">
                          <div className="flex items-center justify-end gap-0">
                            <button onClick={() => handleToggle(r.id)} disabled={togglingId === r.id} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-50" title={r.is_active ? 'Pausar' : 'Activar'} aria-label={r.is_active ? 'Pausar' : 'Activar'}>
                              {togglingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : r.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setEditing(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors" title="Editar" aria-label="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(r.id)} disabled={deletingId === r.id} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--chart-expense)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-50" title="Eliminar" aria-label="Eliminar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile: card list */}
          <div className="lg:hidden overflow-hidden rounded-xl border border-[var(--app-border)] divide-y divide-[var(--app-border)]">
            {filtered.length === 0 && (
              <p className="px-3.5 py-6 text-center text-sm text-[var(--app-text-3)]">Sin recurrentes para este filtro.</p>
            )}
            {filtered.map((r) => (
              <div key={r.id} className={`flex items-start justify-between gap-3 px-3.5 py-3 ${r.is_active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[var(--app-text-1)] truncate">{r.descripcion || r.empresa_nombre || 'Recurrente'}</span>
                    {!r.is_active && <span className={badgePaused}>Pausado</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--app-text-3)]">
                    🏢 {r.empresa_nombre || 'Personal'} · 📁 {r.categoria || 'Otros'}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--app-text-3)]">
                    {FRECUENCIA_LABELS[r.frecuencia]}
                    {r.frecuencia === 'mensual' && r.day_of_month ? ` · día ${r.day_of_month}` : ''}
                    {' · próx. '}{formatNextRun(r.next_run_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${r.tipo === 'egreso' ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>
                    {signedMonto(r)}
                  </span>
                  {canWriteData && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => handleToggle(r.id)} disabled={togglingId === r.id} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-50" title={r.is_active ? 'Pausar' : 'Activar'} aria-label={r.is_active ? 'Pausar recurrente' : 'Activar recurrente'}>
                        {r.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setEditing(r)} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors" title="Editar" aria-label="Editar recurrente">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(r.id)} disabled={deletingId === r.id} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--app-text-3)] hover:text-[var(--chart-expense)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-50" title="Eliminar" aria-label="Eliminar recurrente">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Calendario de impactos" description="Próximos 30 días — qué días vienen pesados.">
          <div className="grid grid-cols-7 gap-1.5">
            {summary.dias.map((d) => {
              const cls = d.level === 'high'
                ? 'bg-[color-mix(in_srgb,var(--chart-expense)_24%,var(--app-surface-2))] text-[var(--chart-expense)] border-[color-mix(in_srgb,var(--chart-expense)_40%,var(--app-border))]'
                : d.level === 'med'
                  ? 'bg-[color-mix(in_srgb,var(--app-amber-text)_20%,var(--app-surface-2))] text-[var(--app-amber-text)] border-[var(--app-border)]'
                  : d.level === 'low'
                    ? 'bg-[color-mix(in_srgb,var(--chart-income)_18%,var(--app-surface-2))] text-[var(--chart-income)] border-[var(--app-border)]'
                    : 'bg-[var(--app-surface-2)] text-[var(--app-text-3)] border-[var(--app-border)]';
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDay((p) => (p === d.date ? null : d.date))}
                  aria-pressed={selectedDay === d.date}
                  title={`${d.date}: ${formatMonto(d.total, 'ARS')}`}
                  className={`grid aspect-square place-items-center rounded-md border text-xs transition ${cls} ${selectedDay === d.date ? 'ring-2 ring-[var(--app-text-1)]' : ''}`}
                >
                  {Number(d.date.slice(8, 10))}
                </button>
              );
            })}
          </div>
          {selectedDay && (() => {
            const day = summary.dias.find((x) => x.date === selectedDay);
            if (!day) return null;
            return (
              <div className="mt-3 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm">
                <span className="text-[var(--app-text-2)]">{formatShortDate(selectedDay)}: </span>
                <span className={`font-semibold tabular-nums ${day.total < 0 ? 'text-[var(--chart-expense)]' : day.total > 0 ? 'text-[var(--chart-income)]' : 'text-[var(--app-text-3)]'}`}>
                  {day.total === 0 ? 'sin impacto' : formatMonto(day.total, 'ARS')}
                </span>
              </div>
            );
          })()}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-text-3)]">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--app-surface-2)] border border-[var(--app-border)]" />Sin impacto</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-income)]" />Bajo</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--app-amber-text)]" />Medio</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-expense)]" />Alto</span>
          </div>
        </SectionCard>
      </section>

      {freqSummary.length > 0 && (
        <SectionCard title="Resumen por frecuencia" description="Impacto mensual estimado (solo ARS activos).">
          <div className="divide-y divide-[var(--app-border)]">
            {freqSummary.map(({ freq, count, monthlyArs }) => (
              <div key={freq} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--app-text-1)]">{FRECUENCIA_LABELS[freq]}</span>
                  <span className="text-xs text-[var(--app-text-3)]">{count} activo{count !== 1 ? 's' : ''}</span>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${monthlyArs < 0 ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>
                  {formatMonto(monthlyArs, 'ARS')}
                  <span className="text-[11px] font-normal text-[var(--app-text-3)] ml-1">/mes</span>
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {creating && (
        <RecurrenteModal
          initial={EMPTY_FORM}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      )}

      {editing && (
        <RecurrenteModal
          initial={recurrenteToForm(editing)}
          onClose={() => setEditing(null)}
          onSave={handleUpdate}
        />
      )}

      {deleteTarget !== null && (() => {
        const r = recurrentes.find((x) => x.id === deleteTarget);
        return (
          <ConfirmModal
            title="Borrar recurrente"
            description="Esta acción no se puede deshacer."
            confirmLabel="Borrar"
            tone="danger"
            preview={r ? {
              title: r.descripcion || 'Sin descripción',
              meta: `${FRECUENCIA_LABELS[r.frecuencia]} · ${r.tipo === 'egreso' ? 'Gasto' : 'Ingreso'} · ${r.moneda}`,
              amount: `$ ${r.monto.toLocaleString('es-AR')}`,
              arrow: r.tipo === 'egreso' ? 'down' : 'up',
            } : undefined}
            onConfirm={async () => { const id = deleteTarget; setDeleteTarget(null); await handleDelete(id); }}
            onCancel={() => setDeleteTarget(null)}
          />
        );
      })()}
    </div>
  );
}
