import test from 'node:test';
import assert from 'node:assert/strict';

import { describeQueueSummary } from '../src/dashboard/queueSummary';

test('describeQueueSummary: nothing to show → null', () => {
  assert.equal(describeQueueSummary({ processed: [], failed: [] }), null);
});

test('describeQueueSummary: saved and failed messages with readable reasons', () => {
  const view = describeQueueSummary({
    processed: [
      { id: 'p1', text_content: 'nafta 100 y peaje 50', description: 'nafta, peaje', tipo: 'egreso', count: 2, processed_at: null },
      { id: 'p2', text_content: 'cobré 2000', description: null, tipo: 'ingreso', count: 1, processed_at: null },
    ],
    failed: [
      { id: 'f1', text_content: 'algo raro', reason: 'processing_failed', processed_at: null },
      { id: 'f2', text_content: 'luz 4500', reason: 'expired', processed_at: null },
      { id: 'f3', text_content: 'gasto x', reason: 'forbidden', processed_at: null },
    ],
  });
  assert.ok(view);
  assert.equal(view.title, 'La IA volvió: se guardaron 2 mensajes que tenías en cola');
  assert.deepEqual(view.saved, ['nafta, peaje (2 movimientos)', 'cobré 2000']);
  assert.deepEqual(view.failed, [
    { id: 'f1', text: 'algo raro', reason: 'No se pudo procesar' },
    { id: 'f2', text: 'luz 4500', reason: 'Venció antes de que volviera la IA' },
    { id: 'f3', text: 'gasto x', reason: 'Ya no tenés permiso para cargar en este dashboard' },
  ]);
  assert.deepEqual(view.ids, ['p1', 'p2', 'f1', 'f2', 'f3']);
});

test('describeQueueSummary: only failures → title says so', () => {
  const view = describeQueueSummary({
    processed: [],
    failed: [{ id: 'f1', text_content: 'luz 4500', reason: 'expired', processed_at: null }],
  });
  assert.equal(view?.title, 'No se pudo procesar 1 mensaje que tenías en cola');
});
