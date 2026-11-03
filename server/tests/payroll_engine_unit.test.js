/**
 * payroll_engine_unit.test.js — Unit Tests for payrollCalculationEngine.js
 *
 * Tests every exported function in isolation.
 * No database. No HTTP. No mocking required.
 * Must produce IDENTICAL numbers to the payroll_snapshot.test.js baseline.
 */

import assert from 'assert';
import {
  DEFAULT_SALARY_DIVISOR,
  calculateDailyRate,
  calculateUnpaidDeduction,
  calculateAttendanceScore,
  calculatePunctualityScore,
  calculateSopScore,
  calculatePeerScore,
  calculateKpiContribution,
  calculateBonus,
  calculateNetSalary,
  calculateLeaveDaysInMonth,
} from '../modules/hrm/engine/payrollCalculationEngine.js';

const LM_HR_WEIGHTS = { attendance: 40, punctuality: 0, sops: 40, peer_voting: 20 };

let passed = 0;
let failed = 0;

console.log('\n=== PAYROLL ENGINE UNIT TESTS ===\n');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assertClose(actual, expected, label, epsilon = 0.005) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// ── DEFAULT_SALARY_DIVISOR constant ───────────────────────────────────────────────
console.log('DEFAULT_SALARY_DIVISOR constant');
test('DEFAULT_SALARY_DIVISOR === 26', () => {
  assert.strictEqual(DEFAULT_SALARY_DIVISOR, 26);
});

// ── calculateDailyRate ────────────────────────────────────────────────────────
console.log('\ncalculateDailyRate');
test('salary=3000, divisor=26 → 115.384...', () => {
  assertClose(calculateDailyRate(3000, 26), 115.384615, 'daily_rate');
});
test('salary=4500, divisor=26 → 173.076...', () => {
  assertClose(calculateDailyRate(4500, 26), 173.076923, 'daily_rate');
});
test('salary=0 → 0', () => {
  assert.strictEqual(calculateDailyRate(0, 26), 0);
});
test('divisor=0 → 0 (guard)', () => {
  assert.strictEqual(calculateDailyRate(3000, 0), 0);
});

// ── calculateUnpaidDeduction ──────────────────────────────────────────────────
console.log('\ncalculateUnpaidDeduction');
test('dailyRate=115.384, 2 days → 230.77', () => {
  assertClose(calculateUnpaidDeduction(calculateDailyRate(3000, 26), 2), 230.77, 'deduction');
});
test('dailyRate=115.384, 1 day → 115.38', () => {
  assertClose(calculateUnpaidDeduction(calculateDailyRate(3000, 26), 1), 115.38, 'deduction');
});
test('0 unpaid days → 0', () => {
  assert.strictEqual(calculateUnpaidDeduction(115.38, 0), 0);
});
test('null unpaid days → 0', () => {
  assert.strictEqual(calculateUnpaidDeduction(115.38, null), 0);
});

// ── calculateAttendanceScore ──────────────────────────────────────────────────
console.log('\ncalculateAttendanceScore');
test('26/26 → 100', () => {
  assertClose(calculateAttendanceScore(26, 26), 100.0, 'att_score');
});
test('20/26 → 76.923', () => {
  assertClose(calculateAttendanceScore(20, 26), 76.923076, 'att_score');
});
test('capped at 100 when actual > working_days', () => {
  assertClose(calculateAttendanceScore(30, 26), 100.0, 'att_score cap');
});
test('working_days=0 → 0 (guard)', () => {
  assert.strictEqual(calculateAttendanceScore(26, 0), 0);
});

// ── calculatePunctualityScore ─────────────────────────────────────────────────
console.log('\ncalculatePunctualityScore');
test('20/20 → 100', () => {
  assertClose(calculatePunctualityScore(20, 20), 100.0, 'punct_score');
});
test('15/20 → 75', () => {
  assertClose(calculatePunctualityScore(15, 20), 75.0, 'punct_score');
});
test('actual=0 → 0 (guard)', () => {
  assert.strictEqual(calculatePunctualityScore(0, 0), 0);
});

// ── calculateSopScore ─────────────────────────────────────────────────────────
console.log('\ncalculateSopScore');
test('8/10 → 80', () => {
  assertClose(calculateSopScore(8, 10), 80.0, 'sop_score');
});
test('10/10 → 100', () => {
  assertClose(calculateSopScore(10, 10), 100.0, 'sop_score');
});
test('0 tasks → 100 (LM_HR default)', () => {
  assertClose(calculateSopScore(0, 0), 100.0, 'sop_score default');
});

// ── calculatePeerScore ────────────────────────────────────────────────────────
console.log('\ncalculatePeerScore');
test('4.0/5.0 → 80', () => {
  assertClose(calculatePeerScore(4.0, 5), 80.0, 'peer_score');
});
test('5.0/5.0 → 100', () => {
  assertClose(calculatePeerScore(5.0, 5), 100.0, 'peer_score');
});
test('null avg_stars → 100 (LM_HR default)', () => {
  assertClose(calculatePeerScore(null, 5), 100.0, 'peer_score default');
});

