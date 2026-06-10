import test from "node:test";
import assert from "node:assert/strict";

import {
  parseIntentResult,
  resolveIntentAction,
  parseReminderSlots,
  INTENT_CONFIRM_THRESHOLD,
  KNOWN_INTENTS,
  type BotIntent,
} from "../src/bot/voiceIntent.ts";

// ===== parseIntentResult — normalize raw Gemini JSON into a typed IntentResult =====

test("parseIntentResult: valid known intent with slots", () => {
  const r = parseIntentResult(
    { intent: "crear_empresa", confidence: 0.9, slots: { nombre: "Carrefour" } },
    "agregá la empresa Carrefour",
  );
  assert.equal(r.intent, "crear_empresa");
  assert.equal(r.confidence, 0.9);
  assert.equal(r.slots.nombre, "Carrefour");
  assert.equal(r.transcript, "agregá la empresa Carrefour");
});

test("parseIntentResult: missing intent defaults to movimiento", () => {
  const r = parseIntentResult({ confidence: 0.8 }, "pagué 4500 de luz");
  assert.equal(r.intent, "movimiento");
});

test("parseIntentResult: unknown intent string becomes desconocido", () => {
  const r = parseIntentResult({ intent: "foo_bar", confidence: 0.9 }, "blah");
  assert.equal(r.intent, "desconocido");
});

test("parseIntentResult: borrar_empresa is NOT routable by voice → desconocido (user decision)", () => {
  const r = parseIntentResult({ intent: "borrar_empresa", confidence: 0.95, slots: { nombre: "ACME" } }, "borrá la empresa ACME");
  assert.equal(r.intent, "desconocido");
});

test("parseIntentResult: legacy REGISTRAR maps to movimiento", () => {
  assert.equal(parseIntentResult({ intent: "REGISTRAR", confidence: 0.9 }, "x").intent, "movimiento");
});

test("parseIntentResult: legacy GESTIONAR_EMPRESA maps to crear_empresa", () => {
  assert.equal(parseIntentResult({ intent: "GESTIONAR_EMPRESA", confidence: 0.9 }, "x").intent, "crear_empresa");
});

test("parseIntentResult: legacy ELIMINAR_MOVIMIENTO maps to borrar_ultimo", () => {
  assert.equal(parseIntentResult({ intent: "ELIMINAR_MOVIMIENTO", confidence: 0.9 }, "x").intent, "borrar_ultimo");
});

test("parseIntentResult: confidence clamps to [0,1]", () => {
  assert.equal(parseIntentResult({ intent: "saldos", confidence: 5 }, "x").confidence, 1);
  assert.equal(parseIntentResult({ intent: "saldos", confidence: -3 }, "x").confidence, 0);
});

test("parseIntentResult: non-number confidence becomes 0", () => {
  assert.equal(parseIntentResult({ intent: "saldos", confidence: "alta" }, "x").confidence, 0);
});

test("parseIntentResult: non-object raw → movimiento, confidence 0, fallback transcript", () => {
  const r = parseIntentResult(null, "fallback text");
  assert.equal(r.intent, "movimiento");
  assert.equal(r.confidence, 0);
  assert.equal(r.transcript, "fallback text");
  assert.deepEqual(r.slots, {});
});

test("parseIntentResult: missing slots → empty object", () => {
  const r = parseIntentResult({ intent: "buscar", confidence: 0.7 }, "buscá Carrefour");
  assert.deepEqual(r.slots, {});
});

test("KNOWN_INTENTS excludes borrar_empresa and includes borrar_ultimo", () => {
  assert.ok(!KNOWN_INTENTS.includes("borrar_empresa" as BotIntent));
  assert.ok(KNOWN_INTENTS.includes("borrar_ultimo"));
});

test("KNOWN_INTENTS includes consultar; parseIntentResult routes it", () => {
  assert.ok(KNOWN_INTENTS.includes("consultar"));
  const r = parseIntentResult({ intent: "consultar", confidence: 0.9, slots: { pregunta: "¿cuánto gasté?" } }, "x");
  assert.equal(r.intent, "consultar");
  const d = resolveIntentAction(r);
  assert.equal(d.action, "execute");
});

// ===== resolveIntentAction — pure 3-way decision =====

test("resolveIntentAction: known intent, high confidence → execute", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "crear_empresa", confidence: 0.9 }, "x"));
  assert.equal(d.action, "execute");
});

test("resolveIntentAction: movimiento high confidence → execute", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "movimiento", confidence: 0.95 }, "pagué 4500 de luz"));
  assert.equal(d.action, "execute");
});

test("resolveIntentAction: low confidence → clarify (low_confidence)", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "saldos", confidence: 0.4 }, "mmm qsaldo?"));
  assert.equal(d.action, "clarify");
  if (d.action === "clarify") assert.equal(d.reason, "low_confidence");
});

test("resolveIntentAction: desconocido → clarify (unknown)", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "foo", confidence: 0.99 }, "ruido"));
  assert.equal(d.action, "clarify");
  if (d.action === "clarify") assert.equal(d.reason, "unknown");
});

test("resolveIntentAction: borrar_ultimo high confidence → confirm (destructive)", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "borrar_ultimo", confidence: 0.92 }, "borrá lo último"));
  assert.equal(d.action, "confirm");
  if (d.action === "confirm") assert.equal(d.reason, "destructive");
});

test("resolveIntentAction: borrar_ultimo LOW confidence → clarify, not confirm (low_conf beats destructive)", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "borrar_ultimo", confidence: 0.3 }, "borr...?"));
  assert.equal(d.action, "clarify");
  if (d.action === "clarify") assert.equal(d.reason, "low_confidence");
});

test("INTENT_CONFIRM_THRESHOLD is between 0 and 1", () => {
  assert.ok(INTENT_CONFIRM_THRESHOLD > 0 && INTENT_CONFIRM_THRESHOLD < 1);
});

test("resolveIntentAction: confidence exactly at threshold → execute (not clarify)", () => {
  const d = resolveIntentAction(parseIntentResult({ intent: "saldos", confidence: INTENT_CONFIRM_THRESHOLD }, "saldo"));
  assert.equal(d.action, "execute");
});

// ===== parseReminderSlots =====

test("parseReminderSlots — apagar", () => {
  assert.deepEqual(parseReminderSlots({ accion: "desactivar" }), { enabled: false });
});
test("parseReminderSlots — hora 9", () => {
  assert.deepEqual(parseReminderSlots({ accion: "hora", hora: 9 }), { enabled: true, hour: 9, minute: 0 });
});
test("parseReminderSlots — prender", () => {
  assert.deepEqual(parseReminderSlots({ accion: "activar" }), { enabled: true });
});
test("parseReminderSlots — ruido → null", () => {
  assert.equal(parseReminderSlots({ accion: "xyz" }), null);
});
