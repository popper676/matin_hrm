// Run: node --test src/utils/dateUtils.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toBkkDate, formatBkkDateTime } from './dateUtils.js';

// Kitchen Shift 1 (06:00-15:00) check-in at 5:56 AM Bangkok, stored as UTC on the previous date.
const CHECK_IN = '2026-10-12T22:56:53.642+00:00';

test('early-morning Bangkok check-in resolves to the Bangkok business date', () => {
  assert.equal(toBkkDate(CHECK_IN), '2026-10-13');
});

test('open record is found for "today" at 15:07 BKK (UTC date is still Oct 13 but check_in string starts with Oct 12)', () => {
  const todayBkk = toBkkDate('2026-10-13T08:07:00Z');
  const records = [{ check_in: CHECK_IN, check_out: null }];
  assert.equal(records.filter(r => toBkkDate(r.check_in) === todayBkk && !r.check_out).length, 1);
  // Old logic (string prefix on UTC) missed it:
  assert.equal(CHECK_IN.startsWith('2026-10-13'), false);
});

test('Bangkok display time is independent of the host timezone', () => {
  assert.equal(formatBkkDateTime(new Date(CHECK_IN)), 'Tue, Oct 13 5:56 AM');
  assert.equal(formatBkkDateTime(new Date('2026-10-13T08:07:50Z')), 'Tue, Oct 13 3:07 PM');
});

test('invalid input yields empty date', () => {
  assert.equal(toBkkDate(null), '');
  assert.equal(toBkkDate('nope'), '');
});
