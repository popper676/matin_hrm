/**
 * payrollCalculationEngine.js — Pure Payroll Calculation Engine
 *
 * Phase 2 of the LM_HR HRM Payroll Architecture Refactor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DESIGN RULES — READ BEFORE EDITING                                     ║
 * ║                                                                          ║
 * ║  1. This file contains ONLY pure functions.                              ║
 * ║  2. NO database access. NO Supabase imports. NO side effects.            ║
 * ║  3. Every function receives all required inputs as parameters.           ║
 * ║  4. Every function returns a single value or plain object.               ║
 * ║  5. All functions are independently unit-testable without mocking.       ║
 * ║  6. Company-specific policy values come from a `policy` parameter.       ║
 * ║     The engine itself contains no company-specific hardcoded constants.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Phase 2 Policy Integration:
 *
 *   All company-specific constants have been moved to policy parameters:
 *
 *   - policy.salary_divisor         (was DEFAULT_SALARY_DIVISOR = 26)
 *   - policy.weekly_holidays         (was getDay() !== 0)
 *   - policy.approved_leave_counts_as_punctual  (was hardcoded LM_HR behavior)
 *   - policy.peer_score_max_stars    (was hardcoded 5)
 *   - policy.default_sop_score       (was hardcoded 100)
 *   - policy.default_peer_score      (was hardcoded 100)
 *
 * LM_HR Backward Compatibility:
 *
 *   Functions that accept a `policy` parameter use DEFAULT_PAYROLL_POLICY as the
 *   default argument value, so all existing callers that do not pass policy
 *   continue to produce numerically identical results.
 */

// ─── LM_HR LEGACY CONSTANT (kept for external callers that reference it) ────────

/**
 * LM_HR salary divisor: 26 working days (Mon–Sat, Sunday off).
 * Retained for backward compatibility. New code should use policy.salary_divisor.
 * @type {number}
 * @deprecated Use policy.salary_divisor from payrollPolicyService instead.
 */
export const DEFAULT_SALARY_DIVISOR = 26;

/**
 * LM_HR Default Policy inline constant for use as default parameter values.
 * Mirrors DEFAULT_PAYROLL_POLICY from payrollPolicyService but defined here
 * to avoid any circular dependency (service → engine is forbidden).
 * @type {object}
 */
const _LM_HR_POLICY_DEFAULTS = Object.freeze({
  salary_divisor:                   26,
  weekly_holidays:                  ['SUNDAY'],
  approved_leave_counts_as_punctual: true,
  peer_score_max_stars:             5,
  default_sop_score:                100,
  default_peer_score:               100,
});

// ─── 1. DAILY RATE ────────────────────────────────────────────────────────────

/**
 * Calculate the daily rate for salary deduction purposes.
 * Uses policy.salary_divisor if provided (Phase 2), falls back to 26 (LM_HR default).
 *
 * @param {number} baseSalary        Employee base salary (monthly)
 * @param {number} [workingDays]     Explicit override (payroll UI). If omitted, uses policy.
 * @param {object} [policy]          Company payroll policy object
 * @returns {number}                 Daily rate (unrounded — round at deduction step)
 */
export function calculateDailyRate(baseSalary, workingDays, policy = _LM_HR_POLICY_DEFAULTS) {
  const divisor = workingDays ?? policy.salary_divisor ?? _LM_HR_POLICY_DEFAULTS.salary_divisor;
  if (!divisor || divisor <= 0) return 0;
  return baseSalary / divisor;
}

// ─── 2. UNPAID LEAVE DEDUCTION ───────────────────────────────────────────────

/**
 * Calculate the monetary deduction for unpaid leave days.
 * Rounds to 2 decimal places (cents precision).
 *
 * @param {number} dailyRate     Result of calculateDailyRate()
 * @param {number} unpaidDays    Number of working days on unpaid leave
 * @returns {number}             Deduction amount, rounded to 2dp
 */
export function calculateUnpaidDeduction(dailyRate, unpaidDays) {
  return Math.round(dailyRate * (unpaidDays || 0) * 100) / 100;
}

