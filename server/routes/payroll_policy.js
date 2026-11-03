/**
 * payroll_policy.js — Company Payroll Policy REST API
 *
 * Phase 2 of the LM_HR HRM Payroll Architecture Refactor.
 *
 * Routes:
 *   GET  /api/payroll-policy         — Get current company policy (admin only)
 *   PUT  /api/payroll-policy         — Update company policy (admin only)
 *
 * Authorization: requireAdmin (boss, hr_manager, general_manager, admin roles)
 * Audit: writes to sys_audit_logs using existing dbInsert convention
 */

import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { dbInsert } from '../lib/supabase.js';
import {
  getPayrollPolicy,
  upsertPayrollPolicy,
  validatePolicy,
  DEFAULT_PAYROLL_POLICY,
} from '../modules/hrm/service/payrollPolicyService.js';

const router = express.Router();
router.use(verifyToken);
router.use(requireAdmin);

// GET /api/payroll-policy
// Returns the current company payroll policy.
router.get('/', async (req, res) => {
  try {
    const policy = await getPayrollPolicy('lm');
    return res.json({ success: true, policy });
  } catch (e) {
    console.error('[PAYROLL POLICY GET]', e);
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/payroll-policy
// Update the company payroll policy.
router.put('/', async (req, res) => {
  try {
    const body = req.body;

    // Validate before saving (throws on error)
    validatePolicy(body);

    const saved = await upsertPayrollPolicy('lm', body, req.user?.id);

    // Audit log — reuse existing convention
    await dbInsert('sys_audit_logs', {
      user_id:    req.user.id,
      user_name:  req.user.full_name || req.user.username,
      action:     'UPDATE',
      module:     'Payroll Policy',
      details:    `Updated company payroll policy. Fields changed: ${Object.keys(body).join(', ')}`,
      created_at: new Date().toISOString(),
    }).catch(err => console.error('[PAYROLL POLICY AUDIT]', err));

    return res.json({ success: true, policy: saved });
  } catch (e) {
    console.error('[PAYROLL POLICY PUT]', e);
    if (e.message.startsWith('Payroll policy validation failed')) {
      return res.status(400).json({ error: e.message });
    }
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/payroll-policy/defaults
// Returns the LM_HR default policy values (useful for reset UI).
router.get('/defaults', async (req, res) => {
  return res.json({ success: true, defaults: DEFAULT_PAYROLL_POLICY });
});

export default router;
