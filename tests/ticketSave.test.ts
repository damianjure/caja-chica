import test from 'node:test';
import assert from 'node:assert/strict';

import { ticketSaveBlockReason } from '../src/dashboard/ticketSave';

const line = (monto: string, included = true) => ({ monto, included });

test('ticketSaveBlockReason: nothing readable in the image → explains it and how to continue', () => {
  assert.equal(
    ticketSaveBlockReason([line('')], { anyAmountRead: false }),
    'No pudimos leer montos en la imagen. Escribí el monto a mano o probá con una foto más nítida.',
  );
});

test('ticketSaveBlockReason: every line unselected', () => {
  assert.equal(ticketSaveBlockReason([line('100', false)], { anyAmountRead: true }), 'Elegí al menos un renglón para guardar.');
});

test('ticketSaveBlockReason: selected lines without a valid amount', () => {
  assert.equal(
    ticketSaveBlockReason([line(''), line('0')], { anyAmountRead: true }),
    'Completá el monto de los renglones que querés guardar.',
  );
});

test('ticketSaveBlockReason: at least one payable line → can save', () => {
  assert.equal(ticketSaveBlockReason([line(''), line('250')], { anyAmountRead: false }), null);
});
