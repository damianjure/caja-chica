import test from "node:test";
import assert from "node:assert/strict";

import { buildReportSummaryText } from "../src/reports/shared.ts";

test("buildReportSummaryText: cuenta + totales ARS + neto", () => {
  const movs = [
    { tipo: "ingreso", moneda: "ARS", monto: 1000 },
    { tipo: "egreso", moneda: "ARS", monto: 400 },
    { tipo: "ingreso", moneda: "ARS", monto: 0 },
  ];
  const s = buildReportSummaryText(movs, "Mayo 2026");
  assert.match(s, /Mayo 2026/);
  assert.match(s, /3 movimientos/);
  assert.match(s, /1\.000/); // ingresos ARS
  assert.match(s, /600/); // neto 1000-400
});

test("buildReportSummaryText: separa USD cuando hay", () => {
  const movs = [
    { tipo: "ingreso", moneda: "USD", monto: 50 },
    { tipo: "egreso", moneda: "USD", monto: 20 },
  ];
  const s = buildReportSummaryText(movs, "Hoy");
  assert.match(s, /u\$s/);
  assert.match(s, /50/);
  assert.match(s, /30/); // neto USD
});

test("buildReportSummaryText: 1 movimiento singular + montos string", () => {
  const s = buildReportSummaryText([{ tipo: "egreso", moneda: "ARS", monto: "4500" }], "Hoy");
  assert.match(s, /1 movimiento\b/);
  assert.match(s, /4\.500/);
});

test("buildReportSummaryText: vacío → 0 movimientos", () => {
  const s = buildReportSummaryText([], "Mes");
  assert.match(s, /0 movimientos/);
});
