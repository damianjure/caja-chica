import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateInsights,
  type InsightInput,
} from '../src/dashboard/insights';
import type { MonthlySummary, CategorySummary } from '../src/dashboard/summary';

function monthlySummary(overrides: Partial<MonthlySummary>): MonthlySummary {
  return {
    period: '2026-05',
    ingresosArs: 10000,
    gastosArs: 8000,
    netoArs: 2000,
    ingresosUsd: 0,
    gastosUsd: 0,
    netoUsd: 0,
    ...overrides,
  };
}

function categorySummary(overrides: Partial<CategorySummary>): CategorySummary {
  return {
    name: 'Insumos',
    egresoArs: 1000,
    egresoUsd: 0,
    movimientos: 3,
    ...overrides,
  };
}

// -------- generateInsights --------

test('returns empty array when no monthly summaries', () => {
  const result = generateInsights({
    monthlySummaries: [],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  assert.deepEqual(result, []);
});

test('returns empty array when only one period (no comparison possible)', () => {
  const result = generateInsights({
    monthlySummaries: [monthlySummary({ period: '2026-05' })],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  assert.deepEqual(result, []);
});

test('income increase ≥10% triggers insight', () => {
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 11000 }),
      monthlySummary({ period: '2026-04', ingresosArs: 10000 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  assert.equal(result.length, 1);
  assert.ok(result[0]!.includes('ingresos'), `expected 'ingresos' in: ${result[0]}`);
  assert.ok(result[0]!.includes('10%') || result[0]!.includes('11%'), `expected percentage in: ${result[0]}`);
});

test('income decrease ≥10% triggers insight', () => {
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 9000 }),
      monthlySummary({ period: '2026-04', ingresosArs: 10000 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  assert.equal(result.length, 1);
  assert.ok(result[0]!.includes('10%'), `expected '10%' in: ${result[0]}`);
});

test('change below 10% threshold does NOT trigger income insight', () => {
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 10500 }),
      monthlySummary({ period: '2026-04', ingresosArs: 10000 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  // 5% change → below threshold
  assert.deepEqual(result, []);
});

test('expense increase ≥10% triggers insight', () => {
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', gastosArs: 8800 }),
      monthlySummary({ period: '2026-04', gastosArs: 8000 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  assert.equal(result.length, 1);
  assert.ok(result[0]!.toLowerCase().includes('gasto') || result[0]!.toLowerCase().includes('gastaste'), `expected expense reference in: ${result[0]}`);
});

test('at most 3 insights returned', () => {
  // Both income +30% and expenses +30% should trigger insights; categories also
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 13000, gastosArs: 10400, netoArs: 2600 }),
      monthlySummary({ period: '2026-04', ingresosArs: 10000, gastosArs: 8000, netoArs: 2000 }),
    ],
    categorySummaries: [
      categorySummary({ name: 'Movilidad', egresoArs: 2600 }),
      categorySummary({ name: 'Movilidad', egresoArs: 2000 }),
    ],
    currentPeriod: '2026-05',
  });
  assert.ok(result.length <= 3, `got ${result.length} insights: ${result.join(' | ')}`);
});

test('insight text is calm — no exclamation marks', () => {
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 20000 }),
      monthlySummary({ period: '2026-04', ingresosArs: 10000 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  result.forEach((text) => {
    assert.ok(!text.includes('!'), `insight should not include '!': ${text}`);
  });
});

test('category expense increase ≥10% triggers category insight', () => {
  // current period top category > prev period same category by ≥10%
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05' }),
      monthlySummary({ period: '2026-04' }),
    ],
    categorySummaries: [
      categorySummary({ name: 'Movilidad', egresoArs: 1500 }),
    ],
    prevCategorySummaries: [
      categorySummary({ name: 'Movilidad', egresoArs: 1000 }),
    ],
    currentPeriod: '2026-05',
  });
  assert.equal(result.length, 1);
  assert.ok(result[0]!.includes('Movilidad'), `expected 'Movilidad' in: ${result[0]}`);
});

test('category with tiny absolute amount skipped even if big % change', () => {
  // 500 ARS total is below minimum absolute threshold
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05' }),
      monthlySummary({ period: '2026-04' }),
    ],
    categorySummaries: [
      categorySummary({ name: 'Pequeño', egresoArs: 500 }),
    ],
    prevCategorySummaries: [
      categorySummary({ name: 'Pequeño', egresoArs: 100 }),
    ],
    currentPeriod: '2026-05',
  });
  // 400% change but tiny absolute — should be skipped
  assert.deepEqual(result, []);
});

test('no insight when both periods have zero income', () => {
  const result = generateInsights({
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 0, gastosArs: 0 }),
      monthlySummary({ period: '2026-04', ingresosArs: 0, gastosArs: 0 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  });
  assert.deepEqual(result, []);
});

test('insights are deterministic for same input', () => {
  const input: InsightInput = {
    monthlySummaries: [
      monthlySummary({ period: '2026-05', ingresosArs: 15000 }),
      monthlySummary({ period: '2026-04', ingresosArs: 10000 }),
    ],
    categorySummaries: [],
    currentPeriod: '2026-05',
  };
  const r1 = generateInsights(input);
  const r2 = generateInsights(input);
  assert.deepEqual(r1, r2);
});
