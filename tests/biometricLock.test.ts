import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPromptUnlock } from '../src/lib/biometricLock';

test('shouldPromptUnlock: deshabilitado → nunca pide', () => {
  assert.equal(shouldPromptUnlock(false, null, Date.now()), false);
  assert.equal(shouldPromptUnlock(false, Date.now(), Date.now()), false);
});

test('shouldPromptUnlock: habilitado sin lastActive → pide (cold open)', () => {
  assert.equal(shouldPromptUnlock(true, null, 1000), true);
});

test('shouldPromptUnlock: dentro de gracia → no pide', () => {
  const now = 100_000;
  assert.equal(shouldPromptUnlock(true, now - 5_000, now, 90_000), false);
});

test('shouldPromptUnlock: pasada la gracia → pide', () => {
  const now = 1_000_000;
  assert.equal(shouldPromptUnlock(true, now - 120_000, now, 90_000), true);
});

test('shouldPromptUnlock: justo en el borde → no pide (>, no >=)', () => {
  const now = 500_000;
  assert.equal(shouldPromptUnlock(true, now - 90_000, now, 90_000), false);
});
