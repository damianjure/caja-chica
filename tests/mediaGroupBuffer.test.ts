import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaGroupBuffer } from '../src/server/mediaGroupBuffer.ts';

test('add() buffers items and flushes after debounce', async () => {
  const buf = new MediaGroupBuffer<string>({ debounceMs: 50 });
  const flushed: string[][] = [];

  buf.add('g1', 'a', (items) => flushed.push(items));
  buf.add('g1', 'b', (items) => flushed.push(items));
  buf.add('g1', 'c', (items) => flushed.push(items));

  assert.equal(buf.size(), 1);
  assert.equal(flushed.length, 0);

  await new Promise((r) => setTimeout(r, 100));

  assert.equal(flushed.length, 1);
  assert.deepEqual(flushed[0], ['a', 'b', 'c']);
  assert.equal(buf.size(), 0);
});

test('add() resets debounce timer on each new item', async () => {
  const buf = new MediaGroupBuffer<number>({ debounceMs: 80 });
  const flushed: number[][] = [];

  buf.add('g2', 1, (items) => flushed.push(items));
  await new Promise((r) => setTimeout(r, 50));
  buf.add('g2', 2, (items) => flushed.push(items));
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(flushed.length, 0, 'should not have flushed yet after reset');

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(flushed.length, 1);
  assert.deepEqual(flushed[0], [1, 2]);
});

test('flush() forces immediate flush', async () => {
  const buf = new MediaGroupBuffer<string>({ debounceMs: 5000 });
  const flushed: string[][] = [];

  buf.add('g3', 'x', (items) => flushed.push(items));
  buf.add('g3', 'y', (items) => flushed.push(items));

  assert.equal(buf.size(), 1);

  buf.flush('g3', (items) => flushed.push(items));

  assert.equal(buf.size(), 0);
  assert.equal(flushed.length, 1);
  assert.deepEqual(flushed[0], ['x', 'y']);
});

test('flush() on nonexistent group is a no-op', () => {
  const buf = new MediaGroupBuffer<string>();
  const flushed: string[][] = [];
  buf.flush('nonexistent', (items) => flushed.push(items));
  assert.equal(flushed.length, 0);
});

test('multiple groups are tracked independently', async () => {
  const buf = new MediaGroupBuffer<string>({ debounceMs: 50 });
  const flushed: Record<string, string[]> = {};

  buf.add('ga', 'a1', (items) => { flushed['ga'] = items; });
  buf.add('gb', 'b1', (items) => { flushed['gb'] = items; });
  buf.add('ga', 'a2', (items) => { flushed['ga'] = items; });

  assert.equal(buf.size(), 2);

  await new Promise((r) => setTimeout(r, 100));

  assert.deepEqual(flushed['ga'], ['a1', 'a2']);
  assert.deepEqual(flushed['gb'], ['b1']);
  assert.equal(buf.size(), 0);
});
