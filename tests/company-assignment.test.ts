import test from "node:test";
import assert from "node:assert/strict";

import { getPendingCompanyAssignment } from "../src/dashboard/companyAssignment.ts";

test("pide asignación cuando hay un único movimiento sin empresa", () => {
  const pending = getPendingCompanyAssignment(
    [
      {
        monto: 2500,
        tipo: "egreso",
        moneda: "ARS",
        categoria: "Comida",
        empresa: null,
        descripcion: "almuerzo",
      },
    ],
    "gasté 2500 en almuerzo",
  );

  assert.deepEqual(pending, {
    monto: 2500,
    tipo: "egreso",
    moneda: "ARS",
    categoria: "Comida",
    empresa: null,
    descripcion: "almuerzo",
    originalText: "gasté 2500 en almuerzo",
  });
});

test("no pide asignación cuando la empresa ya viene resuelta", () => {
  const pending = getPendingCompanyAssignment(
    [
      {
        monto: 2500,
        tipo: "egreso",
        moneda: "ARS",
        categoria: "Comida",
        empresa: "Personal",
        descripcion: "almuerzo",
      },
    ],
    "gasté 2500 en almuerzo",
  );

  assert.equal(pending, null);
});

test("no pide asignación cuando Gemini devolvió múltiples movimientos", () => {
  const pending = getPendingCompanyAssignment(
    [
      {
        monto: 1000,
        tipo: "egreso",
        moneda: "ARS",
        categoria: "Comida",
        empresa: null,
        descripcion: "café",
      },
      {
        monto: 2000,
        tipo: "egreso",
        moneda: "ARS",
        categoria: "Transporte",
        empresa: null,
        descripcion: "taxi",
      },
    ],
    "gasté en café y taxi",
  );

  assert.equal(pending, null);
});
