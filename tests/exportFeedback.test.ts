import test from 'node:test';
import assert from 'node:assert/strict';

import { exportPrecheck, exportResultFeedback, describeExportRecord } from '../src/dashboard/exportFeedback';

const mov = (over: any) => ({ tipo: 'egreso', moneda: 'ARS', empresa_nombre: 'Kiosco', categoria: 'Varios', created_at: '2026-06-10T12:00:00Z', ...over });
const req = (over: any = {}) => ({ format: 'pdf', period: 'range', from: '2026-06-01', to: '2026-06-30', companies: [], tipo: 'all', moneda: 'all', ...over });

test('exportPrecheck: a period without movements is reported before asking for the file', () => {
  assert.equal(
    exportPrecheck([mov({ created_at: '2026-05-10T12:00:00Z' })] as any, req() as any),
    'No hay movimientos para exportar con estos filtros.',
  );
});

test('exportPrecheck: respects company, type, currency and category like the server', () => {
  const history = [mov({ empresa_nombre: 'Kiosco', tipo: 'egreso', moneda: 'ARS', categoria: 'Varios' })] as any;
  assert.equal(exportPrecheck(history, req({ companies: ['Otra'] }) as any), 'No hay movimientos para exportar con estos filtros.');
  assert.equal(exportPrecheck(history, req({ tipo: 'ingreso' }) as any), 'No hay movimientos para exportar con estos filtros.');
  assert.equal(exportPrecheck(history, req({ moneda: 'USD' }) as any), 'No hay movimientos para exportar con estos filtros.');
  assert.equal(exportPrecheck(history, req({ categoria: 'Otros' }) as any), 'No hay movimientos para exportar con estos filtros.');
  assert.equal(exportPrecheck(history, req() as any), null);
});

test('exportResultFeedback: local download with content → no message (download starts)', () => {
  assert.equal(exportResultFeedback('local', { contentBase64: 'abc' } as any), null);
});

test('exportResultFeedback: local download without content → warning, never silent', () => {
  assert.deepEqual(exportResultFeedback('local', {} as any), { tone: 'warning', message: 'No se pudo descargar el informe. Probá de nuevo.' });
});

test('exportResultFeedback: Drive with and without link', () => {
  assert.deepEqual(exportResultFeedback('drive', { driveUrl: 'https://drive/x' } as any), { tone: 'success', message: 'Informe guardado en Drive.' });
  assert.deepEqual(exportResultFeedback('drive', {} as any), { tone: 'warning', message: 'No se pudo guardar en Drive.' });
});

test('describeExportRecord: readable row for the export history', () => {
  const row = describeExportRecord({
    id: 'r1', created_at: '2026-10-23T15:30:00Z', format: 'pdf', period_label: '01/10/2026 – 23/10/2026',
    company: 'all', tipo: 'all', moneda: 'all', total_movements: 12, file_name: 'informe.pdf',
    destination: 'drive', drive_url: 'https://drive/x',
  } as any);
  assert.equal(row.title, 'PDF · 01/10/2026 – 23/10/2026');
  assert.equal(row.detail, '12 movimientos · Guardado en Drive');
  assert.equal(row.driveUrl, 'https://drive/x');
  assert.match(row.date, /23/);
});

test('describeExportRecord: local CSV with one movement', () => {
  const row = describeExportRecord({
    id: 'r2', created_at: '2026-10-23T15:30:00Z', format: 'csv', period_label: 'Octubre 2026',
    company: 'Kiosco', tipo: 'egreso', moneda: 'ARS', total_movements: 1, file_name: 'x.csv', destination: 'local', drive_url: null,
  } as any);
  assert.equal(row.title, 'CSV · Octubre 2026');
  assert.equal(row.detail, '1 movimiento · Descargado · Kiosco');
  assert.equal(row.driveUrl, null);
});
