import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTelegramCompany, normalizeEmpresaName, isPersonalEmpresa } from '../src/server/telegramCompanyResolution.ts';

test('"personal" resuelve directo a Personal (no pregunta)', () => {
  for (const raw of ['personal', 'Personal', 'PERSONAL', 'empresa personal', 'ninguna', 'sin empresa']) {
    const r = resolveTelegramCompany({ empresa: raw }, [{ id: '1', nombre: 'Taller Central' }]);
    assert.equal(r.kind, 'exact', `"${raw}" debe ser exact`);
    if (r.kind === 'exact') assert.equal(r.company.nombre, 'Personal');
  }
});

test('normalizeEmpresaName: alias/empty → Personal, real name pasa', () => {
  assert.equal(normalizeEmpresaName('personal'), 'Personal');
  assert.equal(normalizeEmpresaName(''), 'Personal');
  assert.equal(normalizeEmpresaName(null), 'Personal');
  assert.equal(normalizeEmpresaName('  Carrefour '), 'Carrefour');
  assert.equal(isPersonalEmpresa('Carrefour'), false);
  assert.equal(isPersonalEmpresa('ninguna'), true);
});

const companies = [
  { id: '1', nombre: 'Taller Central' },
  { id: '2', nombre: 'Servicios Delta' },
  { id: '3', nombre: 'Distribuidora Norte' },
];

test('devuelve missing cuando no viene empresa', () => {
  assert.deepEqual(resolveTelegramCompany({ empresa: null }, companies), { kind: 'missing' });
});

test('resuelve match exacto normalizado', () => {
  const result = resolveTelegramCompany({ empresa: 'servicios delta' }, companies);
  assert.equal(result.kind, 'exact');
  if (result.kind === 'exact') {
    assert.equal(result.company.nombre, 'Servicios Delta');
  }
});

test('sugiere empresa similar cuando el match es fuerte pero no exacto', () => {
  const result = resolveTelegramCompany({ empresa: 'tayer central' }, companies);
  assert.equal(result.kind, 'suggest');
  if (result.kind === 'suggest') {
    assert.equal(result.company.nombre, 'Taller Central');
    assert.equal(result.score > 0.78, true);
  }
});

test('deja unresolved cuando la similitud es floja', () => {
  const result = resolveTelegramCompany({ empresa: 'cualquier cosa' }, companies);
  assert.deepEqual(result, { kind: 'unresolved' });
});


test('resuelve por CUIT formateado antes que por nombre', () => {
  const cuitCompanies = [
    { id: '1', nombre: 'Servicios Delta', cuit: '30-11111111-1' },
    { id: '2', nombre: 'Taller Central', cuit: '30-22222222-2' },
  ];

  const result = resolveTelegramCompany({ empresa: 'Servicios Delta 30-22222222-2' }, cuitCompanies);

  assert.equal(result.kind, 'exact');
  if (result.kind === 'exact') {
    assert.equal(result.company.nombre, 'Taller Central');
  }
});

test('resuelve por CUIT con 11 dígitos aunque la empresa guarde formato con guiones', () => {
  const cuitCompanies = [
    { id: '1', nombre: 'Servicios Delta', cuit: '30-12345678-9' },
    { id: '2', nombre: 'Distribuidora Norte', cuit: null },
  ];

  const result = resolveTelegramCompany({ empresa: '30123456789' }, cuitCompanies);

  assert.equal(result.kind, 'exact');
  if (result.kind === 'exact') {
    assert.equal(result.company.nombre, 'Servicios Delta');
  }
});

test('si detecta CUIT sin match cae a la lógica fuzzy existente', () => {
  const cuitCompanies = [
    { id: '1', nombre: 'Taller Central', cuit: '30-22222222-2' },
  ];

  const result = resolveTelegramCompany({ empresa: 'tayer central 30-99999999-9' }, cuitCompanies);

  assert.equal(result.kind, 'suggest');
  if (result.kind === 'suggest') {
    assert.equal(result.company.nombre, 'Taller Central');
  }
});
