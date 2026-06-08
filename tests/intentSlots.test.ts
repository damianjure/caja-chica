import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeReportSlots,
  normalizeRecurrenteSlots,
  normalizeEditSlots,
  buildReportEcho,
  buildRecurrenteEcho,
  buildEditEcho,
} from "../src/bot/intentSlots.ts";

// ===== Report slots =====

test("normalizeReportSlots: 'informe de mayo en PDF' → month + pdf, defaults local/all", () => {
  const { value, missing } = normalizeReportSlots({ periodo: "mes", mes: "2026-05", formato: "pdf" });
  assert.equal(value.period, "month");
  assert.equal(value.month, "2026-05");
  assert.equal(value.format, "pdf");
  assert.equal(value.destination, "local");
  assert.equal(value.tipo, "all");
  assert.deepEqual(missing, []);
});

test("normalizeReportSlots: missing period is reported in missing[]", () => {
  const { missing } = normalizeReportSlots({ formato: "pdf" });
  assert.ok(missing.includes("period"));
});

test("normalizeReportSlots: defaults format to pdf and destination to local", () => {
  const { value } = normalizeReportSlots({ periodo: "semana" });
  assert.equal(value.period, "week");
  assert.equal(value.format, "pdf");
  assert.equal(value.destination, "local");
});

test("normalizeReportSlots: english/synonym period values map", () => {
  assert.equal(normalizeReportSlots({ periodo: "month" }).value.period, "month");
  assert.equal(normalizeReportSlots({ periodo: "año" }).value.period, "year");
  assert.equal(normalizeReportSlots({ periodo: "rango", desde: "2026-01-01", hasta: "2026-02-01" }).value.period, "range");
});

test("normalizeReportSlots: csv format honored; drive destination honored", () => {
  const { value } = normalizeReportSlots({ periodo: "mes", formato: "csv", destino: "drive" });
  assert.equal(value.format, "csv");
  assert.equal(value.destination, "drive");
});

test("normalizeReportSlots: tipo gastos → egreso", () => {
  assert.equal(normalizeReportSlots({ periodo: "mes", tipo: "gastos" }).value.tipo, "egreso");
  assert.equal(normalizeReportSlots({ periodo: "mes", tipo: "ingresos" }).value.tipo, "ingreso");
  assert.equal(normalizeReportSlots({ periodo: "mes", tipo: "saldos" }).value.tipo, "saldos");
});

// ===== Recurrente slots =====

test("normalizeRecurrenteSlots: full phrase → all slots, no missing", () => {
  const { value, missing } = normalizeRecurrenteSlots({ monto: 10000, tipo: "egreso", moneda: "ARS", frecuencia: "mensual", descripcion: "Alquiler" });
  assert.equal(value.monto, 10000);
  assert.equal(value.tipo, "egreso");
  assert.equal(value.frecuencia, "mensual");
  assert.equal(value.descripcion, "Alquiler");
  assert.deepEqual(missing, []);
});

test("normalizeRecurrenteSlots: missing tipo reported (e.g. 'recurrente 10000 de alquiler mensual')", () => {
  const { value, missing } = normalizeRecurrenteSlots({ monto: 10000, frecuencia: "mensual", descripcion: "Alquiler" });
  assert.equal(value.moneda, "ARS"); // default
  assert.ok(missing.includes("tipo"));
  assert.ok(!missing.includes("monto"));
});

test("normalizeRecurrenteSlots: string monto with separators coerced", () => {
  assert.equal(normalizeRecurrenteSlots({ monto: "10.000" }).value.monto, 10000);
  assert.equal(normalizeRecurrenteSlots({ monto: "1500,50" }).value.monto, 1500.5);
});

test("normalizeRecurrenteSlots: captures dia + categoria, not required", () => {
  const { value, missing } = normalizeRecurrenteSlots({ monto: 30000, tipo: "egreso", frecuencia: "mensual", dia: 15, categoria: "Netflix", descripcion: "Netflix" });
  assert.equal(value.dia, 15);
  assert.equal(value.categoria, "Netflix");
  assert.ok(!missing.includes("dia"));
  assert.ok(!missing.includes("categoria"));
});

test("normalizeRecurrenteSlots: invalid dia (out of 1-31) → null", () => {
  assert.equal(normalizeRecurrenteSlots({ monto: 1, dia: 40 }).value.dia, null);
  assert.equal(normalizeRecurrenteSlots({ monto: 1, dia: 0 }).value.dia, null);
  assert.equal(normalizeRecurrenteSlots({ monto: 1 }).value.dia, null);
});

test("normalizeRecurrenteSlots: 'gasto' maps to egreso", () => {
  assert.equal(normalizeRecurrenteSlots({ tipo: "gasto" }).value.tipo, "egreso");
});

test("normalizeRecurrenteSlots: invalid frecuencia → null + missing", () => {
  const { value, missing } = normalizeRecurrenteSlots({ monto: 100, tipo: "egreso", frecuencia: "cuando sea", descripcion: "x" });
  assert.equal(value.frecuencia, null);
  assert.ok(missing.includes("frecuencia"));
});

// ===== Edit slots =====

test("normalizeEditSlots: monto change valid", () => {
  const { value, valid } = normalizeEditSlots({ campo: "monto", valor: "5000", valor_anterior: "4000" });
  assert.equal(value.campo, "monto");
  assert.equal(value.valor, "5000");
  assert.equal(value.valorAnterior, "4000");
  assert.equal(valid, true);
});

test("normalizeEditSlots: empresa change", () => {
  const { value, valid } = normalizeEditSlots({ campo: "empresa", valor: "Pañalera" });
  assert.equal(value.campo, "empresa");
  assert.equal(valid, true);
});

test("normalizeEditSlots: moneda synonym 'dolares' → USD", () => {
  assert.equal(normalizeEditSlots({ campo: "moneda", valor: "dolares" }).value.valor, "USD");
  assert.equal(normalizeEditSlots({ campo: "moneda", valor: "pesos" }).value.valor, "ARS");
});

test("normalizeEditSlots: unknown field → invalid", () => {
  assert.equal(normalizeEditSlots({ campo: "color", valor: "rojo" }).valid, false);
});

test("normalizeEditSlots: missing valor → invalid", () => {
  assert.equal(normalizeEditSlots({ campo: "monto" }).valid, false);
});

// ===== Echos (human-readable confirmation strings) =====

test("buildReportEcho: mentions period and format", () => {
  const echo = buildReportEcho(normalizeReportSlots({ periodo: "mes", mes: "2026-05", formato: "pdf" }).value);
  assert.match(echo, /PDF/i);
  assert.match(echo, /mes|2026-05/i);
});

test("buildRecurrenteEcho: mentions monto and frecuencia", () => {
  const echo = buildRecurrenteEcho(normalizeRecurrenteSlots({ monto: 10000, tipo: "egreso", moneda: "ARS", frecuencia: "mensual", descripcion: "Alquiler" }).value);
  assert.match(echo, /10000|10\.000/);
  assert.match(echo, /mensual/i);
});

test("buildEditEcho: mentions field and new value", () => {
  const echo = buildEditEcho(normalizeEditSlots({ campo: "monto", valor: "5000", valor_anterior: "4000" }).value);
  assert.match(echo, /5000/);
  assert.match(echo, /monto/i);
});
