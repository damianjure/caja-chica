import { useState, useEffect, type FormEvent } from 'react';
import { Pause, Play, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Recurrente, type RecurrenteRequest, type Frecuencia, type AppViewer } from '../../../services/api';
import { SectionCard } from '../primitives';
import { ConfirmModal } from '../../ui/ConfirmModal';

const FRECUENCIA_LABELS: Record<Frecuencia, string> = {
  diario: 'Diario',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
  anual: 'Anual',
};

const FRECUENCIA_OPTIONS: Frecuencia[] = ['diario', 'semanal', 'quincenal', 'mensual', 'anual'];

const badgeActive =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 ring-1 ring-green-300/60 dark:bg-green-500/15 dark:text-green-200 dark:ring-green-400/40';

const badgePaused =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-600 ring-1 ring-neutral-300/60 dark:bg-neutral-700/40 dark:text-neutral-300 dark:ring-neutral-500/40';

const badgeTipo = (tipo: 'egreso' | 'ingreso') =>
  tipo === 'ingreso'
    ? 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/60 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/40'
    : 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-800 ring-1 ring-rose-300/60 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-400/40';

const badgeFrecuencia =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-sky-100 text-sky-800 ring-1 ring-sky-300/60 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/40';

function formatAbsoluteDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return isoString;
  }
}

function formatMonto(monto: number, moneda: 'ARS' | 'USD'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda }).format(monto);
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
        className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="recurrente-modal-title" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {form === initial && initial.monto === '' ? 'Nuevo recurrente' : 'Editar recurrente'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Monto</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as 'egreso' | 'ingreso' }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="egreso">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Moneda</label>
              <select
                value={form.moneda}
                onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value as 'ARS' | 'USD' }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div className={form.frecuencia === 'mensual' ? '' : 'col-span-1 sm:col-span-2'}>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Frecuencia</label>
              <select
                value={form.frecuencia}
                onChange={(e) => setForm((f) => ({ ...f, frecuencia: e.target.value as Frecuencia }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                {FRECUENCIA_OPTIONS.map((f) => (
                  <option key={f} value={f}>{FRECUENCIA_LABELS[f]}</option>
                ))}
              </select>
            </div>

            {form.frecuencia === 'mensual' && (
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Día del mes</label>
                <select
                  value={form.dayOfMonth}
                  onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Categoría</label>
              <input
                type="text"
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Ej: servicios"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Empresa</label>
              <input
                type="text"
                value={form.empresa_nombre}
                onChange={(e) => setForm((f) => ({ ...f, empresa_nombre: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Personal"
              />
            </div>

            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Descripción</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Ej: alquiler local"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-600 border border-transparent hover:border-[var(--app-text-2)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-neutral-900 text-white border border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-200 hover:border-[var(--app-text-2)] disabled:opacity-50 transition-colors"
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

  return (
    <div className="space-y-6">
      <SectionCard
        title="Recurrentes"
        description="Gastos e ingresos automáticos"
      >
        {canWriteData && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-neutral-900 text-white border border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-200 hover:border-[var(--app-text-2)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo recurrente
            </button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center gap-3 py-8 text-neutral-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando recurrentes...
          </div>
        ) : recurrentes.length === 0 ? (
          <div className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center">
            <p className="font-semibold text-neutral-700 mb-1">Sin recurrentes todavía</p>
            <p className="text-sm text-neutral-500 mb-4">Creá tu primer movimiento recurrente para automatizar registros periódicos.</p>
            {canWriteData && (
              <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white">+ Nuevo recurrente</button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {recurrentes.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 p-4"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatMonto(r.monto, r.moneda)}
                    </span>
                    <span className={badgeTipo(r.tipo)}>
                      {r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
                    </span>
                    <span className={badgeFrecuencia}>
                      {FRECUENCIA_LABELS[r.frecuencia]}
                      {r.frecuencia === 'mensual' && r.day_of_month ? ` · día ${r.day_of_month}` : ''}
                    </span>
                    <span className={r.is_active ? badgeActive : badgePaused}>
                      {r.is_active ? 'Activo' : 'Pausado'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {r.empresa_nombre && (
                      <span>{r.empresa_nombre}</span>
                    )}
                    {r.categoria && (
                      <span>· {r.categoria}</span>
                    )}
                    {r.descripcion && (
                      <span className="italic">· {r.descripcion}</span>
                    )}
                  </div>

                  <span
                    className="text-xs text-neutral-400 dark:text-neutral-500 cursor-default"
                    title={formatAbsoluteDate(r.next_run_at)}
                  >
                    Próxima carga: {r.next_run_label}
                  </span>
                </div>

                {canWriteData && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggle(r.id)}
                      disabled={togglingId === r.id}
                      className="p-2 rounded-lg border border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:border-[var(--app-text-2)] transition-colors disabled:opacity-50"
                      title={r.is_active ? 'Pausar' : 'Activar'}
                      aria-label={r.is_active ? 'Pausar recurrente' : 'Activar recurrente'}
                    >
                      {r.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setEditing(r)}
                      className="p-2 rounded-lg border border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:border-[var(--app-text-2)] transition-colors"
                      title="Editar"
                      aria-label="Editar recurrente"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r.id)}
                      disabled={deletingId === r.id}
                      className="p-2 rounded-lg border border-transparent text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-400 transition-colors disabled:opacity-50"
                      title="Eliminar"
                      aria-label="Eliminar recurrente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

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

      {deleteTarget !== null && (
        <ConfirmModal
          title="Borrar recurrente"
          description={`¿Borrar "${recurrentes.find((r) => r.id === deleteTarget)?.descripcion ?? ''}"? Esta acción no se puede deshacer.`}
          confirmLabel="Borrar"
          tone="danger"
          onConfirm={async () => { const id = deleteTarget; setDeleteTarget(null); await handleDelete(id); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
