import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterMovements,
  INCOME_TAG_LIBRARY,
  getCategorySummaries,
  getCompanySummaries,
  getCurrencyTotals,
  getIncomeSummaries,
  getIncomeTagSummaries,
  getMonthlySummaries,
  getRecentIncomes,
  getRecentExpenses,
  getCurrentPeriod,
} from '../src/dashboard/summary';
import type { Movimiento } from '../src/services/api';

function movement(overrides: Partial<Movimiento>): Movimiento {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    created_at: overrides.created_at ?? '2026-05-01T12:00:00.000Z',
    tipo: overrides.tipo ?? 'ingreso',
    moneda: overrides.moneda ?? 'ARS',
    monto: overrides.monto ?? 0,
    categoria: overrides.categoria ?? 'General',
    empresa_nombre: overrides.empresa_nombre ?? 'Personal',
    descripcion: overrides.descripcion ?? 'Test',
    original_text: overrides.original_text ?? 'test',
    conciliado: overrides.conciliado,
    conciliado_at: overrides.conciliado_at,
    conciliado_notas: overrides.conciliado_notas,
  };
}

test('agrega totales por moneda y neto correctamente', () => {
  const history = [
    movement({ tipo: 'ingreso', moneda: 'ARS', monto: 1000 }),
    movement({ tipo: 'egreso', moneda: 'ARS', monto: 300 }),
    movement({ tipo: 'ingreso', moneda: 'USD', monto: 50 }),
  ];

  assert.deepEqual(getCurrencyTotals(history, 'ARS'), {
    ingreso: 1000,
    egreso: 300,
    neto: 700,
  });

  assert.deepEqual(getCurrencyTotals(history, 'USD'), {
    ingreso: 50,
    egreso: 0,
    neto: 50,
  });
});

test('agrupa empresas y ordena por saldo total descendente', () => {
  const history = [
    movement({ empresa_nombre: 'Taller', tipo: 'ingreso', moneda: 'ARS', monto: 1000 }),
    movement({ empresa_nombre: 'Taller', tipo: 'egreso', moneda: 'ARS', monto: 100 }),
    movement({ empresa_nombre: 'Casa', tipo: 'ingreso', moneda: 'ARS', monto: 200 }),
  ];

  const summaries = getCompanySummaries(history);

  assert.equal(summaries[0]?.name, 'Taller');
  assert.equal(summaries[0]?.saldoArs, 900);
  assert.equal(summaries[1]?.name, 'Casa');
});

test('agrupa gastos por categoría y cuenta movimientos', () => {
  const history = [
    movement({ tipo: 'egreso', moneda: 'ARS', categoria: 'Insumos', monto: 500 }),
    movement({ tipo: 'egreso', moneda: 'ARS', categoria: 'Insumos', monto: 300 }),
    movement({ tipo: 'ingreso', moneda: 'ARS', categoria: 'Ventas', monto: 900 }),
  ];

  const summaries = getCategorySummaries(history);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.name, 'Insumos');
  assert.equal(summaries[0]?.egresoArs, 800);
  assert.equal(summaries[0]?.movimientos, 2);
});

test('permite filtrar gastos por empresa dentro de la misma vista', () => {
  const history = [
    movement({ tipo: 'egreso', moneda: 'ARS', categoria: 'Insumos', empresa_nombre: 'Taller Centro', monto: 500 }),
    movement({ tipo: 'egreso', moneda: 'ARS', categoria: 'Insumos', empresa_nombre: 'Servicios Delta', monto: 300 }),
    movement({ tipo: 'egreso', moneda: 'ARS', categoria: 'Logística', empresa_nombre: 'Taller Centro', monto: 200 }),
  ];

  const summaries = getCategorySummaries(history, 'Taller Centro');

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.name, 'Insumos');
  assert.equal(summaries[0]?.egresoArs, 500);
  assert.equal(summaries[1]?.name, 'Logística');
});

test('agrupa ingresos por empresa o descripción visible', () => {
  const history = [
    movement({ tipo: 'ingreso', moneda: 'ARS', empresa_nombre: 'Cliente A', monto: 800 }),
    movement({ tipo: 'ingreso', moneda: 'USD', empresa_nombre: '', descripcion: 'Venta externa', monto: 30 }),
  ];

  const summaries = getIncomeSummaries(history);

  assert.equal(summaries[0]?.name, 'Cliente A');
  assert.equal(summaries[0]?.ars, 800);
  assert.equal(summaries[1]?.name, 'Venta externa');
  assert.equal(summaries[1]?.usd, 30);
});

