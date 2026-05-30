import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExportRequest } from '../src/dashboard/reportRequest';

const TODAY = new Date('2026-05-15T12:00:00.000Z');

const base = {
  datePeriod: 'mes' as const,
  customFrom: '',
  customTo: '',
  selectedCompany: 'all',
  movementType: 'all' as const,
  movementCurrency: 'all' as const,
  selectedCategory: 'all',
};

test('buildExportRequest: período mes → range con from/to del mes', () => {
  const r = buildExportRequest(base, 'pdf', 'local', TODAY);
  assert.equal(r.period, 'range');
  assert.equal(r.from, '2026-05-01');
  assert.equal(r.to, '2026-05-31');
  assert.equal(r.format, 'pdf');
  assert.equal(r.destination, 'local');
});

test("buildExportRequest: 'all' → desde centinela hasta hoy", () => {
  const r = buildExportRequest({ ...base, datePeriod: 'all' }, 'pdf', 'local', TODAY);
  assert.equal(r.period, 'range');
  assert.equal(r.to, '2026-05-15');
  assert.ok(r.from && r.from < '2010-01-01', 'from debe ser centinela viejo');
});

test('buildExportRequest: rango usa custom from/to', () => {
  const r = buildExportRequest({ ...base, datePeriod: 'rango', customFrom: '2026-03-01', customTo: '2026-03-31' }, 'csv', 'local', TODAY);
  assert.equal(r.from, '2026-03-01');
  assert.equal(r.to, '2026-03-31');
});

test('buildExportRequest: empresa/categoría all → [] / undefined; específicas → set', () => {
  const all = buildExportRequest(base, 'pdf', 'local', TODAY);
  assert.deepEqual(all.companies, []);
  assert.equal(all.categoria, undefined);

  const specific = buildExportRequest({ ...base, selectedCompany: 'Acme', selectedCategory: 'Combustible' }, 'pdf', 'drive', TODAY);
  assert.deepEqual(specific.companies, ['Acme']);
  assert.equal(specific.categoria, 'Combustible');
  assert.equal(specific.destination, 'drive');
});

test('buildExportRequest: tipo y moneda pasan tal cual', () => {
  const r = buildExportRequest({ ...base, movementType: 'egreso', movementCurrency: 'USD' }, 'pdf', 'local', TODAY);
  assert.equal(r.tipo, 'egreso');
  assert.equal(r.moneda, 'USD');
});
