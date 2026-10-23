export type PageToken = number | 'ellipsis';

export function pageSlice<T>(items: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

export function totalPages(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / perPage));
}

/** Lista de páginas a renderizar con elipsis. Siempre muestra 1 y la última. */
export function pageList(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 'ellipsis', total];
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Follows a cursor-paginated source until the last page and returns every item
 * in order. `maxPages` bounds the work; when it is hit, `nextCursor` says where
 * to resume. A repeated cursor ends the loop (defensive against a backend that
 * keeps returning the same page).
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: string | null) => Promise<CursorPage<T>>,
  { startCursor = null, maxPages = 100 }: { startCursor?: string | null; maxPages?: number } = {},
): Promise<CursorPage<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor = startCursor;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    const next = result.nextCursor;
    if (!next || seen.has(next)) return { items, nextCursor: null };
    seen.add(next);
    cursor = next;
  }
  return { items, nextCursor: cursor };
}
