import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptItemsResult, type ReceiptItemsResult } from '../src/server/gemini.ts';
import {
  createPendingLineItems,
  getPendingLineItems,
  deletePendingLineItems,
  toggleLineItem,
  setAllLineItems,
  selectedLineItems,
  buildLineItemsCardText,
  buildLineItemsKeyboard,
  buildGroupingKeyboard,
  MAX_LINE_ITEMS,
} from '../src/server/lineItemsReview.ts';

// --- parseReceiptItemsResult ---

test('parseReceiptItemsResult parses merchant metadata and line items', () => {
  const json = JSON.stringify({
    empresa: 'Carrefour',
    cuit: '30688554690',
    moneda: 'ARS',
    fecha: '2026-06-08',
    total: 5500,
    confidence: 0.9,
    items: [
      { descripcion: 'Coca 2L', monto: 1500, cantidad: 1, categoria: 'Bebidas' },
      { descripcion: 'Pan', monto: 800, cantidad: null, categoria: 'Almacén' },
      { descripcion: 'Fiambre', monto: 3200, cantidad: 2, categoria: 'Fiambrería' },
    ],
  });
  const result = parseReceiptItemsResult(json);
  assert.ok(result);
  assert.equal(result!.empresa, 'Carrefour');
  assert.equal(result!.cuit, '30688554690');
  assert.equal(result!.moneda, 'ARS');
  assert.equal(result!.fecha, '2026-06-08');
  assert.equal(result!.total, 5500);
  assert.equal(result!.items.length, 3);
  assert.equal(result!.items[0].descripcion, 'Coca 2L');
  assert.equal(result!.items[2].cantidad, 2);
});

test('parseReceiptItemsResult drops items with neither description nor amount', () => {
  const json = JSON.stringify({
    moneda: 'ARS',
    total: 1000,
    confidence: 0.8,
    items: [
      { descripcion: '', monto: null, categoria: 'Varios' },
      { descripcion: 'Café', monto: 1000, categoria: 'Bebidas' },
    ],
  });
  const result = parseReceiptItemsResult(json);
  assert.ok(result);
  assert.equal(result!.items.length, 1);
  assert.equal(result!.items[0].descripcion, 'Café');
});

test('parseReceiptItemsResult nulls out invalid amounts but keeps the item via description', () => {
  const json = JSON.stringify({
    moneda: 'ARS',
    confidence: 0.7,
    items: [
      { descripcion: 'Item gratis', monto: 0, categoria: 'Varios' },
      { descripcion: 'Item negativo', monto: -50, categoria: 'Varios' },
    ],
  });
  const result = parseReceiptItemsResult(json);
  assert.ok(result);
  assert.equal(result!.items.length, 2);
  assert.equal(result!.items[0].monto, null);
  assert.equal(result!.items[1].monto, null);
});

test('parseReceiptItemsResult defaults moneda to ARS and missing fields gracefully', () => {
  const json = JSON.stringify({ confidence: 0.6, items: [{ descripcion: 'X', monto: 10 }] });
  const result = parseReceiptItemsResult(json);
  assert.ok(result);
  assert.equal(result!.moneda, 'ARS');
  assert.equal(result!.empresa, null);
  assert.equal(result!.fecha, null);
  assert.equal(result!.items[0].categoria, 'Varios');
});

test('parseReceiptItemsResult returns null for non-object / invalid JSON', () => {
  assert.equal(parseReceiptItemsResult('not json'), null);
  assert.equal(parseReceiptItemsResult('[]'), null);
  assert.equal(parseReceiptItemsResult('"string"'), null);
});

test('parseReceiptItemsResult handles empty items array', () => {
  const result = parseReceiptItemsResult(JSON.stringify({ total: 999, confidence: 0.9, items: [] }));
  assert.ok(result);
  assert.equal(result!.items.length, 0);
  assert.equal(result!.total, 999);
});

// --- lineItemsReview state ---

function buildMeta(overrides: Partial<ReceiptItemsResult> = {}): ReceiptItemsResult {
  return {
    empresa: 'Coto',
    cuit: null,
    moneda: 'ARS',
    fecha: '2026-06-08',
    total: 3000,
    confidence: 0.9,
    items: [
      { descripcion: 'Leche', monto: 1000, cantidad: 1, categoria: 'Lácteos' },
      { descripcion: 'Yerba', monto: 2000, cantidad: 1, categoria: 'Almacén' },
    ],
    ...overrides,
  };
}

