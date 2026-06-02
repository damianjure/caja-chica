import test from 'node:test';
import assert from 'node:assert/strict';

import { pageSlice, totalPages, pageList } from '../src/dashboard/pagination';

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
