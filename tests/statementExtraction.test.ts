import test from "node:test";
import assert from "node:assert/strict";

import {
  parseReceiptItemsResult,
  parseCreditCardSummaryResult,
} from "../src/server/gemini.ts";

// --- document_kind routing in parseReceiptItemsResult ---

const BASE_RECEIPT = {
  empresa: "Carrefour",
  cuit: null,
  moneda: "ARS",
  fecha: "2026-06-09",
  total: 15000,
  confidence: 0.9,
  items: [{ descripcion: "Leche", monto: 1500, cantidad: 2, categoria: "Almacén" }],
};

test("parseReceiptItemsResult: document_kind statement → documentKind statement", () => {
  const r = parseReceiptItemsResult(JSON.stringify({ ...BASE_RECEIPT, document_kind: "statement" }));
  assert.ok(r);
  assert.equal(r.documentKind, "statement");
});

test("parseReceiptItemsResult: sin document_kind → receipt (back-compat)", () => {
  const r = parseReceiptItemsResult(JSON.stringify(BASE_RECEIPT));
  assert.ok(r);
  assert.equal(r.documentKind, "receipt");
});

test("parseReceiptItemsResult: document_kind inválido → receipt", () => {
  const r = parseReceiptItemsResult(JSON.stringify({ ...BASE_RECEIPT, document_kind: "factura" }));
  assert.ok(r);
  assert.equal(r.documentKind, "receipt");
});

// --- parseCreditCardSummaryResult ---

test("parseCreditCardSummaryResult: transacciones válidas", () => {
  const r = parseCreditCardSummaryResult(JSON.stringify([
    { monto: 8500, moneda: "ARS", tipo: "egreso", empresa: "Amazon", categoria: "Electrónica", descripcion: "Amazon (cuota 3 de 6)", fecha: "2026-05-12", confidence: 0.95 },
    { monto: 1200, moneda: "ARS", tipo: "ingreso", empresa: "Mercado Libre", categoria: "Varios", descripcion: "Reintegro", fecha: "2026-05-15", confidence: 0.9 },
  ]));
  assert.ok(r);
  assert.equal(r.length, 2);
  assert.equal(r[0].monto, 8500);
  assert.equal(r[0].descripcion, "Amazon (cuota 3 de 6)");
  assert.equal(r[1].tipo, "ingreso");
});

test("parseCreditCardSummaryResult: basura y no-array → null", () => {
  assert.equal(parseCreditCardSummaryResult("no json"), null);
  assert.equal(parseCreditCardSummaryResult('{"monto": 1}'), null);
  assert.equal(parseCreditCardSummaryResult("[]"), null);
});

test("parseCreditCardSummaryResult: capea a 200 ítems", () => {
  const items = Array.from({ length: 250 }, (_, i) => ({
    monto: i + 1, moneda: "ARS", tipo: "egreso", empresa: "X", categoria: "Varios", descripcion: `t${i}`, fecha: null, confidence: 0.9,
  }));
  const r = parseCreditCardSummaryResult(JSON.stringify(items));
  assert.ok(r);
  assert.equal(r.length, 200);
});

test("parseCreditCardSummaryResult: monto inválido → null en el ítem, no rompe el lote", () => {
  const r = parseCreditCardSummaryResult(JSON.stringify([
    { monto: -50, moneda: "ARS", tipo: "egreso", empresa: "X", categoria: "Varios", descripcion: "negativo", fecha: null, confidence: 0.9 },
    { monto: 100, moneda: "ARS", tipo: "egreso", empresa: "Y", categoria: "Varios", descripcion: "ok", fecha: null, confidence: 0.9 },
  ]));
  assert.ok(r);
  assert.equal(r.length, 2);
  assert.equal(r[0].monto, null);
  assert.equal(r[1].monto, 100);
});
