/**
 * Review 2026-06-10: input caps on free-form save/update payloads — array size,
 * amount ceiling and string lengths (tickets already had them; movements didn't).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseSaveMovimientosRequest, parseUpdateMovimientoRequest } from "../src/server/validation.ts";

const item = (over: Record<string, unknown> = {}) => ({
  monto: 100,
  tipo: "egreso",
  moneda: "ARS",
  descripcion: "algo",
  ...over,
});

test("parseSaveMovimientosRequest: rejects more than 50 items", () => {
  const items = Array.from({ length: 51 }, () => item());
  assert.equal(parseSaveMovimientosRequest({ items, originalText: "x" }), null);
});

test("parseSaveMovimientosRequest: rejects monto above cap", () => {
  const result = parseSaveMovimientosRequest({ items: [item({ monto: 1e15 })], originalText: "x" });
  assert.equal(result, null);
});

test("parseSaveMovimientosRequest: truncates oversized strings instead of storing them whole", () => {
  const result = parseSaveMovimientosRequest({
    items: [item({ descripcion: "d".repeat(2000), empresa: "e".repeat(2000), categoria: "c".repeat(2000) })],
    originalText: "o".repeat(100_000),
  });
  assert.ok(result);
  assert.equal(result.items[0].descripcion.length, 500);
  assert.equal((result.items[0].empresa as string).length, 200);
  assert.equal((result.items[0].categoria as string).length, 200);
  assert.equal(result.originalText.length, 4000);
});

test("parseSaveMovimientosRequest: normal payload untouched", () => {
  const result = parseSaveMovimientosRequest({ items: [item()], originalText: "compré pan" });
  assert.ok(result);
  assert.equal(result.items[0].monto, 100);
  assert.equal(result.originalText, "compré pan");
});

test("parseUpdateMovimientoRequest: rejects monto above cap", () => {
  assert.equal(parseUpdateMovimientoRequest({ monto: 1e15 }), null);
});
