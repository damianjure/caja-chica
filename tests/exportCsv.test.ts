import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMovimientosCsv } from '../src/dashboard/exportCsv';

function mov(over: Partial<any>): any {
  return {
    id: 'm1',
    created_at: '2026-05-15T10:00:00.000Z',
    tipo: 'egreso',
    empresa_nombre: 'Acme',
    categoria: 'Servicios',
    descripcion: 'luz',
    monto: 4500,
    moneda: 'ARS',
    ...over,
  };
}

test('buildMovimientosCsv: header + fila con campos clave', () => {
  const csv = buildMovimientosCsv([mov({})]);
  const [header, row] = csv.split('\n');
  assert.match(header, /Fecha/);
  assert.match(header, /Monto/);
  assert.match(header, /Moneda/);
  assert.match(row, /2026-05-15/);
  assert.match(row, /4500/);
  assert.match(row, /ARS/);
  assert.match(row, /Acme/);
});

test('buildMovimientosCsv: escapa comas y comillas (CSV RFC)', () => {
  const csv = buildMovimientosCsv([mov({ empresa_nombre: 'Acme, SA', descripcion: 'luz "edenor"' })]);
  // campo con coma → entre comillas
  assert.match(csv, /"Acme, SA"/);
  // comillas internas → duplicadas
  assert.match(csv, /"luz ""edenor"""/);
});

test('buildMovimientosCsv: vacío → solo header', () => {
  const csv = buildMovimientosCsv([]);
  assert.equal(csv.split('\n').length, 1);
  assert.match(csv, /Fecha/);
});

test('buildMovimientosCsv: tipo ingreso/egreso legible', () => {
  const csv = buildMovimientosCsv([mov({ tipo: 'ingreso' }), mov({ tipo: 'egreso' })]);
  assert.match(csv, /Ingreso/);
  assert.match(csv, /Gasto/);
});

// ---------------------------------------------------------------------------
// Review 2026-06-09: CSV formula injection guard (frontend + server builders)
// ---------------------------------------------------------------------------

import { buildReportCsv } from '../src/server/reportExports';

test('buildMovimientosCsv: neutraliza fórmulas Excel en celdas de texto', () => {
  const csv = buildMovimientosCsv([mov({ descripcion: '=HYPERLINK("http://evil","x")' })]);
  assert.match(csv, /'=HYPERLINK/);
});

test('buildMovimientosCsv: no toca números (montos) ni texto normal', () => {
  const csv = buildMovimientosCsv([mov({ monto: 4500, descripcion: 'luz' })]);
  assert.doesNotMatch(csv, /'4500/);
  assert.match(csv, /luz/);
});

test('buildReportCsv (server): neutraliza fórmulas y respeta números negativos', () => {
  const csv = buildReportCsv([
    {
      created_at: '2026-05-15T10:00:00.000Z',
      tipo: 'egreso',
      moneda: 'ARS',
      monto: -4500,
      categoria: '@SUM(A1)',
      empresa_nombre: '+cmd|calc',
      descripcion: '=1+1',
    } as any,
  ]).toString('utf8');
  assert.match(csv, /'@SUM\(A1\)/);
  assert.match(csv, /'\+cmd\|calc/);
  assert.match(csv, /'=1\+1/);
  assert.doesNotMatch(csv, /'-4500/, 'numeric cells must stay numeric');
  assert.match(csv, /-4500/);
});
