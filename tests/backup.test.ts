import test from 'node:test';
import assert from 'node:assert/strict';

import { createZip } from '../src/server/zip';
import { toCsv, buildBackupZip, backupFileName } from '../src/server/backup';

test('createZip: firma PK local + EOCD y cuenta de entradas', () => {
  const zip = createZip([
    { name: 'a.txt', data: Buffer.from('hola') },
    { name: 'b.txt', data: Buffer.from('chau') },
  ]);
  // local file header signature
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  // EOCD signature en los últimos 22 bytes
  const eocd = zip.subarray(zip.length - 22);
  assert.equal(eocd.readUInt32LE(0), 0x06054b50);
  assert.equal(eocd.readUInt16LE(10), 2); // total entries
  // contiene nombres y datos
  const s = zip.toString('latin1');
  assert.ok(s.includes('a.txt') && s.includes('hola'));
  assert.ok(s.includes('b.txt') && s.includes('chau'));
});

test('toCsv: encabezado + escape de comas/comillas/saltos', () => {
  const csv = toCsv([{ a: 'x,y', b: 'he "lo"', c: 1 }], ['a', 'b', 'c']);
  assert.equal(csv, 'a,b,c\n"x,y","he ""lo""",1');
});

test('toCsv: sin filas → solo encabezado', () => {
  assert.equal(toCsv([], ['a', 'b']), 'a,b');
});

test('buildBackupZip: 3 entradas csv aunque esté vacío', () => {
  const zip = buildBackupZip({ movimientos: [], empresas: [], categorias: [] });
  const eocd = zip.subarray(zip.length - 22);
  assert.equal(eocd.readUInt16LE(10), 3);
  const s = zip.toString('latin1');
  assert.ok(s.includes('movimientos.csv') && s.includes('empresas.csv') && s.includes('categorias.csv'));
});

test('backupFileName: incluye fecha ISO', () => {
  assert.equal(backupFileName(new Date('2026-06-02T10:00:00Z')), 'caja-chica-backup-2026-06-02.zip');
});