// ─── 3. ATTENDANCE SCORE ─────────────────────────────────────────────────────

/**
 * Calculate attendance score as a percentage, capped at 100.
 * Actual attendance includes both physical present days and approved leave days.
 *
 * @param {number} actualAttendance  Present days + approved leave days
 * @param {number} workingDays       Expected working days this month
 * @returns {number}                 Score 0–100
 */
export function calculateAttendanceScore(actualAttendance, workingDays) {
  if (!workingDays || workingDays <= 0) return 0;
  return Math.min(100.0, (actualAttendance / workingDays) * 100);
}

// ─── 4. PUNCTUALITY SCORE ────────────────────────────────────────────────────

/**
 * Calculate punctuality score as a percentage, capped at 100.
 *
 * LM_HR Rule: approved leave days count as on-time (employees are not penalised
 * for absence on approved leave). Therefore on_time_count already includes
 * approved leave days when passed to this function (added in compensationService
 * before calling this function).
 *
 * @param {number} onTimeCount       On-time check-ins + approved leave days
 * @param {number} actualAttendance  Present days + approved leave days
 * @returns {number}                 Score 0–100
 */
export function calculatePunctualityScore(onTimeCount, actualAttendance) {
  if (!actualAttendance || actualAttendance <= 0) return 0;
  return Math.min(100.0, (onTimeCount / actualAttendance) * 100);
}

// ─── 5. SOP SCORE ────────────────────────────────────────────────────────────

/**
 * Calculate SOP completion score as a percentage.
 * If no SOPs are assigned, defaults to policy.default_sop_score (LM_HR: 100).
 *
 * @param {number} completedCount  Number of completed SOP tasks
 * @param {number} totalCount      Total number of assigned SOP tasks
 * @param {object} [policy]        Company payroll policy object
 * @returns {number}               Score 0–100
 */
export function calculateSopScore(completedCount, totalCount, policy = _LM_HR_POLICY_DEFAULTS) {
  if (!totalCount || totalCount <= 0) {
    return policy.default_sop_score ?? _LM_HR_POLICY_DEFAULTS.default_sop_score;
  }
  return (completedCount / totalCount) * 100;
}

// ─── 6. PEER SCORE ───────────────────────────────────────────────────────────

/**
 * Calculate peer review score as a percentage.
 * If no votes exist, defaults to policy.default_peer_score (LM_HR: 100).
 * Scale: policy.peer_score_max_stars (LM_HR: 5) = 100%.
 *
 * @param {number|null} avgStars  Average star rating received
 * @param {number}      [maxStars] Explicit max stars override (for backward compat)
 * @param {object}      [policy]  Company payroll policy object
 * @returns {number}              Score 0–100
 */
export function calculatePeerScore(avgStars, maxStars, policy = _LM_HR_POLICY_DEFAULTS) {
  if (avgStars === null || avgStars === undefined) {
    return policy.default_peer_score ?? _LM_HR_POLICY_DEFAULTS.default_peer_score;
  }
  const scale = maxStars ?? policy.peer_score_max_stars ?? _LM_HR_POLICY_DEFAULTS.peer_score_max_stars;
  return (avgStars / scale) * 100;
}

// ─── 7. KPI CONTRIBUTION ─────────────────────────────────────────────────────

/**
 * Calculate the composite KPI contribution from weighted sub-scores.
 * Weights are provided as percentages (0–100) that sum to 100.
 *
 * @param {object} scores   { attendance, punctuality, sop, peer } — each 0–100
 * @param {object} weights  { attendance, punctuality, sops, peer_voting } — each 0–100, sum=100
 * @returns {number}        KPI contribution 0–100
 */
export function calculateKpiContribution(scores, weights) {
  return (
    scores.attendance   * ((weights.attendance   || 0) / 100) +
    scores.punctuality  * ((weights.punctuality  || 0) / 100) +
    scores.sop          * ((weights.sops         || 0) / 100) +
    scores.peer         * ((weights.peer_voting  || 0) / 100)
  );
}

