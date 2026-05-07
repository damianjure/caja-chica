import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferMediaMimeType,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_DOCUMENT_MIME_TYPES,
  extractFromPhoto,
} from '../src/server/telegramMedia.ts';
import {
  parsePhotoExtractionResult,
  parseMultiPhotoExtractionResult,
} from '../src/server/gemini.ts';

// --- inferMediaMimeType ---

test('inferMediaMimeType returns explicit mime type when supported', () => {
  assert.equal(inferMediaMimeType({ mimeType: 'image/jpeg', isDocument: false }), 'image/jpeg');
  assert.equal(inferMediaMimeType({ mimeType: 'application/pdf', isDocument: true }), 'application/pdf');
});

test('inferMediaMimeType returns null for unsupported mime on photo', () => {
  assert.equal(inferMediaMimeType({ mimeType: 'application/pdf', isDocument: false }), null);
  assert.equal(inferMediaMimeType({ mimeType: 'video/mp4', isDocument: false }), null);
});

test('inferMediaMimeType falls back to file extension', () => {
  assert.equal(inferMediaMimeType({ mimeType: null, filePath: 'doc.pdf', isDocument: true }), 'application/pdf');
  assert.equal(inferMediaMimeType({ mimeType: null, filePath: 'photo.jpg', isDocument: false }), 'image/jpeg');
  assert.equal(inferMediaMimeType({ mimeType: null, filePath: 'img.PNG', isDocument: false }), 'image/png');
});

test('inferMediaMimeType returns null when no usable info', () => {
  assert.equal(inferMediaMimeType({ mimeType: null, filePath: null, isDocument: false }), null);
  assert.equal(inferMediaMimeType({ mimeType: null, filePath: 'file.exe', isDocument: false }), null);
});

// --- parsePhotoExtractionResult ---

test('parsePhotoExtractionResult parses valid receipt JSON', () => {
  const json = JSON.stringify({
    monto: 1500,
    moneda: 'ARS',
    tipo: 'egreso',
    empresa: 'Carrefour',
    cuit: '30500010084',
    categoria: 'Supermercado',
    descripcion: 'Compra supermercado',
    fecha: '2026-05-07',
    confidence: 0.95,
  });
  const result = parsePhotoExtractionResult(json);
  assert.ok(result);
  assert.equal(result.monto, 1500);
  assert.equal(result.empresa, 'Carrefour');
  assert.equal(result.confidence, 0.95);
  assert.equal(result.fecha, '2026-05-07');
});

test('parsePhotoExtractionResult clamps confidence to [0,1]', () => {
  const json = JSON.stringify({ monto: 100, moneda: 'ARS', tipo: 'egreso', empresa: null, cuit: null, categoria: 'Varios', descripcion: 'test', fecha: null, confidence: 1.5 });
  const result = parsePhotoExtractionResult(json);
  assert.ok(result);
  assert.equal(result.confidence, 1);
});

test('parsePhotoExtractionResult handles null monto', () => {
  const json = JSON.stringify({ monto: null, moneda: 'ARS', tipo: 'egreso', empresa: null, cuit: null, categoria: 'Varios', descripcion: 'nota', fecha: null, confidence: 0.3 });
  const result = parsePhotoExtractionResult(json);
  assert.ok(result);
  assert.equal(result.monto, null);
});

test('parsePhotoExtractionResult returns null for invalid JSON', () => {
  assert.equal(parsePhotoExtractionResult('not json'), null);
  assert.equal(parsePhotoExtractionResult('[]'), null);
  assert.equal(parsePhotoExtractionResult('null'), null);
});

test('parsePhotoExtractionResult strips markdown fences', () => {
  const json = '```json\n{"monto":500,"moneda":"USD","tipo":"egreso","empresa":null,"cuit":null,"categoria":"Test","descripcion":"x","fecha":null,"confidence":0.8}\n```';
  const result = parsePhotoExtractionResult(json);
  assert.ok(result);
  assert.equal(result.monto, 500);
  assert.equal(result.moneda, 'USD');
});

// --- parseMultiPhotoExtractionResult ---

