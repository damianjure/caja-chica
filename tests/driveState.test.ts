import test from 'node:test';
import assert from 'node:assert/strict';

import { driveSectionState } from '../src/dashboard/driveState';

test('driveSectionState: loading first', () => {
  assert.equal(driveSectionState({ loading: true, failed: false, status: null }), 'loading');
});

test('driveSectionState: a failed status request is an error, not "not connected"', () => {
  assert.equal(driveSectionState({ loading: false, failed: true, status: null }), 'error');
});

test('driveSectionState: server without Drive → disabled', () => {
  assert.equal(driveSectionState({ loading: false, failed: false, status: { connected: false, enabled: false } }), 'disabled');
});

test('driveSectionState: connected / disconnected', () => {
  assert.equal(driveSectionState({ loading: false, failed: false, status: { connected: true, enabled: true } }), 'connected');
  assert.equal(driveSectionState({ loading: false, failed: false, status: { connected: false, enabled: true } }), 'disconnected');
});
