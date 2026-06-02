import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMonthlyComparison } from '../src/dashboard/summary';

function sum(over: Partial<any>): any {
  return { period: '2026-05', ingresosArs: 0, gastosArs: 0, netoArs: 0, ingresosUsd: 0, gastosUsd: 0, netoUsd: 0, ...over };
}

test('buildMonthlyComparison: delta % ARS vs mes anterior', () => {
  const cur = sum({ period: '2026-06', ingresosArs: 1100, gastosArs: 800, netoArs: 300 });
  const prev = sum({ period: '2026-05', ingresosArs: 1000, gastosArs: 1000, netoArs: 0 });
  const c = buildMonthlyComparison([cur, prev], 'ARS');
  assert.equal(c.hasPrev, true);
  assert.equal(c.ingresos.deltaPct, 10); // 1100 vs 1000
  assert.equal(c.ingresos.current, 1100);
  assert.equal(c.gastos.deltaPct, -20); // 800 vs 1000
  assert.equal(c.utilidad.deltaPct, null); // prev neto 0 → null
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
  assert.equal(c.utilidad.current, -200);
});