// ─── 8. BONUS ────────────────────────────────────────────────────────────────

/**
 * Calculate the performance bonus.
 * Formula: basic × (targetBonusPct / 100) × (kpiContribution / 100)
 * Rounds to 2 decimal places.
 *
 * @param {number} basicSalary       Employee base salary
 * @param {number} targetBonusPct    Target bonus as a percentage (e.g. 15 for 15%)
 * @param {number} kpiContribution   Auto KPI contribution score 0–100
 * @returns {number}                 Bonus amount, rounded to 2dp
 */
export function calculateBonus(basicSalary, targetBonusPct, kpiContribution) {
  return Math.round(basicSalary * (targetBonusPct / 100) * (kpiContribution / 100) * 100) / 100;
}

// ─── 9. NET SALARY ───────────────────────────────────────────────────────────

/**
 * Calculate the net salary payable.
 * Formula: basic + allowances + bonus - deductions
 *
 * @param {number} basic        Base salary
 * @param {number} allowances   Additional allowances
 * @param {number} bonus        Computed bonus
 * @param {number} deductions   Total deductions (including unpaid leave)
 * @returns {number}            Net salary
 */
export function calculateNetSalary(basic, allowances, bonus, deductions) {
  return basic + (allowances || 0) + (bonus || 0) - (deductions || 0);
}

// ─── 10. WORKING DAY CHECK ───────────────────────────────────────────────────

/**
 * Determine whether a given Date is a working day according to policy.
 * Replaces the hardcoded `getDay() !== 0` check with a policy-driven lookup.
 *
 * @param {Date}    date    Date to check
 * @param {Set<number>} holidaySet  Set of JS day indices (0=Sun) that are holidays
 * @returns {boolean}       True if the date is a working day
 */
export function isWorkingDay(date, holidaySet) {
  return !holidaySet.has(date.getDay());
}

// ─── 11. LEAVE–MONTH INTERSECTION ───────────────────────────────────────────

/**
 * Calculate the number of payroll-relevant working days a leave record
 * overlaps with a given payroll month. Skips days in policy.weekly_holidays.
 *
 * Uses noon-anchoring (setHours(12,0,0,0)) to prevent DST-related off-by-one
 * errors during day iteration. Date strings are compared as plain YYYY-MM-DD
 * strings to avoid UTC timezone shifting.
 *
 * @param {string}    leaveStartStr   Leave start date 'YYYY-MM-DD'
 * @param {string}    leaveEndStr     Leave end date 'YYYY-MM-DD' (inclusive)
 * @param {string}    monthStartStr   Payroll month start 'YYYY-MM-DD'
 * @param {string}    monthEndStr     Payroll month end 'YYYY-MM-DD' (inclusive)
 * @param {Set<number>} [holidaySet]  Set of JS day indices for weekly holidays.
 *                                   Defaults to {0} (Sunday only — LM_HR default).
 * @returns {number}                  Number of working days in the intersection
 */
export function calculateLeaveDaysInMonth(
  leaveStartStr, leaveEndStr, monthStartStr, monthEndStr,
  holidaySet = new Set([0]) // Default: Sunday only (LM_HR)
) {
  // No overlap — fast exit
  if (leaveStartStr > monthEndStr || leaveEndStr < monthStartStr) return 0;

  const effectiveStartStr = leaveStartStr < monthStartStr ? monthStartStr : leaveStartStr;
  const effectiveEndStr   = leaveEndStr   > monthEndStr   ? monthEndStr   : leaveEndStr;

  let diffDays = 0;
  // Parse calendar dates at local noon directly. Parsing a date-only string first
  // creates UTC midnight, which is the previous date on servers west of UTC.
  let currentDate = new Date(`${effectiveStartStr}T12:00:00`);
  const effectiveEndDate = new Date(`${effectiveEndStr}T12:00:00`);

  while (currentDate <= effectiveEndDate) {
    if (isWorkingDay(currentDate, holidaySet)) {
      diffDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return diffDays;
}
