import test from "node:test";
import assert from "node:assert/strict";

import { parseGeminiJsonResponse } from "../src/server/gemini.ts";

test("parseGeminiJsonResponse: accepts new-vocabulary intent and exposes confidence + slots", () => {
  const r = parseGeminiJsonResponse(JSON.stringify({ intent: "crear_empresa", confidence: 0.88, slots: { nombre: "Carrefour" } }));
  assert.ok(r);
  assert.equal(r!.intent, "crear_empresa");
  assert.equal(r!.confidence, 0.88);
  assert.equal((r!.slots as any).nombre, "Carrefour");
});

test("parseGeminiJsonResponse: keeps movimiento items shape", () => {
  const r = parseGeminiJsonResponse(JSON.stringify({ intent: "movimiento", confidence: 0.9, items: [{ monto: 4500, tipo: "egreso", moneda: "ARS", categoria: "Servicios", empresa: null, descripcion: "luz" }] }));
  assert.ok(r);
  assert.equal(r!.intent, "movimiento");
  assert.equal(r!.items?.length, 1);
});

test("parseGeminiJsonResponse: strips markdown fences", () => {
  const r = parseGeminiJsonResponse('```json\n{"intent":"saldos","confidence":0.7}\n```');
  assert.ok(r);
  assert.equal(r!.intent, "saldos");
});

test("parseGeminiJsonResponse: missing intent defaults to REGISTRAR (movement)", () => {
  const r = parseGeminiJsonResponse(JSON.stringify({ items: [] }));
  assert.ok(r);
  assert.equal(r!.intent, "REGISTRAR");
});

test("parseGeminiJsonResponse: invalid JSON returns null", () => {
  assert.equal(parseGeminiJsonResponse("not json at all"), null);
});

test("parseGeminiJsonResponse: array (not object) returns null", () => {
  assert.equal(parseGeminiJsonResponse("[1,2,3]"), null);
});

test("parseGeminiJsonResponse: legacy REGISTRAR still parses (back-compat)", () => {
  const r = parseGeminiJsonResponse(JSON.stringify({ intent: "REGISTRAR", items: [{ monto: 100 }] }));
  assert.ok(r);
  assert.equal(r!.intent, "REGISTRAR");
});
