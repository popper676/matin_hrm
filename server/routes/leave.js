import {linkedApproval} from '../lib/approvals.js';
import leaveFormsRouter,{leaveFormUpload,submitLeaveForm} from './leave_forms.js';
import {cleanLeaveType} from '../lib/leaveForms.js';
import {requestIsManager} from '../lib/accessControl.js';
import express from 'express';
import { dbInsert } from '../lib/supabase.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { leaveService } from '../modules/hrm/service/leaveService.js';

const router = express.Router();
router.use(verifyToken);
router.use(leaveFormsRouter);

// GET /api/leave
router.get('/', async (req, res) => {
  try {
    const isAdmin = requestIsManager(req);
    const result = await leaveService.getLeaveOverview(isAdmin, req.user.employee_id);
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// Old clients use the same complete validation as the new form.
router.post('/request',leaveFormUpload,submitLeaveForm);

// PUT /api/leave/:id/status  (approve/reject)
router.put('/:id/status', requireAdmin, async (req, res) => {
  try {
    if(await linkedApproval('leave',req.params.id))return res.status(409).json({error:'Use the Approvals inbox for this request. All configured stages are required.'});
    const { status, e_signature } = req.body;
    const validStatuses = ['Pending', 'Approved', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status provided' });
    }
    
    const { reqData, warning } = await leaveService.updateLeaveStatus(req.params.id, status, e_signature, req.user.id);
    
    // Notify Employee
    if (reqData && reqData.employee_id) {
      const { dbFetchOne } = await import('../lib/supabase.js');
      const user = await dbFetchOne('sys_users', 'id', { employee_id: reqData.employee_id });
      if (user) {
        await leaveService.createNotification({
          recipient_user_id: user.id,
          title: `Leave Request ${status}`,
          message: `Your leave request has been ${status.toLowerCase()}.`,
          link_url: '/portal',
          is_read: false,
          created_at: new Date().toISOString()
        });
      }
    }
    
    // The correction RPC writes the audit event in the same transaction.
    return res.json({ success: true, warning });
  } catch (e) {
    if (e.active_handovers) {
      return res.status(400).json({ error: e.message, active_handovers: e.active_handovers });
    }
    if (e.status && e.status < 500) return res.status(e.status).json({ error: e.message });
    console.error('[LEGACY LEAVE CORRECTION]', e);
    return res.status(500).json({ error: 'Unable to correct legacy leave history. Please try again.' });
  }
});

// DELETE /api/leave/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if(await linkedApproval('leave',req.params.id))return res.status(409).json({error:'Requests with approval history must be retained.'});
    await leaveService.deleteLeaveRequest(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'DELETE', module: 'Leave Mgmt', details: `Deleted leave request ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    if (e.active_handovers) {
      return res.status(400).json({ error: e.message, active_handovers: e.active_handovers });
    }
    return res.status(e.status || (e.message.includes('not found') ? 404 : 500)).json({ error: e.message });
  }
});

// GET /api/leave/types
router.get('/types', async (req, res) => {
  try {
    const types = await leaveService.getLeaveTypes();
    return res.json({ types });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/leave/types
router.post('/types', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    const result = await leaveService.createLeaveType(cleanLeaveType(d));
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'CREATE', module: 'Leave Mgmt', details: `Created leave type ${d.type_name}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: !!result, type: result });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// PUT /api/leave/types/:id
router.put('/types/:id', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    await leaveService.updateLeaveType(req.params.id, cleanLeaveType(d));
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'UPDATE', module: 'Leave Mgmt', details: `Updated leave type ${d.type_name}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/leave/types/:id
router.delete('/types/:id', requireAdmin, async (req, res) => {
  try {
    await leaveService.deleteLeaveType(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'DELETE', module: 'Leave Mgmt', details: `Deleted leave type ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
