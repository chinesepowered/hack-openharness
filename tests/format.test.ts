import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtCost, fmtDuration } from '../src/lib/client/format.ts';

test('fmtDuration rounds before splitting minutes', () => {
  assert.equal(fmtDuration(659.9), '11m 00s');
  assert.equal(fmtDuration(59.6), '1m 00s');
  assert.equal(fmtDuration(764.2), '12m 44s');
  assert.equal(fmtDuration(42.4), '42s');
  assert.equal(fmtDuration(undefined), '–');
});

test('fmtCost', () => {
  assert.equal(fmtCost(0.0336), '$0.03');
  assert.equal(fmtCost(0.0081), '$0.008');
  assert.equal(fmtCost(1.2047), '$1.20');
});
