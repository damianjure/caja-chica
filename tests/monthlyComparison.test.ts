import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMonthlyComparison, buildCurrentMonthComparison, formatMonthName } from '../src/dashboard/summary';

function sum(over: Partial<any>): any {
  return { period: '2026-05', ingresosArs: 0, gastosArs: 0, netoArs: 0, ingresosUsd: 0, gastosUsd: 0, netoUsd: 0, ...over };
}

test('buildMonthlyComparison: delta % ARS vs mes anterior', () => {
  const cur = sum({ period: '2026-06', ingresosArs: 1100, gastosArs: 800, netoArs: 300 });
  const prev = sum({ period: '2026-05', ingresosArs: 1000, gastosArs: 1000, netoArs: 0 });
  const c = buildMonthlyComparison([cur, prev], 'ARS');
  assert.equal(c.hasPrev, true);
  assert.equal(c.ingresos.deltaPct, 10); // 1100 vs 1000
  assert.equal(c.ingresos.isNew, false);
  assert.equal(c.ingresos.current, 1100);
  assert.equal(c.gastos.deltaPct, -20); // 800 vs 1000
  assert.equal(c.gastos.isNew, false);
  assert.equal(c.utilidad.deltaPct, null); // prev neto 0 → null
  assert.equal(c.utilidad.isNew, true); // base~0, prev exists, current 300 > 0
});

test('buildMonthlyComparison: sin mes previo → hasPrev false, deltas null', () => {
  const c = buildMonthlyComparison([sum({ ingresosArs: 500 })], 'ARS');
  assert.equal(c.hasPrev, false);
  assert.equal(c.ingresos.deltaPct, null);
  assert.equal(c.ingresos.current, 500);
});

test('buildMonthlyComparison: respeta moneda USD', () => {
  const cur = sum({ ingresosUsd: 200 });
  const prev = sum({ ingresosUsd: 100 });
  const c = buildMonthlyComparison([cur, prev], 'USD');
  assert.equal(c.ingresos.current, 200);
  assert.equal(c.ingresos.deltaPct, 100);
});

test('buildMonthlyComparison: utilidad negativa vs positiva', () => {
  const cur = sum({ period: '2026-06', netoArs: -200 });
  const prev = sum({ period: '2026-05', netoArs: 300 });
  const c = buildMonthlyComparison([cur, prev], 'ARS');
  // (-200 - 300) / |300| = -166.67 → -167
  assert.equal(c.utilidad.deltaPct, -167);
  assert.equal(c.utilidad.isNew, false);
  assert.equal(c.utilidad.current, -200);
});

test('buildMonthlyComparison: base ~0 → isNew true, sin porcentaje explosivo', () => {
  // prev month had nearly nothing, current has real values → should show "nuevo", not ▲1863%
  const cur = sum({ period: '2026-06', ingresosArs: 18630 });
  const prev = sum({ period: '2026-05', ingresosArs: 0 });
  const c = buildMonthlyComparison([cur, prev], 'ARS');
  assert.equal(c.ingresos.deltaPct, null); // no percentage shown
  assert.equal(c.ingresos.isNew, true);    // "nuevo" label shown instead
});

test('buildMonthlyComparison: sin mes previo → isNew false', () => {
  const c = buildMonthlyComparison([sum({ ingresosArs: 500 })], 'ARS');
  assert.equal(c.ingresos.isNew, false); // no prev month → not "new", just missing data
});

// ---------------------------------------------------------------------------
// buildCurrentMonthComparison — Resumen "del mes" cards use the calendar month
// ---------------------------------------------------------------------------

function mov(tipo: 'ingreso' | 'egreso', monto: number, year: number, month: number, moneda: 'ARS' | 'USD' = 'ARS'): any {
  // month is 1-based; noon local time avoids timezone edge effects
  return { tipo, monto, moneda, created_at: new Date(year, month - 1, 15, 12).toISOString() };
}

const OCT_2026 = new Date(2026, 9, 20, 12);

test('buildCurrentMonthComparison: current calendar month vs previous calendar month', () => {
  const history = [
    mov('ingreso', 100, 2026, 10),
    mov('egreso', 40, 2026, 10),
    mov('ingreso', 50, 2026, 9),
    mov('egreso', 80, 2026, 9),
    mov('ingreso', 1000, 2026, 6), // older month with data must not count
  ];
  const c = buildCurrentMonthComparison(history, 'ARS', OCT_2026);
  assert.equal(c.period, '2026-10');
  assert.equal(c.prevPeriod, '2026-09');
  assert.equal(c.hasCurrentData, true);
  assert.equal(c.ingresos.current, 100);
  assert.equal(c.ingresos.deltaPct, 100); // 100 vs 50
  assert.equal(c.gastos.current, 40);
  assert.equal(c.gastos.deltaPct, -50); // 40 vs 80
});

test('buildCurrentMonthComparison: current month without movements is an explicit empty state', () => {
  const history = [mov('ingreso', 50, 2026, 9), mov('egreso', 80, 2026, 9)];
  const c = buildCurrentMonthComparison(history, 'ARS', OCT_2026);
  assert.equal(c.hasCurrentData, false);
  assert.equal(c.ingresos.current, 0);
  assert.equal(c.gastos.current, 0);
});

test('buildCurrentMonthComparison: previous calendar month empty → no delta even if older months have data', () => {
  const history = [mov('ingreso', 100, 2026, 10), mov('ingreso', 999, 2026, 6)];
  const c = buildCurrentMonthComparison(history, 'ARS', OCT_2026);
  assert.equal(c.hasPrev, false);
  assert.equal(c.ingresos.deltaPct, null);
  assert.equal(c.ingresos.isNew, false);
});

test('buildCurrentMonthComparison: January compares against December of the previous year', () => {
  const history = [mov('ingreso', 300, 2027, 1), mov('ingreso', 100, 2026, 12)];
  const c = buildCurrentMonthComparison(history, 'ARS', new Date(2027, 0, 10, 12));
  assert.equal(c.period, '2027-01');
  assert.equal(c.prevPeriod, '2026-12');
  assert.equal(c.ingresos.deltaPct, 200);
});

test('buildCurrentMonthComparison: respects currency', () => {
  const history = [mov('ingreso', 100, 2026, 10, 'ARS'), mov('ingreso', 7, 2026, 10, 'USD')];
  const c = buildCurrentMonthComparison(history, 'USD', OCT_2026);
  assert.equal(c.ingresos.current, 7);
});

test('formatMonthName: Spanish month name from YYYY-MM', () => {
  assert.equal(formatMonthName('2026-10'), 'octubre');
  assert.equal(formatMonthName('2027-01'), 'enero');
});
