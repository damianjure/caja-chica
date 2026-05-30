import test from 'node:test';
import assert from 'node:assert/strict';

import { filterMovements, periodToRange } from '../src/dashboard/summary';

function mov(over: Partial<any>): any {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-05-15T12:00:00.000Z',
    empresa_nombre: 'Acme',
    categoria: 'Servicios',
    tipo: 'egreso',
    moneda: 'ARS',
    monto: 1000,
    descripcion: '',
    ...over,
  };
}

// ── category filter (nuevo) ──────────────────────────────────────────────
test('filterMovements: category filtra por categoría exacta', () => {
  const h = [mov({ categoria: 'Combustible' }), mov({ categoria: 'Servicios' }), mov({ categoria: 'Combustible' })];
  const r = filterMovements(h, { category: 'Combustible' });
  assert.equal(r.length, 2);
  assert.ok(r.every((m) => m.categoria === 'Combustible'));
});

test("filterMovements: category 'all' o ausente no filtra", () => {
  const h = [mov({ categoria: 'A' }), mov({ categoria: 'B' })];
  assert.equal(filterMovements(h, { category: 'all' }).length, 2);
  assert.equal(filterMovements(h, {}).length, 2);
});

// ── date range filter (nuevo) ────────────────────────────────────────────
test('filterMovements: from/to filtra por fecha inclusive', () => {
  const h = [
    mov({ created_at: '2026-05-01T10:00:00Z' }),
    mov({ created_at: '2026-05-15T10:00:00Z' }),
    mov({ created_at: '2026-05-31T10:00:00Z' }),
    mov({ created_at: '2026-06-01T10:00:00Z' }),
  ];
  const r = filterMovements(h, { from: '2026-05-01', to: '2026-05-31' });
  assert.equal(r.length, 3); // 1, 15, 31 inclusive; 06-01 fuera
});

test('filterMovements: combina company+tipo+moneda+category+fecha', () => {
  const h = [
    mov({ empresa_nombre: 'Acme', tipo: 'egreso', moneda: 'ARS', categoria: 'Combustible', created_at: '2026-05-10T10:00:00Z' }),
    mov({ empresa_nombre: 'Acme', tipo: 'ingreso', moneda: 'ARS', categoria: 'Combustible', created_at: '2026-05-10T10:00:00Z' }),
    mov({ empresa_nombre: 'Otra', tipo: 'egreso', moneda: 'ARS', categoria: 'Combustible', created_at: '2026-05-10T10:00:00Z' }),
    mov({ empresa_nombre: 'Acme', tipo: 'egreso', moneda: 'ARS', categoria: 'Servicios', created_at: '2026-05-10T10:00:00Z' }),
    mov({ empresa_nombre: 'Acme', tipo: 'egreso', moneda: 'ARS', categoria: 'Combustible', created_at: '2026-04-10T10:00:00Z' }),
  ];
  const r = filterMovements(h, { company: 'Acme', tipo: 'egreso', moneda: 'ARS', category: 'Combustible', from: '2026-05-01', to: '2026-05-31' });
  assert.equal(r.length, 1);
});

// ── periodToRange (nuevo) ────────────────────────────────────────────────
const TODAY = new Date('2026-05-15T12:00:00.000Z');

test('periodToRange: hoy → from=to=hoy', () => {
  assert.deepEqual(periodToRange('hoy', TODAY), { from: '2026-05-15', to: '2026-05-15' });
});

test('periodToRange: semana → últimos 7 días inclusive', () => {
  assert.deepEqual(periodToRange('semana', TODAY), { from: '2026-05-09', to: '2026-05-15' });
});

test('periodToRange: mes → primer..último día del mes', () => {
  assert.deepEqual(periodToRange('mes', TODAY), { from: '2026-05-01', to: '2026-05-31' });
});

test('periodToRange: anio → 01-01..12-31', () => {
  assert.deepEqual(periodToRange('anio', TODAY), { from: '2026-01-01', to: '2026-12-31' });
});

test("periodToRange: 'all' → null (sin filtro)", () => {
  assert.equal(periodToRange('all', TODAY), null);
});
