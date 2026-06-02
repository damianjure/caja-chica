import test from 'node:test';
import assert from 'node:assert/strict';

import { getCompanySummaries } from '../src/dashboard/summary';

function mov(over: Partial<any>): any {
  return { empresa_nombre: 'Taller', tipo: 'ingreso', moneda: 'ARS', monto: 100, ...over };
}

test('getCompanySummaries: empresa extra sin movimientos aparece con ceros', () => {
  const res = getCompanySummaries([mov({})], ['Nueva SA']);
  const nueva = res.find((c) => c.name === 'Nueva SA');
  assert.ok(nueva, 'la empresa nueva debe aparecer');
  assert.equal(nueva!.movimientos, 0);
  assert.equal(nueva!.ingresosArs, 0);
  assert.equal(nueva!.saldoArs, 0);
});

test('getCompanySummaries: extra duplicada de una con movimientos no pisa los totales', () => {
  const res = getCompanySummaries([mov({ empresa_nombre: 'Taller', monto: 500 })], ['Taller']);
  const taller = res.filter((c) => c.name === 'Taller');
  assert.equal(taller.length, 1);
  assert.equal(taller[0].ingresosArs, 500);
  assert.equal(taller[0].movimientos, 1);
});

test('getCompanySummaries: sin extras se comporta igual que antes', () => {
  const res = getCompanySummaries([mov({})]);
  assert.equal(res.length, 1);
});
