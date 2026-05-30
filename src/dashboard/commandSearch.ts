import type { Movimiento, Empresa, Categoria } from '../services/api';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  group: string;
}

export type ResultType = 'movimiento' | 'empresa' | 'categoria' | 'action';

export interface CommandResult {
  id: string;
  type: ResultType;
  label: string;
  secondary?: string;
  /** Original data reference for navigation */
  data?: Movimiento | Empresa | Categoria | QuickAction;
}

export interface ResultGroup {
  group: string;
  items: CommandResult[];
}

export interface CommandSearchInput {
  query: string;
  movimientos: Movimiento[];
  empresas: Empresa[];
  categorias: Categoria[];
  quickActions: QuickAction[];
}

// ─── Caps per group ───────────────────────────────────────────────────────────

const CAP_MOVIMIENTOS = 8;
const CAP_EMPRESAS = 6;
const CAP_CATEGORIAS = 6;
const CAP_ACTIONS = 8;

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Lowercase + strip diacritics. Handles á/é/í/ó/ú/ñ and all common accented
 * chars via NFD decomposition + regex strip.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // strip all combining marks (handles á/é/í/ó/ú/ñ/ü etc.)
    .toLowerCase();
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

/**
 * Returns a rank score for a hit. Lower is better.
 *  0 = exact prefix match (text starts with query)
 *  1 = word-boundary match (any word in text starts with query)
 *  2 = substring match anywhere
 * -1 = no match
 */
function rank(normText: string, normQuery: string): number {
  if (!normText.includes(normQuery)) return -1;
  if (normText.startsWith(normQuery)) return 0;
  // word-boundary: any word starts with query
  const wordBoundary = new RegExp(`(?:^|\\s)${escapeRegex(normQuery)}`);
  if (wordBoundary.test(normText)) return 1;
  return 2;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns true if the text matches the query at all. */
function matches(normText: string, normQuery: string): boolean {
  return normText.includes(normQuery);
}

// ─── Field concatenation helpers ──────────────────────────────────────────────

function movSearchText(m: Movimiento): string {
  return normalize(
    [m.descripcion, m.empresa_nombre, m.categoria, m.original_text].filter(Boolean).join(' '),
  );
}

function movRank(m: Movimiento, normQuery: string): number {
  // Rank by the best-ranking individual field
  const fields = [
    normalize(m.descripcion ?? ''),
    normalize(m.empresa_nombre ?? ''),
    normalize(m.categoria ?? ''),
  ];
  let best = 99;
  for (const f of fields) {
    const r = rank(f, normQuery);
    if (r !== -1 && r < best) best = r;
  }
  // Also ensure there's at least a substring hit in the full text
  return best === 99 ? -1 : best;
}

// ─── Label builders ───────────────────────────────────────────────────────────

function movLabel(m: Movimiento): string {
  return m.descripcion || '(sin descripción)';
}

function movSecondary(m: Movimiento): string {
  const parts: string[] = [];
  if (m.empresa_nombre) parts.push(m.empresa_nombre);
  if (m.categoria) parts.push(m.categoria);
  if (m.monto != null) {
    const sign = m.tipo === 'ingreso' ? '+' : '-';
    parts.push(`${sign}${m.monto.toLocaleString('es-AR')} ${m.moneda}`);
  }
  return parts.join(' · ');
}

// ─── Main search function ─────────────────────────────────────────────────────

export function searchCommands(input: CommandSearchInput): ResultGroup[] {
  const { query, movimientos, empresas, categorias, quickActions } = input;
  const normQuery = normalize(query.trim());
  const groups: ResultGroup[] = [];

  // Empty query: show quick actions only
  if (!normQuery) {
    if (quickActions.length > 0) {
      groups.push({
        group: 'Acciones',
        items: quickActions.slice(0, CAP_ACTIONS).map((a) => ({
          id: a.id,
          type: 'action' as const,
          label: a.label,
          secondary: a.description,
          data: a,
        })),
      });
    }
    return groups;
  }

  // ── Movimientos ──────────────────────────────────────────────────────────
  const movHits = movimientos
    .map((m) => ({ m, r: movRank(m, normQuery) }))
    .filter(({ r }) => r !== -1)
    .sort((a, b) => a.r - b.r)
    .slice(0, CAP_MOVIMIENTOS)
    .map(({ m }): CommandResult => ({
      id: m.id,
      type: 'movimiento',
      label: movLabel(m),
      secondary: movSecondary(m),
      data: m,
    }));

  if (movHits.length > 0) {
    groups.push({ group: 'Movimientos', items: movHits });
  }

  // ── Empresas ─────────────────────────────────────────────────────────────
  const empHits = empresas
    .map((e) => ({ e, r: rank(normalize(e.nombre), normQuery) }))
    .filter(({ r }) => r !== -1)
    .sort((a, b) => a.r - b.r)
    .slice(0, CAP_EMPRESAS)
    .map(({ e }): CommandResult => ({
      id: e.id,
      type: 'empresa',
      label: e.nombre,
      data: e,
    }));

  if (empHits.length > 0) {
    groups.push({ group: 'Empresas', items: empHits });
  }

  // ── Categorías ───────────────────────────────────────────────────────────
  const catHits = categorias
    .map((c) => ({ c, r: rank(normalize(c.nombre), normQuery) }))
    .filter(({ r }) => r !== -1)
    .sort((a, b) => a.r - b.r)
    .slice(0, CAP_CATEGORIAS)
    .map(({ c }): CommandResult => ({
      id: c.id,
      type: 'categoria',
      label: c.nombre,
      data: c,
    }));

  if (catHits.length > 0) {
    groups.push({ group: 'Categorías', items: catHits });
  }

  // ── Quick Actions ────────────────────────────────────────────────────────
  const actionHits = quickActions
    .filter((a) => {
      const labelNorm = normalize(a.label);
      const descNorm = normalize(a.description ?? '');
      return matches(labelNorm, normQuery) || matches(descNorm, normQuery);
    })
    .slice(0, CAP_ACTIONS)
    .map((a): CommandResult => ({
      id: a.id,
      type: 'action',
      label: a.label,
      secondary: a.description,
      data: a,
    }));

  if (actionHits.length > 0) {
    groups.push({ group: 'Acciones', items: actionHits });
  }

  return groups;
}
