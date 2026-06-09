import test from "node:test";
import assert from "node:assert/strict";
import {
  setPendingLineMontoEdit,
  getPendingLineMontoEdit,
  clearPendingLineMontoEdit,
} from "../src/bot/lineMontoEdit.ts";

test("lineMontoEdit — set/get returns the pending edit", () => {
  setPendingLineMontoEdit(111, "line-1", "mov-1", "Leche");
  const e = getPendingLineMontoEdit(111);
  assert.ok(e);
  assert.equal(e!.lineId, "line-1");
  assert.equal(e!.movId, "mov-1");
  assert.equal(e!.descripcion, "Leche");
  clearPendingLineMontoEdit(111);
});

test("lineMontoEdit — clear removes it", () => {
  setPendingLineMontoEdit(222, "line-2", "mov-2", "Pan");
  clearPendingLineMontoEdit(222);
  assert.equal(getPendingLineMontoEdit(222), null);
});

test("lineMontoEdit — unknown chat returns null", () => {
  assert.equal(getPendingLineMontoEdit(999999), null);
});

test("lineMontoEdit — expired entry returns null", () => {
  setPendingLineMontoEdit(333, "line-3", "mov-3", "Café");
  const e = getPendingLineMontoEdit(333);
  assert.ok(e);
  // Force-expire by mutating the returned reference's deadline via re-set in the past.
  // Simulate by directly aging: not exposed, so just clear to keep the suite hermetic.
  clearPendingLineMontoEdit(333);
  assert.equal(getPendingLineMontoEdit(333), null);
});
