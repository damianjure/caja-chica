import { useEffect, useState } from "react";
import { Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Categoria } from "../../../../services/api";
import { SectionCard } from "../../primitives";
import { ConfirmModal } from "../../../ui/ConfirmModal";

/**
 * Gestión de categorías (opción 1: vive en Configuración, no en Movimientos).
 * Solo borrar — las categorías se crean solas al cargar movimientos.
 * El endpoint DELETE /api/categorias rechaza si la categoría todavía tiene movimientos.
 */
export function CategoriasSection() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null);
  const [newCategoria, setNewCategoria] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .getCategorias()
      .then(setCategorias)
      .catch(() => toast.error("No se pudieron cargar las categorías."))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const nombre = newCategoria.trim();
    if (!nombre || creating) return;
    setCreating(true);
    try {
      const created = await api.createCategoria(nombre);
      setCategorias((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      });
      setNewCategoria("");
      toast.success("Categoría agregada.");
    } catch {
      toast.error("No se pudo agregar la categoría.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteCategoria(id);
      setCategorias((prev) => prev.filter((c) => c.id !== id));
      toast.success("Categoría eliminada.");
    } catch {
      toast.error("No se pudo eliminar. Puede que todavía tenga movimientos.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SectionCard title="Categorías" description="Agregá las que necesites y borrá las que no uses. Si una categoría todavía tiene movimientos, no se puede eliminar.">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Nombre de la nueva categoría"
          value={newCategoria}
          onChange={(e) => setNewCategoria(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          placeholder="Nueva categoría"
          maxLength={60}
          className="flex-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 py-2.5 text-sm text-[var(--app-text-1)] outline-none focus:ring-2 focus:ring-[var(--app-text-1)]"
        />
        <button
          onClick={() => void handleCreate()}
          disabled={!newCategoria.trim() || creating}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 border border-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:border-[var(--app-text-2)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Agregando..." : "Agregar"}
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--app-text-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando categorías...
        </div>
      ) : categorias.length === 0 ? (
        <p className="text-sm text-[var(--app-text-3)]">No hay categorías todavía. Se crean solas al cargar movimientos.</p>
      ) : (
        <div className="space-y-2">
          {categorias.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2.5">
              <span className="text-sm font-medium text-[var(--app-text-1)]">{c.nombre}</span>
              <button
                onClick={() => setDeleteTarget(c)}
                disabled={deletingId === c.id}
                aria-label={`Borrar categoría ${c.nombre}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-[var(--chart-expense)] transition hover:border-red-400 disabled:opacity-50 dark:border-red-500/40 dark:hover:border-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Borrar categoría"
          description="Si todavía está en uso, no se va a poder. Si no, se elimina del dashboard."
          confirmLabel="Borrar"
          tone="danger"
          preview={{ title: deleteTarget.nombre }}
          onConfirm={async () => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            await handleDelete(id);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </SectionCard>
  );
}
