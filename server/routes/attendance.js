import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { attendanceService } from '../modules/hrm/service/attendanceService.js';
import { dbInsert } from '../lib/supabase.js';

const router = express.Router();
router.use(verifyToken);

// GET /api/attendance
router.get('/', requireAdmin, async (req, res) => {
  try {
    const targetDate = req.query.date || null;
    const result = await attendanceService.getAttendance(targetDate);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance
router.post('/', async (req, res) => {
  try {
    // BUG FIX: Use employee_id from request body (form selection) if provided by admin.
    // Fall back to logged-in user's own employee_id only if not specified.
    const employee_id = req.body.employee_id || req.user.employee_id;
    if (!employee_id) return res.status(403).json({ error: 'No employee ID associated with this account' });
    const result = await attendanceService.manualCheckIn(req.body, employee_id);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'CREATE', module: 'Attendance', details: `Manual attendance check-in for employee ID: ${employee_id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: !!result, record: result });
  } catch (e) {
    console.error('[ATTENDANCE CHECKIN]', e);
    return res.status(500).json({ error: 'Unable to create attendance. Please try again.' });
  }
});

// POST /api/attendance/:id/checkout
router.post('/:id/checkout', async (req, res) => {
  try {
    await attendanceService.manualCheckOut(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'UPDATE', module: 'Attendance', details: `Manual check-out for attendance record ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    if (e.status === 404 || e.status === 409) return res.status(e.status).json({ error: e.message });
    console.error('[ATTENDANCE CHECKOUT]', e);
    return res.status(500).json({ error: 'Unable to check out. Please try again.' });
  }
});

// DELETE /api/attendance/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await attendanceService.deleteAttendance(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'DELETE', module: 'Attendance', details: `Deleted attendance record ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance/generate-qr
router.post('/generate-qr', requireAdmin, async (req, res) => {
  try {
    const { employee_id, expires_in_minutes = 60 } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
    const token = await attendanceService.generateQr(employee_id, expires_in_minutes);
    return res.json({ success: true, token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance/scan
router.post('/scan', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const result = await attendanceService.scanQr(token);
    
    if (result.message.includes('Check-out')) {
      await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'UPDATE', module: 'Attendance', details: `QR check-out for employee ID: ${result.employee_id}`, ip_address: req.ip || '0.0.0.0' });
    } else {
      await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'CREATE', module: 'Attendance', details: `QR check-in for employee ID: ${result.employee_id}`, ip_address: req.ip || '0.0.0.0' });
    }
    
    return res.json({ success: true, message: result.message });
  } catch (e) {
    if (e.message.includes('duplicate')) {
      return res.status(429).json({ error: e.message });
    }
    return res.status(400).json({ error: e.message });
  }
});

// POST /api/attendance/photo-checkin
router.post('/photo-checkin', async (req, res) => {
  try {
    const { employee_id, photo_base64, claimed_shift_id, special_shift_reason } = req.body;
    if(employee_id!==req.user.employee_id)return res.status(403).json({error:'Personal check-in is restricted to your own employee profile.'});
    if (!employee_id || !photo_base64) return res.status(400).json({ error: 'employee_id and photo required' });
    const result = await attendanceService.photoCheckin(employee_id, claimed_shift_id, special_shift_reason,photo_base64);
    return res.json(result);
  } catch (e) {
    if (e.message.includes('duplicate')) {
      return res.status(429).json({ error: e.message });
    }
    return res.status(400).json({ error: e.message });
  }
});

// POST /api/attendance/biometric/sync
router.post('/biometric/sync', async (req, res) => {
  try {
    const { api_key, records } = req.body;
    const expectedKey = process.env.BIOMETRIC_API_KEY;
    if (!expectedKey) {
      console.error('FATAL ERROR: BIOMETRIC_API_KEY environment variable is missing.');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (api_key !== expectedKey) return res.status(401).json({ error: 'Unauthorized API Key' });
    if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'Invalid records format' });

    const synced = await attendanceService.biometricSync(records);
    return res.json({ success: true, synced_count: synced });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance/biometric/device
router.post('/biometric/device', requireAdmin, async (req, res) => {
  try {
    const { device_name, ip_address, port, location } = req.body;
    if (!device_name) return res.status(400).json({ error: 'device_name required' });
    const newDevice = await attendanceService.createBiometricDevice({ device_name, ip_address, port, location });
    return res.json({ success: true, device: newDevice });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/attendance/biometric/device/:id
router.delete('/biometric/device/:id', async (req, res) => {
  try {
    await attendanceService.deleteBiometricDevice(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance/biometric/mapping
router.post('/biometric/mapping', requireAdmin, async (req, res) => {
  try {
    const { employee_id, device_id, biometric_id } = req.body;
    if (!employee_id || !biometric_id) return res.status(400).json({ error: 'employee_id and biometric_id required' });
    const newMapping = await attendanceService.createBiometricMapping({ employee_id, device_id, biometric_id });
    if (!newMapping) return res.status(500).json({ error: 'Failed to insert mapping' });
    return res.json({ success: true, mapping: newMapping });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/attendance/biometric/mapping/:id
router.put('/biometric/mapping/:id', requireAdmin, async (req, res) => {
  try {
    const { employee_id, device_id, biometric_id } = req.body;
    await attendanceService.updateBiometricMapping(req.params.id, { employee_id, device_id, biometric_id });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/attendance/biometric/mapping/:id
router.delete('/biometric/mapping/:id', async (req, res) => {
  try {
    await attendanceService.deleteBiometricMapping(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/attendance/available-shifts
router.get('/available-shifts', async (req, res) => {
  try {
    const result = await attendanceService.getAvailableShifts(req.user.employee_id);
    return res.json({ success: true, default_shift_id: result.default_shift_id, allowed_shifts: result.allowed_shifts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/attendance/approvals/:id
router.put('/approvals/:id', requireAdmin, async (req, res) => {
  try {
    await attendanceService.updateApproval(req.params.id, req.body);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/attendance/approvals/bulk-approve
router.post('/approvals/bulk-approve', requireAdmin, async (req, res) => {
  try {
    const { record_ids } = req.body;
    if (!record_ids || !Array.isArray(record_ids)) return res.status(400).json({ error: 'record_ids array required' });
    for (const id of record_ids) {
      await attendanceService.updateApproval(id, { shift_approval_status: 'Approved' });
    }
    return res.json({ success: true, count: record_ids.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// --- Rosters & Shifts API ---

// GET schedules for a date range
router.get('/schedules', async (req, res) => {
  try {
    const { start, end } = req.query; // expect YYYY-MM-DD
    if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
    const schedules = await attendanceService.getSchedules(start, end);
    return res.json({ success: true, schedules });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST bulk upsert schedules
router.post('/schedules', requireAdmin, async (req, res) => {
  try {
    const entries = req.body; // expect array
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Array of schedules required' });
    const schedules = await attendanceService.upsertSchedules(entries);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'UPDATE', module: 'Attendance', details: `Bulk updated ${entries.length} daily schedules`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true, schedules });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE schedule by id
router.delete('/schedules/:id', requireAdmin, async (req, res) => {
  try {
    await attendanceService.deleteSchedule(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'DELETE', module: 'Attendance', details: `Deleted daily schedule ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/shifts', async (req, res) => {
  try {
    const shifts = await attendanceService.getShifts();
    return res.json({ success: true, shifts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/shifts', requireAdmin, async (req, res) => {
  try {
    const { shift_name, start_time, end_time, grace_period_minutes } = req.body;
    if (!shift_name || !start_time || !end_time) return res.status(400).json({ error: 'Missing required fields' });
    const shift = await attendanceService.createShift({ shift_name, start_time, end_time, grace_period_minutes: grace_period_minutes || 15 });
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'CREATE', module: 'Attendance', details: `Created new shift: ${shift_name}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true, shift });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/shifts/:id', requireAdmin, async (req, res) => {
  try {
    const { shift_name, start_time, end_time, grace_period_minutes } = req.body;
    const shift = await attendanceService.updateShift(req.params.id, { shift_name, start_time, end_time, grace_period_minutes });
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'UPDATE', module: 'Attendance', details: `Updated shift ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true, shift });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/shifts/:id', requireAdmin, async (req, res) => {
  try {
    await attendanceService.deleteShift(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'DELETE', module: 'Attendance', details: `Deleted shift ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/rosters', async (req, res) => {
  try {
    const rosters = await attendanceService.getRosters();
    return res.json({ success: true, rosters });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/rosters', requireAdmin, async (req, res) => {
  try {
    const { employee_id, shift_id, start_date, end_date } = req.body;
    if (!employee_id || !shift_id || !start_date) {
      return res.status(400).json({ error: 'employee_id, shift_id, and start_date are required' });
    }
    const result = await attendanceService.createRoster({ employee_id, shift_id, start_date, end_date: end_date || null });
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'CREATE', module: 'Attendance', details: `Created roster for employee ID: ${employee_id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true, roster: result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/rosters/:id', requireAdmin, async (req, res) => {
  try {
    await attendanceService.deleteRoster(req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user?.id || null, action: 'DELETE', module: 'Attendance', details: `Deleted roster ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/default-shift', requireAdmin, async (req, res) => {
  try {
    const { employee_id, shift_id } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    await attendanceService.updateDefaultShift(employee_id, shift_id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
