/**
 * payrollPolicyService.js — Company Payroll Policy Service
 *
 * Phase 2 of the LM_HR HRM Payroll Architecture Refactor.
 *
 * Responsibilities:
 *   - Load company payroll policy from the database
 *   - Validate policy values before saving
 *   - Provide LM_HR-compatible defaults (must reproduce Phase 1 behavior exactly)
 *   - Create or update policy for a company
 *
 * Architecture:
 *   Route → payrollPolicyService → company_payroll_policy table
 *   Route → payrollPolicyService → Policy Object → payrollCalculationEngine
 *
 * Design Rules:
 *   - No arithmetic here. Service fetches and validates. Engine calculates.
 *   - LM_HR default policy must be numerically identical to Phase 1 hardcoded values.
 *   - Do NOT import from payrollCalculationEngine (no circular dependency).
 */

import { supabase, dbInsert } from '../../../lib/supabase.js';

// ─── VALID WEEKDAY VALUES ─────────────────────────────────────────────────────
const VALID_WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ─── WEEKDAY → getDay() INDEX MAP ────────────────────────────────────────────
// Used by the engine to convert policy.weeklyHolidays string names to JS day numbers
export const WEEKDAY_TO_DAY_INDEX = {
  SUNDAY:    0,
  MONDAY:    1,
  TUESDAY:   2,
  WEDNESDAY: 3,
  THURSDAY:  4,
  FRIDAY:    5,
  SATURDAY:  6,
};

/**
 * The canonical LM_HR-compatible default policy.
 * These values MUST reproduce the exact Phase 1 hardcoded behavior.
 * Used as a fallback when the database table is missing or empty.
 */
export const DEFAULT_PAYROLL_POLICY = Object.freeze({
  company_id:                       'lm',
  salary_divisor:                   26,
  weekly_holidays:                  ['SUNDAY'],
  timezone:                         'Asia/Bangkok',
  approved_leave_counts_as_punctual: true,
  peer_score_max_stars:             5,
  default_sop_score:                100,
  default_peer_score:               100,
});

// ─── WEEKDAY SET (for O(1) lookup in engine) ──────────────────────────────────
/**
 * Convert a policy object into a Set of day-index integers for fast O(1) lookup
 * during date iteration (replaces the hardcoded `getDay() !== 0` check).
 *
 * @param {object} policy  Company payroll policy object
 * @returns {Set<number>}  Set of JS Date.getDay() values that are weekly holidays
 */
export function getWeeklyHolidaySet(policy) {
  const holidays = policy.weekly_holidays || DEFAULT_PAYROLL_POLICY.weekly_holidays;
  return new Set(holidays.map(h => WEEKDAY_TO_DAY_INDEX[h.toUpperCase()] ?? -1));
}

// ─── POLICY VALIDATION ────────────────────────────────────────────────────────
/**
 * Validate a payroll policy object.
 * Throws an Error with a descriptive message if validation fails.
 *
 * @param {object} policy  Policy data to validate
 * @throws {Error}         If any field is invalid
 */
