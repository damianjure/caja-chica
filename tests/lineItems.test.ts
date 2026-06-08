/**
 * TDD tests for the pure web line-item helpers (src/dashboard/lineItems.ts).
 *
 * These mirror the bot's insertLineItemMovements / showReceiptReview single
 * mapping (src/bot/extraction.ts) so the web stays behavior-identical:
 *  - buildLineItemMovements: payable filter, "sum" vs "sep", descriptions
 *  - toSingleReview: <2 items collapse to one editable movement
 *
 * Types are imported via `import type` only, so api.ts (which throws at load
 * when VITE_API_URL is absent) is never executed at runtime.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildLineItemMovements, toSingleReview } from "../src/dashboard/lineItems.ts";
import type { ImageItemsExtractionResult, ImageLineItem } from "../src/services/api.ts";

const items: ImageLineItem[] = [
  { descripcion: "Leche", monto: 1200, cantidad: 1, categoria: "Supermercado" },
  { descripcion: "Pan", monto: 800, cantidad: 2, categoria: "Panadería" },
  { descripcion: "Item sin monto", monto: null, cantidad: null, categoria: "Varios" },
];

const meta = { empresa: "Carrefour", moneda: "ARS" as const };

test("buildLineItemMovements — sep: one movement per payable item, abs monto, per-item categoria", () => {
  const out = buildLineItemMovements(items, meta, "sep");
  assert.equal(out.length, 2, "drops the null-monto item");
  assert.deepEqual(out[0], {
    monto: 1200, tipo: "egreso", moneda: "ARS",
    categoria: "Supermercado", empresa: "Carrefour", descripcion: "Leche",
  });
  assert.equal(out[1].categoria, "Panadería");
  assert.ok(out.every((m) => m.tipo === "egreso"));
});

test("buildLineItemMovements — sum: single movement with total, Varios categoria, item count in desc", () => {
  const out = buildLineItemMovements(items, meta, "sum");
  assert.equal(out.length, 1);
  assert.equal(out[0].monto, 2000, "sums abs montos of payable items only");
  assert.equal(out[0].categoria, "Varios");
  assert.equal(out[0].empresa, "Carrefour");
  assert.equal(out[0].descripcion, "Compra en Carrefour (2 ítems)");
});

test("buildLineItemMovements — sum with no/Personal empresa: generic description, empresa null", () => {
  const out = buildLineItemMovements(items, { empresa: null, moneda: "ARS" }, "sum");
  assert.equal(out[0].descripcion, "Compra (2 ítems)");
  assert.equal(out[0].empresa, null);

  const personal = buildLineItemMovements(items, { empresa: "Personal", moneda: "ARS" }, "sum");
  assert.equal(personal[0].descripcion, "Compra (2 ítems)");
});

test("buildLineItemMovements — uses abs() so negative montos (returns) count positive", () => {
  const out = buildLineItemMovements(
    [{ descripcion: "Reverso", monto: -500, cantidad: null, categoria: "Varios" }],
    meta, "sep",
  );
  assert.equal(out[0].monto, 500);
});

test("buildLineItemMovements — no payable items returns empty array", () => {
  const out = buildLineItemMovements(
    [{ descripcion: "x", monto: null, cantidad: null, categoria: "Varios" }],
    meta, "sum",
  );
  assert.deepEqual(out, []);
});

test("toSingleReview — uses total when present, tipo egreso, first item categoria", () => {
  const r: ImageItemsExtractionResult = {
    empresa: "Disco", cuit: "20-1", moneda: "ARS", fecha: "2026-06-01",
    total: 3200, confidence: 0.9, sourceType: "photo",
    items: [{ descripcion: "Café", monto: 3200, cantidad: 1, categoria: "Bar" }],
  };
  const single = toSingleReview(r);
  assert.equal(single.monto, 3200);
  assert.equal(single.tipo, "egreso");
  assert.equal(single.categoria, "Bar");
  assert.equal(single.descripcion, "Café");
  assert.equal(single.empresa, "Disco");
  assert.equal(single.sourceType, "photo");
});

test("toSingleReview — falls back to item monto then default description when no total/items", () => {
  const noItems: ImageItemsExtractionResult = {
    empresa: null, cuit: null, moneda: "ARS", fecha: null,
    total: null, confidence: 0.4, sourceType: "handwritten", items: [],
  };
  const single = toSingleReview(noItems);
  assert.equal(single.monto, null);
  assert.equal(single.categoria, "Varios");
  assert.equal(single.descripcion, "Gasto registrado desde foto");

  const withEmpresa = toSingleReview({ ...noItems, empresa: "Kiosco" });
  assert.equal(withEmpresa.descripcion, "Compra en Kiosco");
});
