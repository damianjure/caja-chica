import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMonthlyChartData } from '../src/dashboard/summary';

function mov(over: Partial<any>): any {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-05-15T12:00:00.000Z',
    empresa_nombre: 'Acme',
    tipo: 'egreso',
    moneda: 'ARS',
    monto: 100,
    categoria: 'X',
    descripcion: 'd',
    ...over,
  };
}

test('buildMonthlyChartData: agrega por mes en ARS', () => {
  const h = [mov({ tipo: 'ingreso', monto: 1000 }), mov({ tipo: 'egreso', monto: 300 })];
  const d = buildMonthlyChartData(h, 'ARS');
  assert.equal(d.length, 1);
  assert.equal(d[0].income, 1000);
  assert.equal(d[0].expense, 300);
  assert.equal(d[0].net, 700);
  assert.equal(d[0].label, '05');
});

test('buildMonthlyChartData: filtra por empresa', () => {
  const h = [mov({ empresa_nombre: 'Acme', tipo: 'ingreso', monto: 1000 }), mov({ empresa_nombre: 'Beta', tipo: 'ingreso', monto: 500 })];
  assert.equal(buildMonthlyChartData(h, 'ARS')[0].income, 1500);
  assert.equal(buildMonthlyChartData(h, 'ARS', ['Acme'])[0].income, 1000);
  assert.equal(buildMonthlyChartData(h, 'ARS', ['Beta'])[0].income, 500);
});

test('buildMonthlyChartData: companies vacío = todas', () => {
  const h = [mov({ tipo: 'ingreso', monto: 200 })];
  assert.equal(buildMonthlyChartData(h, 'ARS', [])[0].income, 200);
});

test('buildMonthlyChartData: USD separa moneda', () => {
  const h = [mov({ moneda: 'USD', tipo: 'ingreso', monto: 50 }), mov({ moneda: 'ARS', tipo: 'ingreso', monto: 9999 })];
  const usd = buildMonthlyChartData(h, 'USD');
  assert.equal(usd[0].income, 50);
});

test("buildMonthlyChartData: empresa sin nombre cae en 'Personal'", () => {
  const h = [mov({ empresa_nombre: '', tipo: 'ingreso', monto: 300 })];
  assert.equal(buildMonthlyChartData(h, 'ARS', ['Personal'])[0]?.income, 300);
});

test('buildMonthlyChartData: descarta meses sin movimiento', () => {
  assert.deepEqual(buildMonthlyChartData([], 'ARS'), []);
});
