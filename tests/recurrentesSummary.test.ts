import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecurrentesSummary } from '../src/dashboard/recurrentesSummary';

const TODAY = new Date('2026-06-01T00:00:00.000Z');

function rec(over: Partial<any>): any {
  return {
    id: Math.random().toString(36).slice(2),
    monto: 1000,
    tipo: 'egreso',
    moneda: 'ARS',
    frecuencia: 'mensual',
    descripcion: 'x',
    is_active: true,
    deleted_at: null,
    next_run_at: '2026-06-05T00:00:00.000Z',
    ...over,
  };
}

test('buildRecurrentesSummary: cuenta activos (ignora pausados/borrados)', () => {
  const s = buildRecurrentesSummary([rec({}), rec({ is_active: false }), rec({ deleted_at: '2026-01-01' })], TODAY);
  assert.equal(s.activos, 1);
});

test('buildRecurrentesSummary: impacto mensual normaliza por frecuencia y signo', () => {
  // egreso semanal 1000 → -1000 * (30/7) ≈ -4285.7
  const s = buildRecurrentesSummary([rec({ frecuencia: 'semanal', tipo: 'egreso', monto: 1000 })], TODAY);
  assert.ok(Math.abs(s.impactoMensualArs - (-1000 * (30 / 7))) < 0.01);
  // ingreso mensual 5000 → +5000
  const s2 = buildRecurrentesSummary([rec({ frecuencia: 'mensual', tipo: 'ingreso', monto: 5000 })], TODAY);
  assert.equal(s2.impactoMensualArs, 5000);
});

test('buildRecurrentesSummary: solo ARS en impacto mensual', () => {
  const s = buildRecurrentesSummary([rec({ moneda: 'USD', monto: 999 })], TODAY);
  assert.equal(s.impactoMensualArs, 0);
});

test('buildRecurrentesSummary: próxima fecha = primera ocurrencia', () => {
  const s = buildRecurrentesSummary([rec({ next_run_at: '2026-06-05T00:00:00.000Z' })], TODAY);
  assert.equal(s.proximaFechaIso, '2026-06-05');
});

test('buildRecurrentesSummary: heatmap = 30 celdas, marca el día con impacto', () => {
  const s = buildRecurrentesSummary([rec({ next_run_at: '2026-06-05T00:00:00.000Z', monto: 1000 })], TODAY);
  assert.equal(s.dias.length, 30);
  const cell = s.dias.find((d) => d.date === '2026-06-05')!;
  assert.equal(cell.total, 1000);
  assert.notEqual(cell.level, 'none');
  assert.equal(s.dias.find((d) => d.date === '2026-06-02')!.level, 'none');
});

test('buildRecurrentesSummary: vacío → ceros, 30 celdas none', () => {
  const s = buildRecurrentesSummary([], TODAY);
  assert.equal(s.activos, 0);
  assert.equal(s.proximaFechaIso, null);
  assert.equal(s.dias.length, 30);
  assert.ok(s.dias.every((d) => d.level === 'none'));
});
