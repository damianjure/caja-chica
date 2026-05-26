import { memo } from 'react';
import { TrendingDown, TrendingUp, MessageSquareText, Loader2, Copy, Check, Pencil, Trash2, Building2, Tag } from 'lucide-react';
import { type Movimiento } from '../../services/api';

interface MovementCardsProps {
  filteredHistory: Movimiento[];
  selectedCompany: string;
  canWriteData: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  copiedId: string | null;
  onEdit: (item: Movimiento) => void;
  onCopy: (item: Movimiento) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
}

function MovementCardsImpl({
  filteredHistory, selectedCompany, canWriteData, hasMore, loadingMore,
  copiedId, onEdit, onCopy, onDelete, onLoadMore,
}: MovementCardsProps) {
  if (filteredHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-neutral-200 rounded-xl text-neutral-400">
        <MessageSquareText className="w-10 h-10 mb-3 opacity-40" />
        {selectedCompany === 'all' ? (
          <>
            <p className="font-medium text-neutral-500">Sin movimientos por ahora.</p>
            <p className="text-sm mt-1">
              {canWriteData ? 'Escribí un movimiento en el campo de arriba. Tipo: "pagué 4500 de luz".' : 'El dueño todavía no cargó nada. Vas a verlos acá apenas pase.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-neutral-500">{`No hay datos para "${selectedCompany}"`}</p>
            <p className="text-sm mt-1">Probá con otra empresa o sacá el filtro.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredHistory.map((item, index) => (
            <div
              key={item.id}
              style={{ animationDelay: `${Math.min(index * 40, 160)}ms` }}
              className="anim-card-in group bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl p-5 shadow-sm relative overflow-hidden transition-[border-color] duration-150"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-md ${item.tipo === 'ingreso' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {item.tipo === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-neutral-500 block leading-none mb-1">{item.categoria}</span>
                    <span className="text-lg font-semibold text-neutral-900 tabular-nums">
                      {item.monto !== null
                        ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.moneda || 'ARS' }).format(item.monto)
                        : 'Monto no especificado'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canWriteData && (
                    <button onClick={() => onEdit(item)} className="p-2 text-neutral-400 hover:text-neutral-900 active:scale-[0.9] transition duration-100 rounded-md border border-transparent hover:border-[var(--app-text-2)]" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => onCopy(item)} className="p-2 text-neutral-400 hover:text-neutral-900 active:scale-[0.9] transition duration-100 rounded-md border border-transparent hover:border-[var(--app-text-2)]" title="Copiar JSON">
                    {copiedId === item.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {canWriteData && (
                    <button onClick={() => onDelete(item.id)} className="p-2 text-neutral-400 hover:text-red-600 active:scale-[0.9] transition duration-100 rounded-md border border-transparent hover:border-red-400" title="Borrar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-neutral-600 italic line-clamp-2">"{item.original_text}"</p>
                <div className="flex flex-wrap gap-2">
                  {item.empresa_nombre && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md"><Building2 className="w-3 h-3" />{item.empresa_nombre}</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md"><Tag className="w-3 h-3" />{item.descripcion}</span>
                </div>
                <div className="pt-3 border-t border-neutral-200">
                  <span className="text-xs text-neutral-500 font-mono">{new Date(item.created_at).toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>
          ))}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button onClick={onLoadMore} disabled={loadingMore} className="px-6 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-600 hover:border-neutral-400 disabled:opacity-50 transition-colors">
            {loadingMore ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</span> : 'Cargar más'}
          </button>
        </div>
      )}
    </>
  );
}

export const MovementCards = memo(MovementCardsImpl);
