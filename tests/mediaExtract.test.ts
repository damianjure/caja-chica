import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPhotoFromBytes,
  extractReceiptItemsFromBytes,
  extractStatementFromBytes,
  extractMultipleFromBytes,
} from "../src/server/mediaExtract.ts";

// Channel-agnostic: these take bytes directly (no Telegram/HTTP download), which
// is exactly how a future WhatsApp adapter will call them.
const BYTES = new TextEncoder().encode("fake-bytes");

function fakeGenAI(texts: string[]) {
  const calls = { upload: 0, generate: 0, delete: 0 };
  let i = 0;
  return {
    calls,
    files: {
      async upload() {
        calls.upload += 1;
        return { name: `files/f${calls.upload}`, uri: `gs://f${calls.upload}`, mimeType: "image/jpeg" };
      },
      async delete() {
        calls.delete += 1;
      },
    },
    models: {
      async generateContent() {
        const t = texts[Math.min(i, texts.length - 1)];
        i += 1;
        calls.generate += 1;
        return { text: t };
      },
    },
  };
}

test("extractReceiptItemsFromBytes: extrae renglones desde un Buffer (sin descarga)", async () => {
  const genAI = fakeGenAI([
    JSON.stringify({
      document_kind: "receipt",
      empresa: "Carrefour",
      cuit: null,
      moneda: "ARS",
      fecha: "2026-06-10",
      total: 3000,
      confidence: 0.9,
      items: [{ descripcion: "Café", monto: 3000, cantidad: 1, categoria: "Almacén" }],
    }),
  ]);
  const { result, sourceType } = await extractReceiptItemsFromBytes(genAI as any, BYTES, "image/jpeg");
  assert.equal(result.documentKind, "receipt");
  assert.equal(result.empresa, "Carrefour");
  assert.equal(result.items.length, 1);
  assert.equal(sourceType, "photo");
  assert.equal(genAI.calls.upload, 1);
  assert.equal(genAI.calls.delete, 1);
});

test("extractReceiptItemsFromBytes: PDF → sourceType 'pdf'", async () => {
  const genAI = fakeGenAI([
    JSON.stringify({ document_kind: "receipt", moneda: "ARS", total: 500, confidence: 0.8, items: [] }),
  ]);
  const { sourceType } = await extractReceiptItemsFromBytes(genAI as any, BYTES, "application/pdf");
  assert.equal(sourceType, "pdf");
});

test("extractPhotoFromBytes: reintenta con HANDWRITTEN si confidence < 0.5", async () => {
  const genAI = fakeGenAI([
    JSON.stringify({ monto: null, moneda: "ARS", tipo: "egreso", empresa: null, cuit: null, categoria: "Varios", descripcion: "ilegible", fecha: null, confidence: 0.2 }),
    JSON.stringify({ monto: 800, moneda: "ARS", tipo: "egreso", empresa: "Kiosco", cuit: null, categoria: "Varios", descripcion: "kiosco", fecha: null, confidence: 0.7 }),
  ]);
  const { result, sourceType } = await extractPhotoFromBytes(genAI as any, BYTES, "image/jpeg");
  assert.equal(result.monto, 800);
  assert.equal(sourceType, "handwritten");
  assert.equal(genAI.calls.generate, 2);
});

test("extractStatementFromBytes: devuelve cada transacción", async () => {
  const genAI = fakeGenAI([
    JSON.stringify([
      { monto: 8500, moneda: "ARS", tipo: "egreso", empresa: "Amazon", categoria: "Electrónica", descripcion: "Amazon (cuota 3 de 6)", fecha: "2026-05-12", confidence: 0.95 },
      { monto: 1200, moneda: "ARS", tipo: "ingreso", empresa: "ML", categoria: "Varios", descripcion: "Reintegro", fecha: "2026-05-15", confidence: 0.9 },
    ]),
  ]);
  const items = await extractStatementFromBytes(genAI as any, BYTES, "application/pdf");
  assert.equal(items.length, 2);
  assert.equal(items[0].monto, 8500);
});

test("extractMultipleFromBytes: sube cada buffer y devuelve el lote", async () => {
  const genAI = fakeGenAI([
    JSON.stringify([
      { monto: 100, moneda: "ARS", tipo: "egreso", empresa: "A", cuit: null, categoria: "X", descripcion: "d1", fecha: null, confidence: 0.9 },
      { monto: 200, moneda: "ARS", tipo: "egreso", empresa: "B", cuit: null, categoria: "Y", descripcion: "d2", fecha: null, confidence: 0.8 },
    ]),
  ]);
  const results = await extractMultipleFromBytes(genAI as any, [
    { bytes: BYTES, mimeType: "image/jpeg" },
    { bytes: BYTES, mimeType: "image/jpeg" },
  ]);
  assert.equal(results.length, 2);
  assert.equal(genAI.calls.upload, 2);
});