test('detecta etiquetas frecuentes para ingresos según descripción y origen', () => {
  const history = [
    movement({ tipo: 'ingreso', moneda: 'ARS', empresa_nombre: 'Mercado Libre', descripcion: 'venta online cobro cliente', monto: 1000 }),
    movement({ tipo: 'ingreso', moneda: 'ARS', empresa_nombre: 'Taller Centro', descripcion: 'servicio técnico mantenimiento', monto: 500 }),
    movement({ tipo: 'ingreso', moneda: 'ARS', empresa_nombre: 'Banco Galicia', descripcion: 'transferencia recibida', monto: 300 }),
  ];

  const summaries = getIncomeTagSummaries(history);

  assert.deepEqual(
    summaries.slice(0, 4).map((item) => item.label),
    ['Venta online', 'Cobro de cliente', 'Servicio técnico', 'Mantenimiento'],
  );
  assert.equal(INCOME_TAG_LIBRARY.length, 10);
});

test('resume evolución mensual en ARS y limita a 6 períodos', () => {
  const history = Array.from({ length: 7 }, (_, index) =>
    movement({
      created_at: `2026-0${(index % 7) + 1}-10T12:00:00.000Z`,
      tipo: index % 2 === 0 ? 'ingreso' : 'egreso',
      moneda: 'ARS',
      monto: 100 + index,
    }),
  );

  const summaries = getMonthlySummaries(history);

  assert.equal(summaries.length, 6);
  assert.equal(summaries[0]?.period, '2026-07');
  assert.equal(summaries.at(-1)?.period, '2026-02');
});

test('resume evolución mensual también en USD sin mezclar monedas', () => {
  const history = [
    movement({ created_at: '2026-05-10T12:00:00.000Z', tipo: 'ingreso', moneda: 'USD', monto: 120 }),
    movement({ created_at: '2026-05-12T12:00:00.000Z', tipo: 'egreso', moneda: 'USD', monto: 20 }),
    movement({ created_at: '2026-05-14T12:00:00.000Z', tipo: 'ingreso', moneda: 'ARS', monto: 1000 }),
  ];

  const summaries = getMonthlySummaries(history);

  assert.equal(summaries[0]?.ingresosUsd, 120);
  assert.equal(summaries[0]?.gastosUsd, 20);
  assert.equal(summaries[0]?.netoUsd, 100);
  assert.equal(summaries[0]?.ingresosArs, 1000);
});

test('devuelve los últimos gastos respetando el filtro de empresa', () => {
  const history = [
    movement({ id: '1', tipo: 'egreso', empresa_nombre: 'Taller Centro', descripcion: 'Nafta', created_at: '2026-05-12T12:00:00.000Z' }),
    movement({ id: '2', tipo: 'egreso', empresa_nombre: 'Servicios Delta', descripcion: 'Impuesto', created_at: '2026-05-13T12:00:00.000Z' }),
    movement({ id: '3', tipo: 'egreso', empresa_nombre: 'Taller Centro', descripcion: 'Proveedor', created_at: '2026-05-14T12:00:00.000Z' }),
    movement({ id: '4', tipo: 'ingreso', empresa_nombre: 'Taller Centro', descripcion: 'Cobro', created_at: '2026-05-15T12:00:00.000Z' }),
  ];

  const recent = getRecentExpenses(history, 'Taller Centro', 5);

  assert.deepEqual(recent.map((item) => item.id), ['3', '1']);
});

test('devuelve los últimos ingresos ordenados del más nuevo al más viejo', () => {
  const history = [
    movement({ id: '1', tipo: 'ingreso', empresa_nombre: 'Taller Centro', descripcion: 'Cobro 1', created_at: '2026-05-12T12:00:00.000Z' }),
    movement({ id: '2', tipo: 'ingreso', empresa_nombre: 'Servicios Delta', descripcion: 'Cobro 2', created_at: '2026-05-13T12:00:00.000Z' }),
    movement({ id: '3', tipo: 'egreso', empresa_nombre: 'Taller Centro', descripcion: 'Compra', created_at: '2026-05-14T12:00:00.000Z' }),
    movement({ id: '4', tipo: 'ingreso', empresa_nombre: 'Distribuidora Norte', descripcion: 'Cobro 3', created_at: '2026-05-15T12:00:00.000Z' }),
  ];

  const recent = getRecentIncomes(history, 5);

  assert.deepEqual(recent.map((item) => item.id), ['4', '2', '1']);
});

test('combina filtros de movimientos por empresa, tipo y moneda', () => {
  const history = [
    movement({ id: '1', tipo: 'ingreso', moneda: 'ARS', empresa_nombre: 'Taller Centro' }),
    movement({ id: '2', tipo: 'egreso', moneda: 'ARS', empresa_nombre: 'Taller Centro' }),
    movement({ id: '3', tipo: 'egreso', moneda: 'USD', empresa_nombre: 'Taller Centro' }),
    movement({ id: '4', tipo: 'egreso', moneda: 'USD', empresa_nombre: 'Servicios Delta' }),
  ];

  const filtered = filterMovements(history, {
    company: 'Taller Centro',
    tipo: 'egreso',
    moneda: 'USD',
  });

  assert.deepEqual(filtered.map((item) => item.id), ['3']);
});

test('normaliza período actual en formato YYYY-MM', () => {
  assert.equal(getCurrentPeriod(new Date('2026-01-03T10:00:00.000Z')), '2026-01');
});
