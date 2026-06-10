import test from "node:test";
import assert from "node:assert/strict";

import { buildBatchSummaryText, buildBatchKeyboard } from "../src/bot/extraction.ts";
import { createPendingExtraction } from "../src/server/extractionReview.ts";
import type { PendingExtractionData } from "../src/server/validation.ts";

function seedEntries(count: number, confidence = 0.9): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const data: PendingExtractionData = {
      monto: 100 + i,
      moneda: "ARS",
      tipo: "egreso",
      empresa: "Comercio " + i,
      cuit: null,
      categoria: "Varios",
      descripcion: "tx " + i,
      fecha: null,
      confidence,
      sourceType: "statement",
    };
    const entry = createPendingExtraction({
      chatId: 999_000 + count,
      dashboardId: null,
      userId: "u1",
      ownerUserId: "u1",
      data,
      messageId: 0,
      awaitingCompany: false,
      empresaOptions: null,
      categoriaOptions: null,
    });
    ids.push(entry.id);
  }
  return ids;
}

test("buildBatchSummaryText: capea el detalle y agrega '… y N más'", () => {
  const ids = seedEntries(20);
  const text = buildBatchSummaryText(ids, { singular: "transacción", plural: "transacciones" });
  assert.ok(text.includes("20 transacciones"));
  assert.ok(text.includes("… y 5 más"));
  // solo 15 renglones detallados
  const detailLines = text.split("\n").filter((l) => /^\d+\./.test(l));
  assert.equal(detailLines.length, 15);
});

test("buildBatchSummaryText: pocos ítems → sin '… y N más', noun por defecto tickets", () => {
  const ids = seedEntries(2);
  const text = buildBatchSummaryText(ids);
  assert.ok(text.includes("2 tickets"));
  assert.ok(!text.includes("más"));
});

test("buildBatchKeyboard: capea los botones de revisión a 6", () => {
  const ids = seedEntries(20, 0.3); // todos low-confidence
  const kb = buildBatchKeyboard("batch-x", ids);
  const reviewButtons = kb.inline_keyboard.flat().filter((b) => b.callback_data.startsWith("eb:rev:"));
  assert.equal(reviewButtons.length, 6);
  // guardar todos + cancelar siguen presentes
  assert.ok(kb.inline_keyboard.flat().some((b) => b.callback_data.startsWith("eb:save:")));
  assert.ok(kb.inline_keyboard.flat().some((b) => b.callback_data.startsWith("eb:cancel:")));
});
