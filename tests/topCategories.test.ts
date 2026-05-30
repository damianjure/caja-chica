import test from 'node:test';
import assert from 'node:assert/strict';

import { topCategoriesByType } from '../src/dashboard/summary';

function mov(over: Partial<any>): any {
  return { empresa_nombre: 'Acme', categoria: 'Servicios', tipo: 'egreso', moneda: 'ARS', monto: 1000, ...over };
}

test('topCategoriesByType: agrupa por categoría y suma, top N por ARS desc', () => {
  const h = [
    mov({ categoria: 'Combustible', monto: 5000 }),
    mov({ categoria: 'Combustible', monto: 3000 }),
    mov({ categoria: 'Servicios', monto: 2000 }),
    mov({ categoria: 'Sueldos', monto: 1000 }),
    mov({ categoria: 'Comida', monto: 500 }),
  ];
  const top = topCategoriesByType(h, 'all', 'egreso', 3);
  assert.equal(top.length, 3);
  assert.equal(top[0].category, 'Combustible');
  assert.equal(top[0].ars, 8000);
  assert.equal(top[1].category, 'Servicios');
  assert.equal(top[2].category, 'Sueldos');
});

test('topCategoriesByType: filtra por empresa', () => {
  const h = [
    mov({ empresa_nombre: 'Acme', categoria: 'Combustible', monto: 5000 }),
    mov({ empresa_nombre: 'Otra', categoria: 'Combustible', monto: 9000 }),
  ];
  const top = topCategoriesByType(h, 'Acme', 'egreso', 3);
  assert.equal(top.length, 1);
  assert.equal(top[0].ars, 5000);
});

test('topCategoriesByType: filtra por tipo (ingreso vs egreso)', () => {
  const h = [
    mov({ tipo: 'ingreso', categoria: 'Ventas', monto: 7000 }),
    mov({ tipo: 'egreso', categoria: 'Combustible', monto: 3000 }),
  ];
  assert.equal(topCategoriesByType(h, 'all', 'ingreso', 3)[0].category, 'Ventas');
  assert.equal(topCategoriesByType(h, 'all', 'egreso', 3)[0].category, 'Combustible');
});

test('topCategoriesByType: categoría vacía → Otros, separa USD', () => {
  const h = [
    mov({ categoria: '', monto: 100, moneda: 'USD' }),
    mov({ categoria: null, monto: 50, moneda: 'USD' }),
  ];
  const top = topCategoriesByType(h, 'all', 'egreso', 3);
  assert.equal(top[0].category, 'Otros');
  assert.equal(top[0].usd, 150);
  assert.equal(top[0].ars, 0);
});
