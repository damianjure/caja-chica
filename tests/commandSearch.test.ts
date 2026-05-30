import test from 'node:test';
import assert from 'node:assert/strict';

import {
  searchCommands,
  type CommandSearchInput,
  type CommandResult,
  type QuickAction,
} from '../src/dashboard/commandSearch';
import type { Movimiento, Empresa, Categoria } from '../src/services/api';

// ─── helpers ───────────────────────────────────────────────────────────────

function mov(overrides: Partial<Movimiento>): Movimiento {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    created_at: overrides.created_at ?? '2026-05-01T12:00:00.000Z',
    tipo: overrides.tipo ?? 'ingreso',
    moneda: overrides.moneda ?? 'ARS',
    monto: overrides.monto ?? 1000,
    categoria: overrides.categoria ?? 'General',
    empresa_nombre: overrides.empresa_nombre ?? 'Personal',
    descripcion: overrides.descripcion ?? 'Descripción de prueba',
    original_text: overrides.original_text ?? '',
    conciliado: overrides.conciliado ?? true,
  };
}

function emp(overrides: Partial<Empresa>): Empresa {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    nombre: overrides.nombre ?? 'Empresa Test',
    created_at: overrides.created_at ?? '2026-05-01T12:00:00.000Z',
    deleted_at: overrides.deleted_at ?? null,
  };
}

function cat(overrides: Partial<Categoria>): Categoria {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    nombre: overrides.nombre ?? 'Categoría Test',
    created_at: overrides.created_at ?? '2026-05-01T12:00:00.000Z',
  };
}

const quickActions: QuickAction[] = [
  { id: 'goto-resumen', label: 'Ir a Resumen', description: 'Ver el resumen general', group: 'Acciones' },
  { id: 'goto-movimientos', label: 'Ir a Movimientos', description: 'Ver historial de movimientos', group: 'Acciones' },
  { id: 'open-composer', label: 'Registrar movimiento', description: 'Abrir el compositor', group: 'Acciones' },
];

function input(query: string, overrides: Partial<CommandSearchInput> = {}): CommandSearchInput {
  return {
    query,
    movimientos: [],
    empresas: [],
    categorias: [],
    quickActions,
    ...overrides,
  };
}

// ─── empty query ────────────────────────────────────────────────────────────

test('empty query returns only quick actions', () => {
  const result = searchCommands(input('', {
    movimientos: [mov({ descripcion: 'Pago de luz' })],
    empresas: [emp({ nombre: 'Telecom' })],
    categorias: [cat({ nombre: 'Servicios' })],
  }));

  const movGroup = result.find((g) => g.group === 'Movimientos');
  const empGroup = result.find((g) => g.group === 'Empresas');
  const catGroup = result.find((g) => g.group === 'Categorías');
  const actGroup = result.find((g) => g.group === 'Acciones');

  assert.equal(movGroup, undefined);
  assert.equal(empGroup, undefined);
  assert.equal(catGroup, undefined);
  assert.ok(actGroup !== undefined, 'should return actions group for empty query');
  assert.equal(actGroup!.items.length, quickActions.length);
});

// ─── case-insensitive matching ───────────────────────────────────────────────

