import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractResponse } from "../src/services/extractIntent.ts";

test("normalizeExtractResponse: backend 'movimiento' maps to REGISTRAR with items", () => {
  const items = [{ monto: 5000, tipo: "ingreso", moneda: "ARS", categoria: "Otros", empresa: "taller", descripcion: "laburito" }];
  const r = normalizeExtractResponse({ intent: "movimiento", items });
  assert.deepEqual(r, { intent: "REGISTRAR", items });
});

test("normalizeExtractResponse: missing intent defaults to REGISTRAR", () => {
  const r = normalizeExtractResponse({ items: [] });
  assert.deepEqual(r, { intent: "REGISTRAR", items: [] });
});

test("normalizeExtractResponse: crear_empresa maps to GESTIONAR_EMPRESA ADD", () => {
  const r = normalizeExtractResponse({ intent: "crear_empresa", slots: { nombre: "Carrefour" } });
  assert.deepEqual(r, { intent: "GESTIONAR_EMPRESA", action: "ADD", companyName: "Carrefour" });
});

test("normalizeExtractResponse: borrar_ultimo maps to ELIMINAR_MOVIMIENTO last", () => {
  const r = normalizeExtractResponse({ intent: "borrar_ultimo" });
  assert.deepEqual(r, { intent: "ELIMINAR_MOVIMIENTO", target: "last" });
});

test("normalizeExtractResponse: desconocido maps to no_data_found", () => {
  const r = normalizeExtractResponse({ intent: "desconocido" });
  assert.deepEqual(r, { error: "no_data_found" });
});

test("normalizeExtractResponse: bot-only command (saldos) returns a telegram hint", () => {
  const r = normalizeExtractResponse({ intent: "saldos", slots: {} });
  assert.ok("error" in r && /Telegram/.test(r.error));
});

test("normalizeExtractResponse: explicit backend error passes through", () => {
  const r = normalizeExtractResponse({ error: "ai_unavailable" });
  assert.deepEqual(r, { error: "ai_unavailable" });
});

test("normalizeExtractResponse: non-object input is treated as no_data_found", () => {
  assert.deepEqual(normalizeExtractResponse(null), { error: "no_data_found" });
  assert.deepEqual(normalizeExtractResponse("nope"), { error: "no_data_found" });
});