// ── calculateKpiContribution ──────────────────────────────────────────────────
console.log('\ncalculateKpiContribution');
test('all 100 scores → 100', () => {
  const scores = { attendance: 100, punctuality: 100, sop: 100, peer: 100 };
  assertClose(calculateKpiContribution(scores, LM_HR_WEIGHTS), 100.0, 'kpi');
});
test('att=76.92, sop=80, peer=80, punct=0 weight → 78.769', () => {
  const scores = { attendance: 76.923076, punctuality: 100, sop: 80, peer: 80 };
  assertClose(calculateKpiContribution(scores, LM_HR_WEIGHTS), 78.769, 'kpi');
});
test('all 0 scores → 0', () => {
  const scores = { attendance: 0, punctuality: 0, sop: 0, peer: 0 };
  assertClose(calculateKpiContribution(scores, LM_HR_WEIGHTS), 0, 'kpi');
});

// ── calculateBonus ────────────────────────────────────────────────────────────
console.log('\ncalculateBonus');
test('basic=3000, target=15%, kpi=100 → 450', () => {
  assertClose(calculateBonus(3000, 15, 100), 450.0, 'bonus');
});
test('basic=3000, target=15%, kpi=80 → 360', () => {
  assertClose(calculateBonus(3000, 15, 80), 360.0, 'bonus');
});
test('basic=3000, target=15%, kpi=78.769 → 354.46', () => {
  assertClose(calculateBonus(3000, 15, 78.769), 354.46, 'bonus');
});
test('kpi=0 → bonus=0', () => {
  assert.strictEqual(calculateBonus(3000, 15, 0), 0);
});

// ── calculateNetSalary ────────────────────────────────────────────────────────
console.log('\ncalculateNetSalary');
test('basic=3000, allow=0, bonus=450, deduct=0 → 3450', () => {
  assertClose(calculateNetSalary(3000, 0, 450, 0), 3450.0, 'net');
});
test('basic=3000, allow=200, bonus=360, deduct=100 → 3460', () => {
  assertClose(calculateNetSalary(3000, 200, 360, 100), 3460.0, 'net');
});
test('with unpaid deduction: basic=3000, allow=0, bonus=354.46, deduct=230.77 → 3123.69', () => {
  assertClose(calculateNetSalary(3000, 0, 354.46, 230.77), 3123.69, 'net');
});

// ── calculateLeaveDaysInMonth ─────────────────────────────────────────────────
console.log('\ncalculateLeaveDaysInMonth');
test('Sep 30 → Oct 2 in September payroll = 1 day', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-09-30','2026-10-02','2026-09-01','2026-09-30'),
    1
  );
});
test('Sep 30 → Oct 2 in October payroll = 2 days', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-09-30','2026-10-02','2026-10-01','2026-10-31'),
    2
  );
});
test('Sunday only = 0 days', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-09-13','2026-09-13','2026-09-01','2026-09-30'),
    0
  );
});
test('Sat+Sun+Mon = 2 days', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-09-12','2026-09-14','2026-09-01','2026-09-30'),
    2
  );
});
test('Mon–Fri within month = 5 days', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-09-07','2026-09-11','2026-09-01','2026-09-30'),
    5
  );
});
test('leave entirely outside month = 0', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-08-01','2026-08-31','2026-09-01','2026-09-30'),
    0
  );
});
test('Jan 31 → Feb 1 in January = 1 day (Jan 31 2026 = Sat)', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-01-31','2026-02-01','2026-01-01','2026-01-31'),
    1 // Jan 31 = Saturday → counted; Feb 1 is in Feb payroll
  );
});
test('Dec 31 → Jan 1 year boundary in December = 1 day (Dec 31 2026 = Thu)', () => {
  assert.strictEqual(
    calculateLeaveDaysInMonth('2026-12-31','2027-01-01','2026-12-01','2026-12-31'),
    1
  );
});

test('calendar leave dates are stable in Bangkok, UTC and New York', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Asia/Bangkok', 'UTC', 'America/New_York']) {
      process.env.TZ = zone;
      assert.strictEqual(calculateLeaveDaysInMonth('2026-09-13','2026-09-13','2026-09-01','2026-09-30'), 0, zone);
      assert.strictEqual(calculateLeaveDaysInMonth('2026-09-07','2026-09-11','2026-09-01','2026-09-30'), 5, zone);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`);
console.log(`ENGINE UNIT TEST RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('❌ ENGINE TESTS FAILED — DO NOT PROCEED');
  process.exit(1);
} else {
  console.log('✅ ALL ENGINE UNIT TESTS PASSED');
}