test('matches are case-insensitive', () => {
  const result = searchCommands(input('LUZ', {
    movimientos: [mov({ descripcion: 'Pago de luz' })],
  }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length > 0, 'should match regardless of case');
});

test('query in mixed case matches lowercase description', () => {
  const result = searchCommands(input('Pago De Luz', {
    movimientos: [mov({ descripcion: 'pago de luz' })],
  }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length > 0);
});

// ─── accent/diacritic-insensitive matching ───────────────────────────────────

test('matches accent-free query against accented text', () => {
  const result = searchCommands(input('electricidad', {
    movimientos: [mov({ descripcion: 'Pago de eléctricidad' })],
  }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length > 0, 'should match accent-free query');
});

test('matches accented query against accent-free text', () => {
  const result = searchCommands(input('eléctricidad', {
    movimientos: [mov({ descripcion: 'Pago de electricidad' })],
  }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length > 0);
});

test('handles ñ correctly — query with ñ matches text with ñ', () => {
  // "diseño" → normalized "diseno"; "diseño gráfico" → normalized "diseno grafico"
  // "diseno" is in "diseno grafico" ✓
  const result = searchCommands(input('diseño', {
    categorias: [cat({ nombre: 'diseño gráfico' })],
  }));
  const catGroup = result.find((g) => g.group === 'Categorías');
  assert.ok(catGroup !== undefined && catGroup.items.length > 0, 'should handle ñ in query');
});

test('handles ñ correctly — accent-free query matches ñ text', () => {
  // "diseno" should match "diseño" after both are normalized
  const result = searchCommands(input('diseno', {
    categorias: [cat({ nombre: 'diseño gráfico' })],
  }));
  const catGroup = result.find((g) => g.group === 'Categorías');
  assert.ok(catGroup !== undefined && catGroup.items.length > 0, 'diseno should match diseño');
});

test('matches empresa with accent in nombre', () => {
  const result = searchCommands(input('telecom', {
    empresas: [emp({ nombre: 'Telecóm' })],
  }));
  const empGroup = result.find((g) => g.group === 'Empresas');
  assert.ok(empGroup !== undefined && empGroup.items.length > 0);
});

// ─── ranking: prefix > word-boundary > substring ────────────────────────────

test('prefix match ranks before word-boundary match', () => {
  const prefix = mov({ id: 'a', descripcion: 'luz eléctrica pago' });
  const wordBoundary = mov({ id: 'b', descripcion: 'pago de luz mensual' });

  const result = searchCommands(input('luz', {
    movimientos: [wordBoundary, prefix], // order intentionally reversed
  }));

  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length === 2);
  assert.equal(movGroup!.items[0]!.id, 'a', 'prefix match should rank first');
});

test('word-boundary match ranks before pure substring match', () => {
  const wordBound = mov({ id: 'b', descripcion: 'luz de calle argentina' }); // "luz" at word start
  const substring = mov({ id: 'c', descripcion: 'eléctrica luz interna' });  // "luz" not first word

  const result = searchCommands(input('luz', {
    movimientos: [substring, wordBound], // reversed
  }));

  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length === 2);
  // word-boundary (starts with "luz" OR "luz" at start of a word) should beat mid-word
  assert.equal(movGroup!.items[0]!.id, 'b');
});

// ─── no-match / empty results ────────────────────────────────────────────────

test('non-matching query returns no data groups', () => {
  const result = searchCommands(input('xyzzy-no-match', {
    movimientos: [mov({ descripcion: 'pago de luz' })],
    empresas: [emp({ nombre: 'Telecom' })],
    categorias: [cat({ nombre: 'Servicios' })],
  }));

  const dataGroups = result.filter((g) => g.group !== 'Acciones');
  assert.equal(dataGroups.length, 0, 'no data groups when nothing matches');
});

// ─── per-group cap ───────────────────────────────────────────────────────────

test('movimientos results are capped at MAX per group', () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    mov({ id: String(i), descripcion: `pago número ${i}` }),
  );
  const result = searchCommands(input('pago', { movimientos: many }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined);
  assert.ok(movGroup!.items.length <= 8, `expected ≤8, got ${movGroup!.items.length}`);
});

test('empresas results are capped at MAX per group', () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    emp({ id: String(i), nombre: `empresa test ${i}` }),
  );
  const result = searchCommands(input('empresa', { empresas: many }));
  const empGroup = result.find((g) => g.group === 'Empresas');
  assert.ok(empGroup !== undefined);
  assert.ok(empGroup!.items.length <= 6, `expected ≤6, got ${empGroup!.items.length}`);
});

// ─── grouping ────────────────────────────────────────────────────────────────

test('results are grouped by type', () => {
  const result = searchCommands(input('test', {
    movimientos: [mov({ descripcion: 'test de movimiento' })],
    empresas: [emp({ nombre: 'empresa test' })],
    categorias: [cat({ nombre: 'test category' })],
  }));

  const groups = result.map((g) => g.group);
  assert.ok(groups.includes('Movimientos'), 'should include Movimientos group');
  assert.ok(groups.includes('Empresas'), 'should include Empresas group');
  assert.ok(groups.includes('Categorías'), 'should include Categorías group');
});

