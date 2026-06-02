import { useState, useEffect, type FormEvent } from 'react';
import { Pause, Play, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Recurrente, type RecurrenteRequest, type Frecuencia, type AppViewer } from '../../../services/api';
import { SectionCard, MetricCard } from '../primitives';
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurrente-modal-title"
        className="bg-white dark:bg-[var(--app-strong-surface)] rounded-xl shadow-xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="recurrente-modal-title" className="text-base font-semibold text-[var(--app-text-1)] dark:text-neutral-100">
          {form === initial && initial.monto === '' ? 'Nuevo recurrente' : 'Editar recurrente'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Monto</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as 'egreso' | 'ingreso' }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="egreso">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Moneda</label>
              <select
                value={form.moneda}
                onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div className={form.frecuencia === 'mensual' ? '' : 'col-span-1 sm:col-span-2'}>
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Frecuencia</label>
              <select
                value={form.frecuencia}
                onChange={(e) => setForm((f) => ({ ...f, frecuencia: e.target.value as Frecuencia }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                {FRECUENCIA_OPTIONS.map((f) => (
                  <option key={f} value={f}>{FRECUENCIA_LABELS[f]}</option>
                ))}
              </select>
            </div>

            {form.frecuencia === 'mensual' && (
              <div>
                <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Día del mes</label>
                <select
                  value={form.dayOfMonth}
                  onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Categoría</label>
              <input
                type="text"
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Ej: servicios"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Empresa</label>
              <input
                type="text"
                value={form.empresa_nombre}
                onChange={(e) => setForm((f) => ({ ...f, empresa_nombre: e.target.value }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Personal"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--app-text-3)] uppercase tracking-wide mb-1">Descripción</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                className="w-full rounded-xl border border-[var(--app-border)] dark:border-neutral-700 bg-white dark:bg-[var(--app-strong-surface)] px-3 py-2 text-sm text-[var(--app-text-1)] dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Ej: alquiler local"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--app-text-2)] border border-transparent hover:border-[var(--app-text-2)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border border-[var(--app-strong-surface)] dark:bg-[var(--app-surface-2)] dark:text-[var(--app-text-1)] dark:border-[var(--app-border)] hover:border-[var(--app-text-2)] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const signedMonto = (r: Recurrente) => formatMonto(r.tipo === 'egreso' ? -r.monto : r.monto, r.moneda);

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
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-4 py-2 text-sm font-medium text-[var(--app-strong-text)]"><Plus className="w-4 h-4" /> Nuevo recurrente</button>
          )}
        </div>
        {creating && (
          <RecurrenteModal initial={EMPTY_FORM} onClose={() => setCreating(false)} onSave={handleCreate} />
        )}
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Recurrentes activos" value={String(summary.activos)} sub="Este mes" tone="neutral" />
        <MetricCard label="Impacto mensual" value={formatMonto(summary.impactoMensualArs, 'ARS')} sub="Promedio" tone={summary.impactoMensualArs < 0 ? 'danger' : 'success'} />
        <MetricCard label="Próximo impacto" value={summary.proximaFechaIso ? formatShortDate(summary.proximaFechaIso) : '—'} sub={summary.proximaFechaIso ? daysUntilLabel(summary.proximaFechaIso) : undefined} tone="warning" />
        <MetricCard label="Impacto 30 días" value={formatMonto(summary.proyeccion30dArs, 'ARS')} sub="Proyección" tone={summary.proyeccion30dArs < 0 ? 'danger' : 'success'} critical={summary.proyeccion30dArs < 0} />
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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
                <div key={d.date} title={`${d.date}: ${formatMonto(d.total, 'ARS')}`} className={`grid aspect-square place-items-center rounded-md border text-xs ${cls}`}>
                  {Number(d.date.slice(8, 10))}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-text-3)]">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--app-surface-2)] border border-[var(--app-border)]" />Sin impacto</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-income)]" />Bajo</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--app-amber-text)]" />Medio</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--chart-expense)]" />Alto</span>
          </div>
        </SectionCard>

        <SectionCard title="Próximos recurrentes" description="Ordenados por próxima carga.">
          <div className="divide-y divide-[var(--app-border)]">
            {proximos.map((r) => (
              <div key={r.id} className={`flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 ${r.is_active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[var(--app-text-1)] truncate">{r.descripcion || r.empresa_nombre || 'Recurrente'}</span>
                    {!r.is_active && <span className={badgePaused}>Pausado</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--app-text-3)]">
                    {FRECUENCIA_LABELS[r.frecuencia]}
                    {r.frecuencia === 'mensual' && r.day_of_month ? ` · día ${r.day_of_month}` : ''}
                    {r.categoria ? ` · ${r.categoria}` : r.descripcion && r.empresa_nombre ? ` · ${r.empresa_nombre}` : ''}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${r.tipo === 'egreso' ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>
                    {signedMonto(r)}
                  </span>
                  {canWriteData && (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => handleToggle(r.id)}
                        disabled={togglingId === r.id}
                        className="p-1.5 rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-50"
                        title={r.is_active ? 'Pausar' : 'Activar'}
                        aria-label={r.is_active ? 'Pausar recurrente' : 'Activar recurrente'}
                      >
                        {r.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditing(r)}
                        className="p-1.5 rounded-md text-[var(--app-text-3)] hover:text-[var(--app-text-1)] hover:bg-[var(--app-surface-2)] transition-colors"
                        title="Editar"
                        aria-label="Editar recurrente"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r.id)}
                        disabled={deletingId === r.id}
                        className="p-1.5 rounded-md text-[var(--app-text-3)] hover:text-[var(--chart-expense)] hover:bg-[var(--app-surface-2)] transition-colors disabled:opacity-50"
                        title="Eliminar"
                        aria-label="Eliminar recurrente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <div className="flex flex-col gap-4 border-t border-[var(--app-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        {canWriteData ? (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] active:scale-[0.97] transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo recurrente
          </button>
        ) : <span />}
        <div className="flex gap-8 sm:ml-auto">
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--app-text-3)]">Total del mes</div>
            <div className={`text-lg font-bold tabular-nums ${summary.impactoMensualArs < 0 ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>{formatMonto(summary.impactoMensualArs, 'ARS')}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--app-text-3)]">Proyección 30 días</div>
            <div className={`text-lg font-bold tabular-nums ${summary.proyeccion30dArs < 0 ? 'text-[var(--chart-expense)]' : 'text-[var(--chart-income)]'}`}>{formatMonto(summary.proyeccion30dArs, 'ARS')}</div>
          </div>
        </div>
      </div>

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