test('parseMultiPhotoExtractionResult parses array of receipts', () => {
  const json = JSON.stringify([
    { monto: 100, moneda: 'ARS', tipo: 'egreso', empresa: 'A', cuit: null, categoria: 'X', descripcion: 'd1', fecha: null, confidence: 0.9 },
    { monto: 200, moneda: 'ARS', tipo: 'egreso', empresa: 'B', cuit: null, categoria: 'Y', descripcion: 'd2', fecha: null, confidence: 0.8 },
  ]);
  const results = parseMultiPhotoExtractionResult(json);
  assert.ok(results);
  assert.equal(results.length, 2);
  assert.equal(results[0].monto, 100);
  assert.equal(results[1].empresa, 'B');
});

test('parseMultiPhotoExtractionResult returns null for non-array', () => {
  assert.equal(parseMultiPhotoExtractionResult('{"monto":100}'), null);
  assert.equal(parseMultiPhotoExtractionResult('not json'), null);
});

test('parseMultiPhotoExtractionResult filters out invalid items', () => {
  const json = JSON.stringify([
    { monto: 100, moneda: 'ARS', tipo: 'egreso', empresa: null, cuit: null, categoria: 'X', descripcion: 'd', fecha: null, confidence: 0.9 },
    'invalid item',
    null,
  ]);
  const results = parseMultiPhotoExtractionResult(json);
  assert.ok(results);
  assert.equal(results.length, 1);
});

// --- extractFromPhoto integration (mocked) ---

test('extractFromPhoto downloads, uploads, extracts and cleans up', async () => {
  const calls: string[] = [];

  const fakeGenAI = {
    files: {
      async upload() {
        calls.push('upload');
        return { name: 'files/img-1', uri: 'gs://gemini/img-1', mimeType: 'image/jpeg' };
      },
      async delete() {
        calls.push('delete');
      },
    },
    models: {
      async generateContent() {
        calls.push('generateContent');
        return {
          text: JSON.stringify({
            monto: 2500,
            moneda: 'ARS',
            tipo: 'egreso',
            empresa: 'Disco',
            cuit: null,
            categoria: 'Supermercado',
            descripcion: 'Compra supermercado Disco',
            fecha: '2026-05-07',
            confidence: 0.92,
          }),
        };
      },
    },
  };

  const { result, sourceType } = await extractFromPhoto({
    genAI: fakeGenAI as any,
    botToken: 'bot-token',
    filePath: 'photos/img.jpg',
    mimeType: 'image/jpeg',
    fetchImpl: async () =>
      new Response(new Blob(['fake-img'], { type: 'image/jpeg' }), { status: 200 }),
  });

  assert.equal(result.monto, 2500);
  assert.equal(result.empresa, 'Disco');
  assert.equal(result.confidence, 0.92);
  assert.equal(sourceType, 'photo');
  assert.ok(calls.includes('upload'));
  assert.ok(calls.includes('generateContent'));
  assert.ok(calls.includes('delete'));
});

test('extractFromPhoto retries with handwritten prompt on low confidence', async () => {
  let callCount = 0;

  const fakeGenAI = {
    files: {
      async upload() {
        return { name: `files/img-${callCount}`, uri: `gs://gemini/img-${callCount}`, mimeType: 'image/jpeg' };
      },
      async delete() {},
    },
    models: {
      async generateContent() {
        callCount++;
        if (callCount === 1) {
          return {
            text: JSON.stringify({ monto: null, moneda: 'ARS', tipo: 'egreso', empresa: null, cuit: null, categoria: 'Varios', descripcion: 'ilegible', fecha: null, confidence: 0.2 }),
          };
        }
        return {
          text: JSON.stringify({ monto: 800, moneda: 'ARS', tipo: 'egreso', empresa: 'Kiosco', cuit: null, categoria: 'Varios', descripcion: 'kiosco', fecha: null, confidence: 0.7 }),
        };
      },
    },
  };

  const { result, sourceType } = await extractFromPhoto({
    genAI: fakeGenAI as any,
    botToken: 'bot-token',
    filePath: 'photos/img.jpg',
    mimeType: 'image/jpeg',
    fetchImpl: async () =>
      new Response(new Blob(['img'], { type: 'image/jpeg' }), { status: 200 }),
  });

  assert.equal(callCount, 2);
  assert.equal(result.monto, 800);
  assert.equal(sourceType, 'handwritten');
});
