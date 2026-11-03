// Run: node --test lib/dateUtils.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBkkDateString } from './dateUtils.js';

test('5:56 AM Bangkok check-in (22:56Z previous day) is Bangkok "today", not the UTC date', () => {
  const checkIn = '2026-10-12T22:56:53.642+00:00';
  assert.equal(getBkkDateString(checkIn), '2026-10-13');
  assert.notEqual(checkIn.split('T')[0], getBkkDateString(checkIn));
});
