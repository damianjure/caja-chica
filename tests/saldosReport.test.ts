import test from "node:test";
import assert from "node:assert/strict";

import { buildSaldosReport } from "../src/server/reportExports.ts";
import type { ReportFilters } from "../src/reports/shared.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mov(empresa_nombre: string, tipo: "ingreso" | "egreso", monto: number, moneda = "ARS") {
  return {
    id: "x",
    created_at: "2026-06-15T12:00:00.000Z",
    empresa_nombre,
    tipo,
    moneda,
    monto,
    categoria: "cat",
    descripcion: "desc",
    original_text: "",
    conciliado: false,
    deleted_at: null,
    owner_user_id: "u",
    dashboard_id: null,
    is_demo: false,
  };
}

const movements = [
  mov("A", "ingreso", 1000),
  mov("A", "egreso", 400),
  mov("B", "ingreso", 500),
  mov("B", "egreso", 200),
];

const allFilters: ReportFilters = { companies: [], tipo: "all", moneda: "all" };
const filterArgs = {
  format: "csv" as const,
  fileName: "saldos.csv",
  periodLabel: "Junio 2026",
  filters: allFilters,
  movements,
};

// ---------------------------------------------------------------------------
// T10 — buildSaldosReport CSV
// ---------------------------------------------------------------------------

test("buildSaldosReport CSV: returns buffer with correct structure", () => {
  const { buffer, mimeType } = buildSaldosReport(filterArgs);
  assert.ok(buffer instanceof Buffer);
  assert.equal(mimeType, "text/csv;charset=utf-8");
  const text = buffer.toString("utf8");
  const rows = text.trim().split("\n");
  // header + A + B + Total = 4 rows
  assert.equal(rows.length, 4);
  assert.ok(rows[0].startsWith("Empresa"));
});

test("buildSaldosReport CSV: correct saldo_neto values", () => {
  const { buffer } = buildSaldosReport(filterArgs);
  const text = buffer.toString("utf8");
  const rows = text.trim().split("\n");
  // Row for A: ingreso=1000, egreso=400, saldo=600
  const rowA = rows.find((r) => r.startsWith("A,"));
  assert.ok(rowA, "Row A not found");
  assert.ok(rowA!.includes("1000"), "ingreso A");
  assert.ok(rowA!.includes("400"), "egreso A");
  assert.ok(rowA!.includes("600"), "saldo A");
  // Total row: ingreso=1500, egreso=600, saldo=900
  const rowTotal = rows.find((r) => r.startsWith("Total"));
  assert.ok(rowTotal, "Total row not found");
  assert.ok(rowTotal!.includes("1500"), "total ingreso");
  assert.ok(rowTotal!.includes("600"), "total egreso");
  assert.ok(rowTotal!.includes("900"), "total saldo");
});

test("buildSaldosReport CSV: alcance filter restricts companies", () => {
  const { buffer } = buildSaldosReport({
    ...filterArgs,
    filters: { ...allFilters, companies: ["A"] },
  });
  const text = buffer.toString("utf8");
  const rows = text.trim().split("\n");
  // header + A + Total = 3 rows
  assert.equal(rows.length, 3);
  assert.ok(!text.includes("\nB,"), "B should not appear");
  const rowTotal = rows.find((r) => r.startsWith("Total"));
  assert.ok(rowTotal!.includes("1000"), "total ingreso should be A only");
  assert.ok(rowTotal!.includes("400"), "total egreso should be A only");
});

test("buildSaldosReport CSV: no movements → only Total row with zeros", () => {
  const { buffer } = buildSaldosReport({ ...filterArgs, movements: [] });
  const text = buffer.toString("utf8");
  const rows = text.trim().split("\n");
  assert.equal(rows.length, 2); // header + Total
  const rowTotal = rows[1];
  assert.ok(rowTotal.startsWith("Total"), "only total row");
  assert.ok(rowTotal.includes("0"), "zeros");
});

// ---------------------------------------------------------------------------
// T10 — buildSaldosReport PDF (smoke test)
// ---------------------------------------------------------------------------

test("buildSaldosReport PDF: returns non-empty buffer", () => {
  const { buffer, mimeType } = buildSaldosReport({ ...filterArgs, format: "pdf", fileName: "saldos.pdf" });
  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 0);
  assert.equal(mimeType, "application/pdf");
});
