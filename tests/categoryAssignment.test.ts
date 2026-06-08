import test from "node:test";
import assert from "node:assert/strict";
import { getPendingCategoryAssignment } from "../src/dashboard/categoryAssignment.ts";

const item = (categoria: string) => ({
  monto: 5000, tipo: "egreso" as const, moneda: "ARS" as const,
  categoria, empresa: "Personal", descripcion: "x",
});
const cats = (...names: string[]) => names.map((nombre, i) => ({ id: String(i), nombre })) as any;

test("new suggested category (not existing) → pending", () => {
  const r = getPendingCategoryAssignment([item("Nafta")], "cargué nafta", cats("Comida", "Sueldo"));
  assert.equal(r?.suggested, "Nafta");
});

test("existing category (case-insensitive) → null", () => {
  assert.equal(getPendingCategoryAssignment([item("comida")], "t", cats("Comida")), null);
});

test("'Otros' → null (no prompt)", () => {
  assert.equal(getPendingCategoryAssignment([item("Otros")], "t", cats("Comida")), null);
});

test("empty category → null", () => {
  assert.equal(getPendingCategoryAssignment([item("")], "t", cats("Comida")), null);
});

test("multiple items → null", () => {
  assert.equal(getPendingCategoryAssignment([item("Nafta"), item("Peaje")], "t", cats()), null);
});
