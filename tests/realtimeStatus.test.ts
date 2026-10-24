import test from 'node:test';
import assert from 'node:assert/strict';

import { realtimeHealth } from '../src/dashboard/realtimeStatus';

test('realtimeHealth: subscribed is live', () => {
  assert.equal(realtimeHealth('SUBSCRIBED'), 'live');
});

test('realtimeHealth: channel error, timeout and closed mean the live updates are down', () => {
  assert.equal(realtimeHealth('CHANNEL_ERROR'), 'down');
  assert.equal(realtimeHealth('TIMED_OUT'), 'down');
  assert.equal(realtimeHealth('CLOSED'), 'down');
});

test('realtimeHealth: anything else is still connecting', () => {
  assert.equal(realtimeHealth('JOINING'), 'connecting');
});
