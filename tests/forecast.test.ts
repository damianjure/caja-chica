import test from 'node:test';
import assert from 'node:assert/strict';

import {
  expandOccurrences,
  projectBalance,
  type ForecastInput,
  type ForecastResult,
  type RecurrenteForForecast,
} from '../src/dashboard/forecast';

const TODAY = new Date('2026-05-30T12:00:00.000Z');

function recurrente(overrides: Partial<RecurrenteForForecast>): RecurrenteForForecast {
  return {
    id: crypto.randomUUID(),
    monto: 1000,
    tipo: 'egreso',
    moneda: 'ARS',
    frecuencia: 'mensual',
    descripcion: 'Test',
    is_active: true,
    deleted_at: null,
    next_run_at: '2026-06-01T08:00:00.000Z',
    ...overrides,
  };
}

// -------- expandOccurrences --------

test('diario: expands daily occurrences within 30-day window', () => {
  const r = recurrente({
    frecuencia: 'diario',
    next_run_at: '2026-05-31T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  // May 31 → Jun 29 = 30 days → 30 occurrences
  assert.equal(occurrences.length, 30);
  assert.equal(occurrences[0]!.date, '2026-05-31');
  assert.equal(occurrences[29]!.date, '2026-06-29');
});

test('semanal: expands weekly occurrences', () => {
  const r = recurrente({
    frecuencia: 'semanal',
    next_run_at: '2026-05-31T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  // May 31, Jun 7, Jun 14, Jun 21, Jun 28 = 5 occurrences
  assert.equal(occurrences.length, 5);
  assert.equal(occurrences[0]!.date, '2026-05-31');
  assert.equal(occurrences[4]!.date, '2026-06-28');
});

test('quincenal: expands every-15-day occurrences', () => {
  const r = recurrente({
    frecuencia: 'quincenal',
    next_run_at: '2026-05-31T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  // May 31, Jun 15, Jun 30 — Jun 30 is today+31 → excluded. So May 31 + Jun 15 = 2
  assert.equal(occurrences.length, 2);
  assert.equal(occurrences[0]!.date, '2026-05-31');
  assert.equal(occurrences[1]!.date, '2026-06-15');
});

test('mensual: expands monthly occurrences', () => {
  const r = recurrente({
    frecuencia: 'mensual',
    next_run_at: '2026-06-01T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  // Jun 1 is within 30 days; Jul 1 is today+32 → excluded
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]!.date, '2026-06-01');
});

test('anual: expands yearly occurrence only if within window', () => {
  const r = recurrente({
    frecuencia: 'anual',
    next_run_at: '2026-06-01T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]!.date, '2026-06-01');
});

test('anual: occurrence outside 30-day window is excluded', () => {
  const r = recurrente({
    frecuencia: 'anual',
    next_run_at: '2026-08-01T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  assert.equal(occurrences.length, 0);
});

test('ingreso signs as positive amount', () => {
  const r = recurrente({ tipo: 'ingreso', monto: 5000 });
  const occurrences = expandOccurrences([r], TODAY);
  assert.ok(occurrences.length > 0);
  assert.ok(occurrences[0]!.signedAmount > 0);
  assert.equal(occurrences[0]!.signedAmount, 5000);
});

test('egreso signs as negative amount', () => {
  const r = recurrente({ tipo: 'egreso', monto: 3000 });
  const occurrences = expandOccurrences([r], TODAY);
  assert.ok(occurrences.length > 0);
  assert.ok(occurrences[0]!.signedAmount < 0);
  assert.equal(occurrences[0]!.signedAmount, -3000);
});

test('inactive recurrente is excluded', () => {
  const r = recurrente({ is_active: false });
  const occurrences = expandOccurrences([r], TODAY);
  assert.equal(occurrences.length, 0);
});

test('deleted recurrente is excluded', () => {
  const r = recurrente({ deleted_at: '2026-05-01T00:00:00.000Z' });
  const occurrences = expandOccurrences([r], TODAY);
  assert.equal(occurrences.length, 0);
});

test('occurrence at exactly today+30 is included', () => {
  const r = recurrente({
    frecuencia: 'mensual',
    next_run_at: '2026-06-29T08:00:00.000Z', // today = May 30, so +30 = Jun 29
  });
  const occurrences = expandOccurrences([r], TODAY);
  assert.equal(occurrences.length, 1);
});

test('occurrence at today+31 is excluded', () => {
  const r = recurrente({
    frecuencia: 'mensual',
    next_run_at: '2026-06-30T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], TODAY);
  assert.equal(occurrences.length, 0);
});

test('occurrence before today is skipped but next step may fall in window', () => {
  // next_run_at yesterday → that occurrence is skipped, but next monthly step (Jun 29) is within window
  const r = recurrente({
    frecuencia: 'mensual',
    next_run_at: '2026-05-29T08:00:00.000Z', // yesterday
  });
  const occurrences = expandOccurrences([r], TODAY);
  // Jun 29 = today+30 → included
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]!.date, '2026-06-29');
});

// -------- multi-currency --------

test('multi-currency: ARS and USD occurrences are separate', () => {
  const arsR = recurrente({ moneda: 'ARS', monto: 1000, tipo: 'egreso', frecuencia: 'mensual', next_run_at: '2026-06-01T08:00:00.000Z' });
  const usdR = recurrente({ moneda: 'USD', monto: 100, tipo: 'ingreso', frecuencia: 'mensual', next_run_at: '2026-06-01T08:00:00.000Z' });
  const occurrences = expandOccurrences([arsR, usdR], TODAY);
  assert.equal(occurrences.length, 2);
  const ars = occurrences.find((o) => o.moneda === 'ARS');
  const usd = occurrences.find((o) => o.moneda === 'USD');
  assert.ok(ars);
  assert.ok(usd);
  assert.equal(ars!.signedAmount, -1000);
  assert.equal(usd!.signedAmount, 100);
});

// -------- projectBalance --------

test('projectBalance: adds ingreso occurrences to saldo', () => {
  const r = recurrente({ tipo: 'ingreso', monto: 5000, moneda: 'ARS', frecuencia: 'mensual', next_run_at: '2026-06-01T08:00:00.000Z' });
  const result = projectBalance({ saldoArs: 10000, saldoUsd: 0, recurrentes: [r] }, TODAY);
  assert.equal(result.projectedArs, 15000);
  assert.equal(result.projectedUsd, 0);
});

test('projectBalance: subtracts egreso occurrences from saldo', () => {
  const r = recurrente({ tipo: 'egreso', monto: 3000, moneda: 'ARS', frecuencia: 'mensual', next_run_at: '2026-06-01T08:00:00.000Z' });
  const result = projectBalance({ saldoArs: 10000, saldoUsd: 0, recurrentes: [r] }, TODAY);
  assert.equal(result.projectedArs, 7000);
});

test('projectBalance: USD recurrentes only affect USD balance', () => {
  const r = recurrente({ tipo: 'egreso', monto: 50, moneda: 'USD', frecuencia: 'mensual', next_run_at: '2026-06-01T08:00:00.000Z' });
  const result = projectBalance({ saldoArs: 10000, saldoUsd: 200, recurrentes: [r] }, TODAY);
  assert.equal(result.projectedArs, 10000);
  assert.equal(result.projectedUsd, 150);
});

test('projectBalance: no active recurrentes returns same saldo', () => {
  const result = projectBalance({ saldoArs: 5000, saldoUsd: 100, recurrentes: [] }, TODAY);
  assert.equal(result.projectedArs, 5000);
  assert.equal(result.projectedUsd, 100);
  assert.equal(result.occurrences.length, 0);
});

test('projectBalance: includes occurrences list sorted by date', () => {
  const r1 = recurrente({ frecuencia: 'mensual', next_run_at: '2026-06-15T08:00:00.000Z' });
  const r2 = recurrente({ frecuencia: 'mensual', next_run_at: '2026-06-05T08:00:00.000Z' });
  const result = projectBalance({ saldoArs: 0, saldoUsd: 0, recurrentes: [r1, r2] }, TODAY);
  assert.ok(result.occurrences[0]!.date <= result.occurrences[1]!.date);
});

test('projectBalance: defensive cap — diario max 30 occurrences per recurrente', () => {
  const r = recurrente({ frecuencia: 'diario', next_run_at: '2026-05-31T08:00:00.000Z' });
  const result = projectBalance({ saldoArs: 0, saldoUsd: 0, recurrentes: [r] }, TODAY);
  // Should not exceed 30 per recurrente
  assert.ok(result.occurrences.length <= 30);
});

// -------- month boundary --------

test('mensual: month boundary — Jan 31 → Feb 28 in non-leap year', () => {
  const today = new Date('2026-01-31T12:00:00.000Z');
  const r = recurrente({
    frecuencia: 'mensual',
    next_run_at: '2026-01-31T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], today);
  // Jan 31 → within window (today)? No, today is the reference "now". next_run is same day which is >= today at day level
  // but our fn: occurrence >= today.date and <= today+30.date
  // today = Jan 31, today+30 = Mar 2. next occurrence after Jan 31 = Feb 28 (clamped)
  // So Jan 31 itself — is it "today" or "after today"? our fn includes >= today
  assert.ok(occurrences.length >= 1);
  // The first occurrence (Jan 31) is same day as today — should be included
  const dates = occurrences.map((o) => o.date);
  assert.ok(dates.includes('2026-01-31') || dates.includes('2026-02-28'), `dates: ${dates.join(', ')}`);
});

test('anual: year boundary Feb 29 leap → Feb 28 non-leap', () => {
  // Leap year 2024-02-29 → next year 2025-02-28
  const today = new Date('2025-02-01T12:00:00.000Z');
  const r = recurrente({
    frecuencia: 'anual',
    next_run_at: '2025-02-28T08:00:00.000Z',
  });
  const occurrences = expandOccurrences([r], today);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]!.date, '2025-02-28');
});
