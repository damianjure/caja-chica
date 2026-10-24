import test from "node:test";
import assert from "node:assert/strict";

import { hasReadableAmount } from "../src/server/receiptAmounts.ts";

test("hasReadableAmount: a line with an amount is enough", () => {
  assert.equal(hasReadableAmount({ items: [{ monto: null }, { monto: 120 }], total: null } as any), true);
});

test("hasReadableAmount: a total-only ticket counts", () => {
  assert.equal(hasReadableAmount({ items: [], total: 4500 } as any), true);
});

test("hasReadableAmount: no line amounts and no total → nothing to save", () => {
  assert.equal(hasReadableAmount({ items: [{ monto: null }], total: null } as any), false);
  assert.equal(hasReadableAmount({ items: [], total: 0 } as any), false);
});
