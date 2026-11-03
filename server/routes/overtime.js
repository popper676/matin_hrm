import {overtimeInput,overtimeDecision} from '../lib/overtimePolicy.js';
import {supabase,systemDb} from '../lib/supabase.js';
import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { attendanceService } from '../modules/hrm/service/attendanceService.js';
import { dbFetchOne, dbInsert } from '../lib/supabase.js';

const router = express.Router();
router.use(verifyToken);

// GET /api/overtime - Admin list all OT requests
router.get('/', requireAdmin, async (req, res) => {
  try {
    const formatted = await attendanceService.getAllOvertimeRequests();
    res.json(formatted);
  } catch (error) {
    console.error('[GET /api/overtime]', error);
    res.status(error.status||500).json({ error: error.message });
  }
});

// GET /api/overtime/my - Employee list their OT requests
router.get('/my', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.status(404).json({ error: 'Employee profile not found' });

    const requests = await attendanceService.getEmployeeOvertimeRequests(empId);
    res.json(requests);
  } catch (error) {
    console.error('[GET /api/overtime/my]', error);
    res.status(error.status||500).json({ error: error.message });
  }
});

// POST /api/overtime/request - Create a new OT request
router.post('/request', async (req, res) => {
  try {
    const input=overtimeInput(req.user,req.body,req.headers['x-hr-portal']==='employee');
    const {employee_id,requested_by}=input;
    // The policy has already checked the exact target. Attendance permission does not grant Profile access.
    const {data:employee,error:employeeError}=await systemDb.from('Employees').select('id,status,deleted_at').eq('id',employee_id).maybeSingle();
    if(employeeError)throw employeeError;
    if(!employee||employee.deleted_at||employee.status!=='Active')return res.status(404).json({error:'Active employee not found'});
    const newRequest=await attendanceService.createOvertimeRequest(input);
    if(!newRequest)throw new Error('Failed to create overtime request');

    // Notifications
    if (requested_by === 'employee') {
      await dbInsert('system_notifications', { recipient_role: 'hr_manager', employee_id, title: 'New Overtime Request', message: 'An employee has requested overtime.', link_url: '/attendance', is_read: false, created_at: new Date().toISOString() });
      await dbInsert('system_notifications', { recipient_role: 'boss', employee_id, title: 'New Overtime Request', message: 'An employee has requested overtime.', link_url: '/attendance', is_read: false, created_at: new Date().toISOString() });
    } else {
      const user = await dbFetchOne('sys_users', 'id', { employee_id });
      if (user) {
        await dbInsert('system_notifications', { recipient_user_id: user.id, title: 'New Overtime Assigned', message: 'You have been assigned overtime. Please accept or decline.', link_url: '/portal', is_read: false, created_at: new Date().toISOString() });
      }
    }

    res.json(newRequest);
  } catch (error) {
    console.error('[POST /api/overtime/request]', error);
    res.status(error.status||500).json({ error: error.message });
  }
});

// PUT /api/overtime/:id/status - Update OT status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const {status}=req.body;
    const request=await attendanceService.getOvertimeRequestById(id);
    const changed=overtimeDecision(req.user,request,status);
    if(!changed)return res.json({success:true,message:'This decision is already recorded.'});
    const {data,error}=await supabase.from('overtime_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id).eq('status',request.status).select('id');
    if(error)throw error;
    if(!data?.length)return res.status(409).json({error:'Overtime changed while you were reviewing it. Refresh and try again.'});

    // Notifications
    if (request && (status === 'Approved' || status === 'Rejected')) {
      if (request.requested_by === 'hr_boss') {
        const action = status === 'Approved' ? 'accepted' : 'declined';
        await dbInsert('system_notifications', { recipient_role: 'boss', employee_id:request.employee_id, title: `Overtime ${status}`, message: `An employee has ${action} their assigned OT.`, link_url: '/attendance', is_read: false, created_at: new Date().toISOString() });
        await dbInsert('system_notifications', { recipient_role: 'hr_manager', employee_id:request.employee_id, title: `Overtime ${status}`, message: `An employee has ${action} their assigned OT.`, link_url: '/attendance', is_read: false, created_at: new Date().toISOString() });
      } else {
        const user = await dbFetchOne('sys_users', 'id', { employee_id: request.employee_id });
        if (user) {
          await dbInsert('system_notifications', { recipient_user_id: user.id, title: `Overtime Request ${status}`, message: `Your OT request has been ${status.toLowerCase()}.`, link_url: '/portal', is_read: false, created_at: new Date().toISOString() });
        }
      }
    }

    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    console.error(`[PUT /api/overtime/${req.params.id}/status]`, error);
    res.status(error.status||500).json({ error: error.message });
  }
});

export default router;
