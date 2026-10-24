import test from 'node:test';
import assert from 'node:assert/strict';

import { confirmErrorMessage } from '../src/dashboard/confirmError';

test('confirmErrorMessage: 403 → no permission', () => {
  assert.equal(confirmErrorMessage({ status: 403 }), 'No tenés permiso para hacer esto.');
});

test('confirmErrorMessage: 404 → already gone', () => {
  assert.equal(confirmErrorMessage({ status: 404 }), 'Ya no existe: puede que otra persona lo haya borrado. Actualizá la vista.');
});

test('confirmErrorMessage: 409 → conflict explained generically', () => {
  assert.equal(confirmErrorMessage({ status: 409 }), 'No se puede hacer en este momento: hay un conflicto con otros datos.');
});

test('confirmErrorMessage: anything else → generic retry message', () => {
  assert.equal(confirmErrorMessage(new Error('boom')), 'No se pudo completar la acción. Probá de nuevo.');
  assert.equal(confirmErrorMessage(undefined), 'No se pudo completar la acción. Probá de nuevo.');
});