test('empty groups are omitted', () => {
  const result = searchCommands(input('telecom', {
    movimientos: [],
    empresas: [emp({ nombre: 'Telecom' })],
    categorias: [],
  }));

  const groups = result.map((g) => g.group);
  assert.ok(!groups.includes('Movimientos'), 'no movimientos → group omitted');
  assert.ok(groups.includes('Empresas'));
  assert.ok(!groups.includes('Categorías'), 'no categorias → group omitted');
});

// ─── quick-action matching ───────────────────────────────────────────────────

test('quick actions match by label', () => {
  const result = searchCommands(input('resumen'));
  const actGroup = result.find((g) => g.group === 'Acciones');
  assert.ok(actGroup !== undefined);
  assert.ok(actGroup!.items.some((i) => i.id === 'goto-resumen'));
});

test('quick actions match by description', () => {
  const result = searchCommands(input('compositor'));
  const actGroup = result.find((g) => g.group === 'Acciones');
  assert.ok(actGroup !== undefined);
  assert.ok(actGroup!.items.some((i) => i.id === 'open-composer'));
});

test('non-matching query returns no quick actions', () => {
  const result = searchCommands(input('xyzzy-no-match'));
  const actGroup = result.find((g) => g.group === 'Acciones');
  assert.equal(actGroup, undefined, 'no matching actions → Acciones group omitted');
});

// ─── result shape ────────────────────────────────────────────────────────────

test('movimiento result has correct shape', () => {
  const m = mov({ descripcion: 'pago de luz', empresa_nombre: 'EDESUR', monto: 4500, tipo: 'egreso', moneda: 'ARS' });
  const result = searchCommands(input('luz', { movimientos: [m] }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.length > 0);
  const item = movGroup!.items[0]!;
  assert.equal(item.id, m.id);
  assert.equal(item.type, 'movimiento');
  assert.ok(item.label.length > 0);
  assert.ok(item.secondary !== undefined); // empresa or meta
});

test('empresa result has correct shape', () => {
  const e = emp({ nombre: 'EDESUR' });
  const result = searchCommands(input('edesur', { empresas: [e] }));
  const empGroup = result.find((g) => g.group === 'Empresas');
  assert.ok(empGroup !== undefined && empGroup.items.length > 0);
  const item = empGroup!.items[0]!;
  assert.equal(item.id, e.id);
  assert.equal(item.type, 'empresa');
  assert.equal(item.label, 'EDESUR');
});

test('categoria result has correct shape', () => {
  const c = cat({ nombre: 'Servicios' });
  const result = searchCommands(input('servicios', { categorias: [c] }));
  const catGroup = result.find((g) => g.group === 'Categorías');
  assert.ok(catGroup !== undefined && catGroup.items.length > 0);
  const item = catGroup!.items[0]!;
  assert.equal(item.id, c.id);
  assert.equal(item.type, 'categoria');
  assert.equal(item.label, 'Servicios');
});

// ─── determinism ─────────────────────────────────────────────────────────────

test('same input produces same output', () => {
  const inp = input('luz', {
    movimientos: [
      mov({ id: '1', descripcion: 'pago de luz' }),
      mov({ id: '2', descripcion: 'luz de emergencia' }),
    ],
  });
  const r1 = searchCommands(inp);
  const r2 = searchCommands(inp);
  assert.deepEqual(r1, r2);
});

// ─── empresa search in movimiento ────────────────────────────────────────────

test('movimiento matches by empresa_nombre too', () => {
  const m = mov({ descripcion: 'boleta mensual', empresa_nombre: 'EDESUR', id: 'ev1' });
  const result = searchCommands(input('edesur', { movimientos: [m] }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.some((i) => i.id === 'ev1'));
});

test('movimiento matches by categoria too', () => {
  const m = mov({ descripcion: 'boleta mensual', categoria: 'Servicios Públicos', id: 'cv1' });
  const result = searchCommands(input('servicios', { movimientos: [m] }));
  const movGroup = result.find((g) => g.group === 'Movimientos');
  assert.ok(movGroup !== undefined && movGroup.items.some((i) => i.id === 'cv1'));
});
