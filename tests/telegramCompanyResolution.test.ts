import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTelegramCompany } from '../src/server/telegramCompanyResolution.ts';

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
