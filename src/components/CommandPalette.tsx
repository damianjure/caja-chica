import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ArrowUpDown, Building2, Tag, Zap } from 'lucide-react';
import { searchCommands, type CommandSearchInput, type CommandResult, type ResultGroup } from '../dashboard/commandSearch';

// ─── Group icon map ───────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, typeof Search> = {
  Movimientos: ArrowUpDown,
  Empresas: Building2,
  Categorías: Tag,
  Acciones: Zap,
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  searchInput: Omit<CommandSearchInput, 'query'>;
  onSelect: (item: CommandResult) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose, searchInput, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // defer focus so the element is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const groups: ResultGroup[] = useMemo(
    () => searchCommands({ ...searchInput, query }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, searchInput.movimientos, searchInput.empresas, searchInput.categorias, searchInput.quickActions],
  );

  const flatItems: CommandResult[] = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Keyboard handling
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) {
          onSelect(item);
          onClose();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [open, flatItems, activeIndex, onSelect, onClose]);

  if (!open) return null;

  let flatIdx = 0;

  return createPortal(
    <div
      className="anim-backdrop-in fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: 'color-mix(in srgb, var(--app-text-1) 42%, transparent)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
    >
      <div
        className="anim-scale-in w-full max-w-xl bg-[var(--app-surface-1)] rounded-2xl shadow-[var(--app-shadow-md)] border border-[var(--app-border)] overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--app-border)] shrink-0">
          <Search className="w-4 h-4 text-[var(--app-text-3)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={groups.length > 0}
            aria-autocomplete="list"
            aria-controls="command-palette-listbox"
            aria-activedescendant={flatItems[activeIndex] ? `cp-item-${flatItems[activeIndex]!.id}` : undefined}
            className="flex-1 bg-transparent text-[var(--app-text-1)] placeholder-[var(--app-text-3)] text-sm outline-none"
            placeholder="Buscar movimientos, empresas, categorías…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--app-text-3)] border border-[var(--app-border)] bg-[var(--app-surface-2)] shrink-0">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          id="command-palette-listbox"
          role="listbox"
          ref={listRef}
          className="overflow-y-auto flex-1"
          aria-label="Resultados de búsqueda"
        >
          {groups.length === 0 && query.trim() !== '' && (
            <div className="px-4 py-8 text-center text-sm text-[var(--app-text-3)]">
              Sin resultados para <span className="font-medium text-[var(--app-text-2)]">"{query}"</span>
            </div>
          )}

          {groups.map((group) => {
            const Icon = GROUP_ICONS[group.group] ?? Search;
            return (
              <div key={group.group}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                  <Icon className="w-3 h-3 text-[var(--app-text-3)]" aria-hidden="true" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-3)]">
                    {group.group}
                  </span>
                </div>

                {/* Group items */}
                {group.items.map((item) => {
                  const itemIdx = flatIdx++;
                  const isActive = itemIdx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      id={`cp-item-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive ? 'true' : 'false'}
                      className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors duration-75 ${
                        isActive
                          ? 'bg-[var(--app-surface-2)]'
                          : 'hover:bg-[var(--app-surface-2)]'
                      }`}
                      onClick={() => {
                        onSelect(item);
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(itemIdx)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--app-text-1)] truncate">
                          {item.label}
                        </div>
                        {item.secondary && (
                          <div className="text-xs text-[var(--app-text-3)] truncate mt-0.5">
                            {item.secondary}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <kbd className="shrink-0 mt-0.5 inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono text-[var(--app-text-3)] border border-[var(--app-border)] bg-[var(--app-surface-3)]">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Empty query hint */}
          {groups.length > 0 && query.trim() === '' && (
            <div className="px-4 py-2 text-[10px] text-[var(--app-text-4)] text-center">
              Escribí para buscar en tus movimientos, empresas y categorías
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="shrink-0 border-t border-[var(--app-border)] px-4 py-2 flex items-center gap-4 text-[10px] text-[var(--app-text-3)]">
          <span><kbd className="font-mono">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono">↵</kbd> seleccionar</span>
          <span><kbd className="font-mono">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
