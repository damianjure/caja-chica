import test from "node:test";
import assert from "node:assert/strict";

import { filterMovementsForReport, type ReportFilters, type ReportDateRange } from "../src/reports/shared.ts";
import { parseReportExportRequest } from "../src/server/validation.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const range: ReportDateRange = {
  start: new Date("2026-01-01T00:00:00.000Z"),
  end: new Date("2026-12-31T23:59:59.999Z"),
  label: "Test range",
};

function mov(empresa_nombre: string, tipo = "ingreso", moneda = "ARS") {
  return {
    created_at: "2026-06-15T12:00:00.000Z",
    empresa_nombre,
    tipo,
    moneda,
  };
}

const baseFilters: ReportFilters = {
  companies: [],
  tipo: "all",
  moneda: "all",
};

const movements = [mov("A"), mov("B"), mov("C")];

// ---------------------------------------------------------------------------
// T9 — filterMovementsForReport array match
// ---------------------------------------------------------------------------

test("filterMovementsForReport: categoria filtra por categoría (C-completo)", () => {
  const movs = [
    { ...mov("A"), categoria: "Combustible" },
    { ...mov("B"), categoria: "Servicios" },
    { ...mov("C"), categoria: "Combustible" },
  ];
  const result = filterMovementsForReport(movs, { ...baseFilters, categoria: "Combustible" }, range);
  assert.equal(result.length, 2);
  assert.ok(result.every((m: any) => m.categoria === "Combustible"));
});

test("filterMovementsForReport: categoria 'all' o ausente no filtra", () => {
  const movs = [{ ...mov("A"), categoria: "X" }, { ...mov("B"), categoria: "Y" }];
  assert.equal(filterMovementsForReport(movs, { ...baseFilters, categoria: "all" }, range).length, 2);
  assert.equal(filterMovementsForReport(movs, baseFilters, range).length, 2);
});

test("parseReportExportRequest: acepta categoria opcional", () => {
  const r = parseReportExportRequest({ format: "csv", period: "month", tipo: "all", moneda: "all", categoria: "Combustible" });
  assert.equal(r?.categoria, "Combustible");
  const r2 = parseReportExportRequest({ format: "csv", period: "month", tipo: "all", moneda: "all", categoria: "all" });
  assert.equal(r2?.categoria, undefined);
  const r3 = parseReportExportRequest({ format: "csv", period: "month", tipo: "all", moneda: "all" });
  assert.equal(r3?.categoria, undefined);
});

test("filterMovementsForReport: empty companies = all pass", () => {
  const result = filterMovementsForReport(movements, { ...baseFilters, companies: [] }, range);
  assert.equal(result.length, 3);
});

test("filterMovementsForReport: companies=['all'] = all pass", () => {
  const result = filterMovementsForReport(movements, { ...baseFilters, companies: ["all"] }, range);
  assert.equal(result.length, 3);
});

test("filterMovementsForReport: companies=['A','B'] = only A and B", () => {
  const result = filterMovementsForReport(movements, { ...baseFilters, companies: ["A", "B"] }, range);
  assert.equal(result.length, 2);
  assert.ok(result.every((m) => m.empresa_nombre === "A" || m.empresa_nombre === "B"));
});

test("filterMovementsForReport: companies=['A'] = only A", () => {
  const result = filterMovementsForReport(movements, { ...baseFilters, companies: ["A"] }, range);
  assert.equal(result.length, 1);
  assert.equal(result[0].empresa_nombre, "A");
});

// ---------------------------------------------------------------------------
// T9 — parseReportExportRequest normalization
// ---------------------------------------------------------------------------

const basePayload = {
  format: "csv",
  period: "month",
  month: "2026-06",
  tipo: "all",
  moneda: "all",
  destination: "local",
};

test("parseReportExportRequest: legacy company string → companies: [company]", () => {
  const result = parseReportExportRequest({ ...basePayload, company: "acme-id" });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, ["acme-id"]);
});

test("parseReportExportRequest: legacy company='all' → companies: []", () => {
  const result = parseReportExportRequest({ ...basePayload, company: "all" });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, []);
});

test("parseReportExportRequest: legacy company='' → companies: []", () => {
  const result = parseReportExportRequest({ ...basePayload, company: "" });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, []);
});

test("parseReportExportRequest: companies array passes through", () => {
  const result = parseReportExportRequest({ ...basePayload, companies: ["A", "B"] });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, ["A", "B"]);
});

test("parseReportExportRequest: companies takes priority over company", () => {
  const result = parseReportExportRequest({ ...basePayload, companies: ["X"], company: "Y" });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, ["X"]);
});

test("parseReportExportRequest: companies with empty strings are dropped", () => {
  const result = parseReportExportRequest({ ...basePayload, companies: ["A", "", "  ", "B"] });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, ["A", "B"]);
});

test("parseReportExportRequest: no company or companies → companies: []", () => {
  const result = parseReportExportRequest({ ...basePayload });
  assert.ok(result !== null);
  assert.deepEqual(result!.companies, []);
});
