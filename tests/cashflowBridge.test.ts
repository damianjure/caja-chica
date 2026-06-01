import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCashflowBridge } from '../src/dashboard/summary';

function mov(over: Partial<any>): any {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: '2026-05-15T12:00:00.000Z',
    empresa_nombre: 'Acme',
    tipo: 'egreso',
    moneda: 'ARS',
    monto: 100,
    categoria: 'Varios',
    descripcion: 'd',
    ...over,
  };
}

test('buildCashflowBridge: ingresos start, categorías down, saldo end', () => {
  const h = [
    mov({ tipo: 'ingreso', monto: 1000 }),
    mov({ tipo: 'egreso', monto: 300, categoria: 'Alquiler' }),
    mov({ tipo: 'egreso', monto: 100, categoria: 'Servicios' }),
  ];
  const segs = buildCashflowBridge(h, 'ARS');
  assert.equal(segs[0].kind, 'start');
  assert.equal(segs[0].value, 1000);
  assert.equal(segs[segs.length - 1].kind, 'end');
  assert.equal(segs[segs.length - 1].value, 600); // 1000 - 400
  const alquiler = segs.find((s) => s.label === 'Alquiler')!;
  assert.equal(alquiler.kind, 'down');
  assert.equal(alquiler.from, 1000);
  assert.equal(alquiler.to, 700);
});

test('buildCashflowBridge: top N + Otros agrupa el resto', () => {
  const h = [
    mov({ tipo: 'ingreso', monto: 1000 }),
    mov({ tipo: 'egreso', monto: 50, categoria: 'A' }),
    mov({ tipo: 'egreso', monto: 40, categoria: 'B' }),
    mov({ tipo: 'egreso', monto: 30, categoria: 'C' }),
  ];
  const segs = buildCashflowBridge(h, 'ARS', null, 2);
  assert.ok(segs.some((s) => s.label === 'Otros' && s.value === 30));
});

test('buildCashflowBridge: filtra por empresa', () => {
  const h = [
    mov({ empresa_nombre: 'Acme', tipo: 'ingreso', monto: 1000 }),
    mov({ empresa_nombre: 'Beta', tipo: 'ingreso', monto: 500 }),
  ];
  assert.equal(buildCashflowBridge(h, 'ARS')[0].value, 1500);
  assert.equal(buildCashflowBridge(h, 'ARS', ['Acme'])[0].value, 1000);
});

test('buildCashflowBridge: respeta la moneda', () => {
  const h = [mov({ moneda: 'USD', tipo: 'ingreso', monto: 50 }), mov({ moneda: 'ARS', tipo: 'ingreso', monto: 9999 })];
  assert.equal(buildCashflowBridge(h, 'USD')[0].value, 50);
});

test('buildCashflowBridge: sin data → []', () => {
  assert.deepEqual(buildCashflowBridge([], 'ARS'), []);
});

test('buildCashflowBridge: saldo negativo cuando gastos > ingresos', () => {
  const h = [mov({ tipo: 'ingreso', monto: 100 }), mov({ tipo: 'egreso', monto: 300, categoria: 'X' })];
  const segs = buildCashflowBridge(h, 'ARS');
  assert.equal(segs[segs.length - 1].value, -200);
});