export function validatePolicy(policy) {
  const errors = [];

  if (policy.salary_divisor !== undefined) {
    const d = parseInt(policy.salary_divisor);
    if (!Number.isInteger(d) || d <= 0 || d > 365) {
      errors.push('salary_divisor must be an integer between 1 and 365');
    }
  }

  if (policy.weekly_holidays !== undefined) {
    if (!Array.isArray(policy.weekly_holidays)) {
      errors.push('weekly_holidays must be an array');
    } else {
      const invalid = policy.weekly_holidays.filter(
        d => !VALID_WEEKDAYS.includes(String(d).toUpperCase())
      );
      if (invalid.length > 0) {
        errors.push(`weekly_holidays contains invalid values: ${invalid.join(', ')}. Valid values: ${VALID_WEEKDAYS.join(', ')}`);
      }
    }
  }

  if (policy.timezone !== undefined) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: policy.timezone });
    } catch {
      errors.push(`timezone '${policy.timezone}' is not a valid IANA timezone`);
    }
  }

  if (policy.peer_score_max_stars !== undefined) {
    const s = parseInt(policy.peer_score_max_stars);
    if (!Number.isInteger(s) || s <= 0 || s > 100) {
      errors.push('peer_score_max_stars must be an integer between 1 and 100');
    }
  }

  if (policy.default_sop_score !== undefined) {
    const s = parseFloat(policy.default_sop_score);
    if (isNaN(s) || s < 0 || s > 100) {
      errors.push('default_sop_score must be a number between 0 and 100');
    }
  }

  if (policy.default_peer_score !== undefined) {
    const s = parseFloat(policy.default_peer_score);
    if (isNaN(s) || s < 0 || s > 100) {
      errors.push('default_peer_score must be a number between 0 and 100');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Payroll policy validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

// ─── GET POLICY ───────────────────────────────────────────────────────────────
/**
 * Load the payroll policy for a company from the database.
 * Returns the LM_HR default policy as a safe fallback if the table is missing
 * or the record is not found.
 *
 * @param {string} [companyId='lm']  Company identifier
 * @returns {Promise<object>}         Policy object
 */
export async function getPayrollPolicy(companyId = 'lm', source=supabase) {
  try {
    const { data, error } = await source
      .from('company_payroll_policy')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (error && error.code !== 'PGRST116' && error.code !== 'PGRST205') {
      // Table exists but threw a real error — re-throw
      console.error('[PAYROLL POLICY] Error loading policy:', error.message);
      throw error;
    }

    if (!data) {
      console.warn(`[PAYROLL POLICY] No policy found for company_id='${companyId}'. Returning LM_HR defaults.`);
      return { ...DEFAULT_PAYROLL_POLICY };
    }

    // Normalize: ensure weekly_holidays is always an array of uppercase strings
    return {
      ...data,
      weekly_holidays: (data.weekly_holidays || ['SUNDAY']).map(h => h.toUpperCase()),
      salary_divisor:  parseInt(data.salary_divisor),
      peer_score_max_stars: parseInt(data.peer_score_max_stars),
      default_sop_score:    parseFloat(data.default_sop_score),
      default_peer_score:   parseFloat(data.default_peer_score),
      approved_leave_counts_as_punctual: Boolean(data.approved_leave_counts_as_punctual),
    };
  } catch (e) {
    // Last-resort fallback: if the table doesn't exist yet (migration not run),
    // return LM_HR defaults so the system continues working.
    if (e.code === '42P01') { // relation does not exist
      console.warn('[PAYROLL POLICY] company_payroll_policy table not found. Using LM_HR defaults. Run Phase 2 migration SQL.');
      return { ...DEFAULT_PAYROLL_POLICY };
    }
    throw e;
  }
}

// ─── UPSERT POLICY ────────────────────────────────────────────────────────────
/**
 * Create or update the payroll policy for a company.
 * Validates before saving.
 *
 * @param {string} companyId      Company identifier (e.g. 'lm')
 * @param {object} policyData     Partial or full policy fields to update
 * @param {string} updatedByUserId  User UUID performing the change
 * @returns {Promise<object>}     The saved policy object
 */
export async function upsertPayrollPolicy(companyId = 'lm', policyData, updatedByUserId) {
  validatePolicy(policyData);

  const normalized = {};
  if (policyData.salary_divisor !== undefined)
    normalized.salary_divisor = parseInt(policyData.salary_divisor);
  if (policyData.weekly_holidays !== undefined)
    normalized.weekly_holidays = policyData.weekly_holidays.map(h => h.toUpperCase());
  if (policyData.timezone !== undefined)
    normalized.timezone = policyData.timezone;
  if (policyData.approved_leave_counts_as_punctual !== undefined)
    normalized.approved_leave_counts_as_punctual = Boolean(policyData.approved_leave_counts_as_punctual);
  if (policyData.peer_score_max_stars !== undefined)
    normalized.peer_score_max_stars = parseInt(policyData.peer_score_max_stars);
  if (policyData.default_sop_score !== undefined)
    normalized.default_sop_score = parseFloat(policyData.default_sop_score);
  if (policyData.default_peer_score !== undefined)
    normalized.default_peer_score = parseFloat(policyData.default_peer_score);

  normalized.company_id       = companyId;
  normalized.updated_by_user_id = updatedByUserId || null;
  normalized.updated_at       = new Date().toISOString();

  const { data: existing } = await supabase
    .from('company_payroll_policy')
    .select('id, created_by_user_id, created_at')
    .eq('company_id', companyId)
    .single();

  if (existing) {
    // UPDATE
    const { data, error } = await source
      .from('company_payroll_policy')
      .update(normalized)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    // INSERT — first-time creation
    normalized.created_by_user_id = updatedByUserId || null;
    normalized.created_at = new Date().toISOString();
    const { data, error } = await source
      .from('company_payroll_policy')
      .insert(normalized)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
