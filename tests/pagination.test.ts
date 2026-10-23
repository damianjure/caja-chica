import test from 'node:test';
import assert from 'node:assert/strict';

import { pageSlice, totalPages, pageList, fetchAllPages } from '../src/dashboard/pagination';

test('pageSlice: corta 10 por página', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(pageSlice(items, 1, 10), items.slice(0, 10));
  assert.deepEqual(pageSlice(items, 2, 10), items.slice(10, 20));
  assert.deepEqual(pageSlice(items, 3, 10), items.slice(20, 25));
});

test('totalPages: ceil, mínimo 1', () => {
  assert.equal(totalPages(0, 10), 1);
  assert.equal(totalPages(10, 10), 1);
  assert.equal(totalPages(11, 10), 2);
  assert.equal(totalPages(25, 10), 3);
});

test('pageList: <=7 páginas muestra todas', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageList(1, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('pageList: muchas páginas → ventana + ellipsis', () => {
  assert.deepEqual(pageList(1, 10), [1, 2, 3, 'ellipsis', 10]);
  assert.deepEqual(pageList(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  assert.deepEqual(pageList(10, 10), [1, 'ellipsis', 8, 9, 10]);
});

// ---------------------------------------------------------------------------
// fetchAllPages — the dashboard needs every movement, not just the first page
// ---------------------------------------------------------------------------

type Page = { items: number[]; nextCursor: string | null };

function pagedSource(pages: Record<string, Page>) {
  const calls: Array<string | null> = [];
  const fetchPage = async (cursor: string | null) => {
    calls.push(cursor);
    return pages[cursor ?? 'start'];
  };
  return { fetchPage, calls };
}

test('fetchAllPages — follows cursors until the last page and keeps order', async () => {
  const { fetchPage, calls } = pagedSource({
    start: { items: [1, 2], nextCursor: 'c1' },
    c1: { items: [3, 4], nextCursor: 'c2' },
    c2: { items: [5], nextCursor: null },
  });
  const result = await fetchAllPages(fetchPage);
  assert.deepEqual(result, { items: [1, 2, 3, 4, 5], nextCursor: null });
  assert.deepEqual(calls, [null, 'c1', 'c2']);
});

test('fetchAllPages — starts from the given cursor', async () => {
  const { fetchPage, calls } = pagedSource({
    c1: { items: [3], nextCursor: null },
  });
  const result = await fetchAllPages(fetchPage, { startCursor: 'c1' });
  assert.deepEqual(result, { items: [3], nextCursor: null });
  assert.deepEqual(calls, ['c1']);
});

test('fetchAllPages — stops at maxPages and returns the cursor to resume from', async () => {
  const { fetchPage } = pagedSource({
    start: { items: [1], nextCursor: 'c1' },
    c1: { items: [2], nextCursor: 'c2' },
    c2: { items: [3], nextCursor: null },
  });
  const result = await fetchAllPages(fetchPage, { maxPages: 2 });
  assert.deepEqual(result, { items: [1, 2], nextCursor: 'c2' });
});

test('fetchAllPages — a repeated cursor ends the loop instead of spinning forever', async () => {
  const { fetchPage, calls } = pagedSource({
    start: { items: [1], nextCursor: 'c1' },
    c1: { items: [2], nextCursor: 'c1' },
  });
  const result = await fetchAllPages(fetchPage);
  assert.deepEqual(result, { items: [1, 2], nextCursor: null });
  assert.deepEqual(calls, [null, 'c1']);
});