test('createPendingLineItems selects all items by default', () => {
  const entry = createPendingLineItems({
    chatId: 1, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  assert.equal(entry.items.length, 2);
  assert.ok(entry.items.every((it) => it.selected));
  assert.equal(entry.empresa, 'Coto');
  deletePendingLineItems(entry.id);
});

test('createPendingLineItems defaults null empresa to Personal', () => {
  const entry = createPendingLineItems({
    chatId: 2, dashboardId: null, userId: null, ownerUserId: 'o1',
    meta: buildMeta({ empresa: null }), sourceType: 'photo',
  });
  assert.equal(entry.empresa, 'Personal');
  deletePendingLineItems(entry.id);
});

test('createPendingLineItems caps items at MAX_LINE_ITEMS', () => {
  const many = Array.from({ length: MAX_LINE_ITEMS + 10 }, (_, i) => ({
    descripcion: `item ${i}`, monto: 10, cantidad: null, categoria: 'Varios',
  }));
  const entry = createPendingLineItems({
    chatId: 3, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta({ items: many }), sourceType: 'photo',
  });
  assert.equal(entry.items.length, MAX_LINE_ITEMS);
  deletePendingLineItems(entry.id);
});

test('toggleLineItem flips a single item selection', () => {
  const entry = createPendingLineItems({
    chatId: 4, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  toggleLineItem(entry.id, 0);
  assert.equal(entry.items[0].selected, false);
  assert.equal(entry.items[1].selected, true);
  assert.equal(selectedLineItems(entry).length, 1);
  deletePendingLineItems(entry.id);
});

test('toggleLineItem ignores out-of-range index', () => {
  const entry = createPendingLineItems({
    chatId: 5, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  toggleLineItem(entry.id, 99);
  assert.equal(selectedLineItems(entry).length, 2);
  deletePendingLineItems(entry.id);
});

test('setAllLineItems toggles every item', () => {
  const entry = createPendingLineItems({
    chatId: 6, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  setAllLineItems(entry.id, false);
  assert.equal(selectedLineItems(entry).length, 0);
  setAllLineItems(entry.id, true);
  assert.equal(selectedLineItems(entry).length, 2);
  deletePendingLineItems(entry.id);
});

test('getPendingLineItems returns null after deletion', () => {
  const entry = createPendingLineItems({
    chatId: 7, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  deletePendingLineItems(entry.id);
  assert.equal(getPendingLineItems(entry.id), null);
});

test('getPendingLineItems returns null for expired entry', () => {
  const entry = createPendingLineItems({
    chatId: 8, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  entry.expiresAt = Date.now() - 1;
  assert.equal(getPendingLineItems(entry.id), null);
});

test('buildLineItemsCardText reflects selected count and total', () => {
  const entry = createPendingLineItems({
    chatId: 9, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  let text = buildLineItemsCardText(entry);
  assert.match(text, /Coto/);
  assert.match(text, /2\/2/);
  toggleLineItem(entry.id, 0);
  text = buildLineItemsCardText(entry);
  assert.match(text, /1\/2/);
  deletePendingLineItems(entry.id);
});

test('buildLineItemsKeyboard has a row per item plus controls', () => {
  const entry = createPendingLineItems({
    chatId: 10, dashboardId: 'd1', userId: 'u1', ownerUserId: null,
    meta: buildMeta(), sourceType: 'photo',
  });
  const kb = buildLineItemsKeyboard(entry);
  // 2 item rows + toggle-all + save + cancel = 5 rows
  assert.equal(kb.inline_keyboard.length, 5);
  assert.match(kb.inline_keyboard[0][0].callback_data, /^li:t:.+:0$/);
  assert.match(kb.inline_keyboard[2][0].callback_data, /^li:all:/);
  assert.match(kb.inline_keyboard[3][0].callback_data, /^li:save:/);
  deletePendingLineItems(entry.id);
});

test('buildGroupingKeyboard offers separados and sumados', () => {
  const kb = buildGroupingKeyboard('li_x');
  const data = kb.inline_keyboard[0].map((b) => b.callback_data);
  assert.deepEqual(data, ['li:g:li_x:s', 'li:g:li_x:u']);
});
