import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTelegramCategory } from '../src/server/telegramCategoryResolution.ts';

const categories = [
  { id: '1', nombre: 'Gastos de oficina' },
  { id: '2', nombre: 'Comida' },
  { id: '3', nombre: 'Alquiler' },
];

test('devuelve missing cuando categoria es null', () => {
  assert.deepEqual(resolveTelegramCategory({ categoria: null }, categories), { kind: 'missing' });
});

test('devuelve missing cuando categoria es string vacío', () => {
  assert.deepEqual(resolveTelegramCategory({ categoria: '' }, categories), { kind: 'missing' });
});

test('resuelve match exacto normalizado', () => {
  const result = resolveTelegramCategory({ categoria: 'Gastos de oficina' }, categories);
  assert.equal(result.kind, 'exact');
  if (result.kind === 'exact') {
    assert.equal(result.category.nombre, 'Gastos de oficina');
  }
});

test('resuelve match exacto normalizado con minúsculas', () => {
  const result = resolveTelegramCategory({ categoria: 'gastos de oficina' }, categories);
  assert.equal(result.kind, 'exact');
  if (result.kind === 'exact') {
    assert.equal(result.category.nombre, 'Gastos de oficina');
  }
});

test('sugiere categoría similar cuando el match es fuerte pero no exacto', () => {
  const result = resolveTelegramCategory({ categoria: 'gastos oficina' }, categories);
  assert.equal(result.kind, 'suggest');
  if (result.kind === 'suggest') {
    assert.equal(result.category.nombre, 'Gastos de oficina');
    assert.equal(result.score >= 0.63, true);
  }
});

test('deja unresolved cuando la similitud es floja', () => {
  const result = resolveTelegramCategory({ categoria: 'foo bar baz qux' }, categories);
  assert.deepEqual(result, { kind: 'unresolved' });
});

test('deja unresolved cuando options está vacío', () => {
  const result = resolveTelegramCategory({ categoria: 'Comida' }, []);
  assert.deepEqual(result, { kind: 'unresolved' });
});

// getTopCategoriasForDashboard tests — use a stub supabase
test('getTopCategoriasForDashboard retorna lista scoped por dashboardId', async () => {
  const { getTopCategoriasForDashboard } = await import('../src/server/telegramCategoryResolution.ts');

  const mockCats = [
    { id: '1', nombre: 'Servicios', created_at: '2026-01-01T00:00:00Z' },
    { id: '2', nombre: 'Comida', created_at: '2026-01-02T00:00:00Z' },
  ];
  const mockMovs = [
    { categoria: 'Comida' },
    { categoria: 'Comida' },
    { categoria: 'Servicios' },
  ];

  const mockSupabase = {
    from: (table: string) => {
      if (table === 'categorias') {
        return {
          select: () => ({
            eq: () => ({ data: mockCats, error: null }),
          }),
        };
      }
      if (table === 'movimientos') {
        return {
          select: () => ({
            not: () => ({
              gte: () => ({
                eq: () => ({ data: mockMovs, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };

  const result = await getTopCategoriasForDashboard(mockSupabase, { dashboardId: 'dash-1', ownerUserId: null });
  assert.equal(result.length, 2);
  // Comida has higher frequency, should come first
  assert.equal(result[0].nombre, 'Comida');
  assert.equal(result[1].nombre, 'Servicios');
});

test('getTopCategoriasForDashboard retorna vacío cuando scope es nulo', async () => {
  const { getTopCategoriasForDashboard } = await import('../src/server/telegramCategoryResolution.ts');

  const result = await getTopCategoriasForDashboard({}, { dashboardId: null, ownerUserId: null });
  assert.deepEqual(result, []);
});

// extractionReview store + keyboard tests
test('createPendingExtraction has categoriaOptions null by default', async () => {
  const { createPendingExtraction, stopExtractionSweep } = await import('../src/server/extractionReview.ts');
  const entry = createPendingExtraction({
    chatId: 99,
    dashboardId: null,
    userId: null,
    ownerUserId: null,
    data: { monto: 100, moneda: 'ARS', tipo: 'egreso', empresa: null, cuit: null, categoria: 'Varios', descripcion: 'test', fecha: null, confidence: 1, sourceType: 'photo' },
    messageId: 0,
  });
  assert.equal(entry.categoriaOptions, null);
  assert.equal(entry.awaitingCategoria, false);
  assert.equal(entry.pendingNewCategoriaName, null);
  assert.equal(entry.pendingSuggestCategoria, null);
  stopExtractionSweep();
});

test('buildReviewKeyboard without categoriaOptions returns 3-row keyboard (byte-identical)', async () => {
  const { buildReviewKeyboard } = await import('../src/server/extractionReview.ts');
  const kb = buildReviewKeyboard('test-id');
  assert.equal(kb.inline_keyboard.length, 3);
});

test('buildReviewKeyboard with categoriaOptions adds quick-pick row before edit rows', async () => {
  const { buildReviewKeyboard } = await import('../src/server/extractionReview.ts');
  const opts = [{ id: '1', nombre: 'Servicios' }, { id: '2', nombre: 'Comida' }];
  const kb = buildReviewKeyboard('test-id', opts);
  assert.equal(kb.inline_keyboard.length, 4);
  // First row is the quick-pick
  assert.equal(kb.inline_keyboard[0][0].callback_data, 'er:ca:test-id:0');
  assert.equal(kb.inline_keyboard[0][0].text, 'Servicios');
  assert.equal(kb.inline_keyboard[0][1].callback_data, 'er:ca:test-id:1');
});

// createCategoriaFromBot dedupe tests
test('createCategoriaFromBot reutiliza cuando ya existe con el mismo nombre normalizado', async () => {
  const { createCategoriaFromBot } = await import('../src/bot/commands/entities.ts');

  const existingCat = { id: 'cat-1', nombre: 'Comida' };
  let insertCalled = false;

  const mockSupabase = {
    from: (table: string) => {
      if (table === 'categorias') {
        return {
          select: () => ({
            eq: (_: string, _v: string) => ({ data: [existingCat], error: null }),
          }),
          insert: () => {
            insertCalled = true;
            return { data: null, error: null };
          },
        };
      }
      return {};
    },
  };

  const linked = { dashboardId: 'dash-1', ownerUserId: null, userId: 'user-1', role: null, permissions: {}, username: null, remindersEnabled: true, linkTokenExpiresAt: null };
  const result = await createCategoriaFromBot(mockSupabase as any, linked as any, 'comida');

  assert.equal(result.ok, true);
  assert.equal(result.reused, true);
  assert.equal(insertCalled, false);
});

test('createCategoriaFromBot inserta cuando no existe coincidencia', async () => {
  const { createCategoriaFromBot } = await import('../src/bot/commands/entities.ts');

  let insertCalled = false;

  const mockSupabase = {
    from: (table: string) => {
      if (table === 'categorias') {
        return {
          select: () => ({
            eq: () => ({ data: [], error: null }),
          }),
          insert: () => {
            insertCalled = true;
            return {
              select: () => ({ data: [{ id: 'new-cat-1', nombre: 'NuevaCat' }], error: null }),
            };
          },
        };
      }
      return {};
    },
  };

  const linked = { dashboardId: 'dash-1', ownerUserId: null, userId: 'user-1', role: null, permissions: {}, username: null, remindersEnabled: true, linkTokenExpiresAt: null };
  const result = await createCategoriaFromBot(mockSupabase as any, linked as any, 'NuevaCat');

  assert.equal(result.ok, true);
  assert.equal(result.reused, false);
  assert.equal(insertCalled, true);
});
