import {attendanceCalendar,shiftForDay} from '../lib/attendanceShift.js';
import crypto from 'node:crypto';
import {canOpenDocument,findDocument,officialDocumentPdf} from '../lib/officialDocuments.js';
import {bkkMonthBounds,bkkDayBounds,getBkkDateString} from '../lib/dateUtils.js';
import {receiveHrFile} from '../lib/hrUploads.js';
import {visibleNotifications,recordNotification} from '../lib/notifications.js';
import {integrityRpc} from '../lib/integrityRpc.js';
import {getBranding} from '../lib/branding.js';
import {requestIsManager} from '../lib/accessControl.js';
import { hrFileUrl } from '../lib/hrStorage.js';
import express from 'express';
import { dbFetch, dbFetchOne, dbInsert, dbUpdate, dbDelete } from '../lib/supabase.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { supabase, supabaseAdmin, systemDb } from '../lib/supabase.js';
import {
  getActiveHandoversForOutgoing,
  getActiveHandoversForIncoming,
  enrichHandover,
  enrichHandoversBulk,
} from '../lib/handoverHelpers.js';
import path from 'path';
import { payrollModule } from '../modules/payroll/index.js';
import { hrmModule } from '../modules/hrm/index.js';

const checkedWrite=r=>{if(r.error)throw r.error;return r.data;};
const router = express.Router();
router.use(verifyToken);

// GET /api/audit-logs
router.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const logs = await dbFetch('sys_audit_logs', '*', {}, { order: 'created_at', ascending: false });
    return res.json(logs);
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Notifications use current capabilities and a separate receipt for each account.
router.get('/notifications',async(req,res)=>{
 try{const all=await visibleNotifications(req.user);res.json({notifications:all.slice(0,20),unread_count:all.filter(n=>!n.is_read).length});}
 catch(error){res.status(error.status||500).json({error:error.message});}
});
router.post('/notifications/:id/read',async(req,res)=>{
 try{await recordNotification(req.user,req.params.id);res.json({success:true});}
 catch(error){res.status(error.status||500).json({error:error.message});}
});
router.post('/notifications/read-all',async(req,res)=>{
 try{for(const row of await visibleNotifications(req.user))await recordNotification(req.user,row.id);res.json({success:true});}
 catch(error){res.status(error.status||500).json({error:error.message});}
});
router.delete('/notifications/:id',async(req,res)=>{
 try{await recordNotification(req.user,req.params.id,true);res.json({success:true});}
 catch(error){res.status(error.status||500).json({error:error.message});}
});

// GET /api/portal — Employee self-service data
router.get('/portal', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json({ emp: null });

    const [emp, attRecs, leaveReqs, payslips, votes, leaveBals, announcements, leaveTypes, qr_token_records, shifts, schedules, rosters] = await Promise.all([
      dbFetchOne('Employees', '*', { id: empId }),
      hrmModule.getAttendanceHistory(empId),
      hrmModule.getEmployeeLeaveRequests(empId),
      payrollModule.getEmployeePayrolls(empId, false),
      dbFetch('peer_voting_records', '*', { nominee_id: empId }),
      hrmModule.getEmployeeLeaveBalances(empId),
      dbFetch('announcements', '*'),
      dbFetch('Leave_type', '*'),
      dbFetch('qr_attendance_tokens', '*', { employee_id: empId, used: false }, { order: 'created_at', ascending: false, limit: 1 }),
      dbFetch('shifts', '*'),
      dbFetch('employee_daily_schedules', '*', { employee_id: empId }),
      dbFetch('employee_rosters', '*', { employee_id: empId })
    ]);

    const calendar=await attendanceCalendar();
    attRecs.forEach(record=>{
      record.is_early_leave=false;
      if(!emp||!record.check_in||!record.check_out)return;
      const day=getBkkDateString(record.check_in),shift=shiftForDay(emp,day,{schedules,rosters,shifts,...calendar},record.claimed_shift_id);
      if(shift){const end=new Date(day+'T'+shift.end_time+'+07:00');if(shift.end_time<shift.start_time)end.setUTCDate(end.getUTCDate()+1);record.is_early_leave=new Date(record.check_out)<end;}
    });

    if (emp) {
      const [depts, positions] = await Promise.all([
        dbFetch('Departments', 'id,Department_name'),
        dbFetch('positions', 'id,title'),
      ]);
      const deptMap = Object.fromEntries(depts.map(d => [d.id, d.Department_name]));
      const posMap = Object.fromEntries(positions.map(p => [p.id, p.title]));
      emp.dept_name = deptMap[emp.Dept_id] || '—';
      emp.pos_title = posMap[emp.position_id] || '—';
    }

    if (leaveBals && leaveTypes) {
      const ltMap = Object.fromEntries(leaveTypes.map(t => [t.id, t.type_name]));
      leaveBals.forEach(b => { b.type_name = ltMap[b.leave_type_id] || '—'; });
    }

    const voteCount = votes.length;
    const voteTotal = votes.reduce((s, v) => s + parseInt(v.score || 0), 0);
    const voteAvg = voteCount > 0 ? Math.round((voteTotal / voteCount) * 10) / 10 : 0;

    const offboardingRecord = await dbFetchOne('corporate_offboarding', 'id', { employee_id: empId });
    let outgoingActive = await getActiveHandoversForOutgoing(empId);

    // Fallback: pick up leave-linked handovers even if not returned by outgoing query edge cases
    const linkedHandoverIds = [
      ...new Set(
        leaveReqs.flatMap(r => [r.coverage_handover_id, r.return_handover_id].filter(Boolean))
      ),
    ];

    if (linkedHandoverIds.length > 0) {
      const { data: linked } = await supabase.from('employee_handovers').select('*').in('id', linkedHandoverIds);
      if (linked) {
        for (const h of linked) {
          if (outgoingActive.some(o => o.id === h.id)) continue;
          if (h.outgoing_employee_id === empId && !['completed', 'waived', 'cancelled'].includes(h.status)) {
            outgoingActive.push(h);
          }
        }
      }
    }

    const incomingActive = await getActiveHandoversForIncoming(empId);

    await enrichHandoversBulk(outgoingActive);
    await enrichHandoversBulk(incomingActive);

    const exitOutgoing = outgoingActive.filter(h => h.handover_kind === 'exit');
    const coverageOutgoing = outgoingActive.filter(h => h.handover_kind === 'coverage' || h.handover_kind === 'return');
    const incomingExit = incomingActive.filter(h => h.handover_kind === 'exit');
    const incomingCoverage = incomingActive.filter(h => h.handover_kind === 'coverage' || h.handover_kind === 'return');

    const hasActiveLeaveHandover = coverageOutgoing.length > 0;
    const hasActiveExitHandover = exitOutgoing.length > 0;
    const leaveOutgoingHandover = coverageOutgoing[0] || null;
    const exitOutgoingHandover = exitOutgoing[0] || null;
    const outgoingHandover = leaveOutgoingHandover || exitOutgoingHandover || outgoingActive[0] || null;

    // Show both banners when offboarding and leave handover are active in parallel
    const showLeaveHandoverBanner = hasActiveLeaveHandover;
    const showOffboardingBanner = hasActiveExitHandover || !!offboardingRecord;
    const showIncomingLeaveBanner = incomingCoverage.length > 0;
    const showIncomingExitBanner = !showIncomingLeaveBanner && incomingExit.length > 0;

    // Filter announcements
    const role = req.user.role;
    const today = new Date().toISOString().split('T')[0];

    const parsedAnnouncements = announcements.map(a => {
      let content = a.content || '';
      let expiry = null;
      const match = content.match(/___EXPIRY:([\d-]+)/);
      if (match) {
        expiry = match[1];
        content = content.replace(match[0], '').trim();
      }
      return { ...a, content, expiry_date: expiry };
    });

    const filteredAnn = parsedAnnouncements.filter(a => {
      const tr = a.target_role || 'All';
      if (tr === 'Pending HR Review') return false;
      if (!['All', role].includes(tr)) return false;

      // Filter out expired announcements for employees
      if (a.expiry_date && a.expiry_date < today) return false;

      return true;
    });

    return res.json({
      emp,
      is_offboarding: !!offboardingRecord,
      has_active_leave_handover: hasActiveLeaveHandover,
      has_active_exit_handover: hasActiveExitHandover,
      show_leave_handover_banner: showLeaveHandoverBanner,
      show_offboarding_banner: showOffboardingBanner,
      show_dual_track: showLeaveHandoverBanner && showOffboardingBanner,
      show_incoming_leave_banner: showIncomingLeaveBanner,
      show_incoming_exit_banner: showIncomingExitBanner,
      outgoing_handover: outgoingHandover,
      exit_outgoing_handover: exitOutgoingHandover,
      outgoing_handovers: outgoingActive,
      leave_outgoing_handover: leaveOutgoingHandover,
      coverage_outgoing_count: coverageOutgoing.length,
      incoming_handover_count: incomingActive.length,
      incoming_coverage_count: incomingCoverage.length,
      att_count: attRecs.length,
      leave_count: leaveReqs.length,
      payslip_count: payslips.length,
      vote_avg: voteAvg, vote_count: voteCount,
      leave_bals: leaveBals,
      ann_list: filteredAnn.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      attendance_records: attRecs,
      leave_requests: leaveReqs,
      payslips,
      leave_types: leaveTypes,
      qr_token: (qr_token_records && qr_token_records.length > 0 && new Date(qr_token_records[0].expires_at) > new Date()) ? qr_token_records[0].token : null,
    });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// ─── SOP TEMPLATES ───────────────────────────────────────────────

// GET /api/sops/templates — Get all SOP templates with position info
router.get('/sops/templates', async (req, res) => {
  try {
    const { data: templates, error } = await supabase
      .from('sop_templates')
      .select('id, position_id, task_description, updated_at');
    if (error) throw error;
    const positions = await dbFetch('positions', 'id,title');
    const result = templates.map(t => ({
      ...t,
      position_title: positions.find(p => p.id === t.position_id)?.title || 'Unknown'
    }));
    return res.json({ success: true, templates: result });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// POST /api/sops/templates — Create or update (upsert) a template for a position
router.post('/sops/templates', requireAdmin, async (req, res) => {
  try {
    const { position_id, task_description } = req.body;
    if (!position_id || !task_description) return res.status(400).json({ error: 'position_id and task_description required' });

    // Check if template exists for this position
    const { data: existing } = await supabase.from('sop_templates').select('id').eq('position_id', position_id).single();
    if (existing) {
      checkedWrite(await supabase.from('sop_templates').update({ task_description, updated_at: new Date().toISOString() }).eq('id', existing.id));
      await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'UPDATE', module: 'SOPs', details: `Updated SOP template for position ${position_id}`, ip_address: req.ip || '0.0.0.0' });
    } else {
      checkedWrite(await supabase.from('sop_templates').insert({ position_id, task_description }));
      await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'CREATE', module: 'SOPs', details: `Created SOP template for position ${position_id}`, ip_address: req.ip || '0.0.0.0' });
    }
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// DELETE /api/sops/templates/:id
router.delete('/sops/templates/:id', requireAdmin, async (req, res) => {
  try {
    checkedWrite(await supabase.from('sop_templates').delete().eq('id', req.params.id));
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'DELETE', module: 'SOPs', details: `Deleted SOP template ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// POST /api/sops/auto-assign — Auto-assign all templates for every day in a month
router.post('/sops/auto-assign', requireAdmin, async (req, res) => {
  try {
    const { month } = req.body; // 'YYYY-MM'
    if (!month) return res.status(400).json({ error: 'month required' });

    const bounds=bkkMonthBounds(month),[year,monthStr]=month.split('-');
    const lastDay=Number(bounds.endDay.slice(-2));

    // Get all templates
    const { data: templates, error: tErr } = await supabase.from('sop_templates').select('*');
    if (tErr) throw tErr;
    if (!templates || templates.length === 0) return res.status(400).json({ error: 'No SOP templates found. Please set up templates first.' });

    // Get all active employees
    const { data: employees, error: eErr } = await supabase.from('Employees').select('id, position_id').eq('status', 'Active');
    if (eErr) throw eErr;

    // Fetch all existing SOPs for the month in ONE query to avoid N+1 in the loop
    const monthStart=bounds.start,monthEnd=bounds.end;

    const { data: existingSOPs, error: existingErr } = await supabase
      .from('daily_sops')
      .select('id, employee_id, assigned_date, created_at')
      .gte('assigned_date', bounds.startDay)
      .lt('assigned_date', bounds.nextDay);

    if (existingErr) throw existingErr;

    const existingSet = new Set();
    if (existingSOPs) {
      existingSOPs.forEach(sop => {
        if (sop.assigned_date||sop.created_at) {
          const dateStr = sop.assigned_date||getBkkDateString(sop.created_at);
          existingSet.add(`${sop.employee_id}_${dateStr}`);
        }
      });
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    const records = [];

    for (const template of templates) {
      const positionEmployees = employees.filter(e => e.position_id === template.position_id);
      if (positionEmployees.length === 0) continue;

      for (let day = 1; day <= lastDay; day++) {
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${year}-${monthStr}-${dayStr}T06:00:00.000Z`;
        const dayDate = `${year}-${monthStr}-${dayStr}`;

        for (const emp of positionEmployees) {
          // Check locally if record already exists for this employee on this day
          if (existingSet.has(`${emp.id}_${dayDate}`)) {
            totalSkipped++;
            continue;
          }

          records.push({
            employee_id: emp.id,
            task_description: template.task_description,
            is_completed: false,
            assigned_date:dayDate,created_at:new Date().toISOString()
          });
          totalCreated++;
        }
      }
    }

    // Bulk insert
    if (records.length > 0) {
      const { error: insertErr } = await supabase.from('daily_sops').insert(records);
      if (insertErr) throw insertErr;
      await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'CREATE', module: 'SOPs', details: `Auto-assigned ${totalCreated} SOPs for month ${month}`, ip_address: req.ip || '0.0.0.0' });
    }

    return res.json({ success: true, created: totalCreated, skipped: totalSkipped });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// GET /api/sops/report — Fetch SOPs grouped by month for HR Tracking
router.get('/sops/report', async (req, res) => {
  try {
    const { month, position_id } = req.query; // month format: 'YYYY-MM'
    if (!month) return res.status(400).json({ error: 'Month is required' });

    const {startDay:startDate,nextDay:endDate}=bkkMonthBounds(month);

    // Fetch active employees (filtered by position if provided)
    let empQuery = supabase.from('Employees').select('id, Full_name, position_id').eq('status', 'Active');
    if (position_id) empQuery = empQuery.eq('position_id', position_id);
    const { data: employees, error: empError } = await empQuery;
    if (empError) throw empError;

    // Fetch daily_sops for that month (include task_description to show missed tasks)
    const { data: sops, error: sopError } = await supabase
      .from('daily_sops')
      .select('id, employee_id, is_completed, proof_video_url, assigned_date, created_at, task_description')
      .gte('assigned_date', startDate)
      .lt('assigned_date', endDate);
    if (sopError) throw sopError;

    return res.json({ success: true, employees, sops });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/sops — Daily SOPs
router.get('/sops', async (req, res) => {
  try {
    const sops = await dbFetch('daily_sops', '*', {}, { order: 'created_at', ascending: false });
    const employees = await dbFetch('Employees', 'id,Full_name,position_id');
    const positions = await dbFetch('positions', 'id,title');

    // Attach employee name and position title
    const enhancedSops = sops.map(s => {
      const emp = employees.find(e => e.id === s.employee_id);
      const pos = emp?.position_id ? positions.find(p => p.id === emp.position_id) : null;
      return {
        ...s,
        employee_name: emp?.Full_name || 'Unknown',
        position_title: pos?.title || 'No Position'
      };
    });

    return res.json({ sops: enhancedSops });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// POST /api/sops - Create SOP for Employees
router.post('/sops', requireAdmin, async (req, res) => {
  try {
    const { title, content, department_id, position_id } = req.body;

    if (!department_id && !position_id) {
      return res.status(400).json({ error: 'Please select a Position or Department to assign the SOP.' });
    }

    let query = {};
    if (department_id) query.Dept_id = department_id;
    if (position_id) query.position_id = position_id;

    // Fetch target employees based on filters
    const employees = await dbFetch('Employees', 'id', query);

    if (employees.length === 0) {
      return res.status(400).json({ error: 'No employees found matching the selected Department or Position.' });
    }

    const task_desc = title ? `${title}\n\n${content}` : content;

    // Fetch users for these employees in one query
    const empIds = employees.map(e => e.id);
    const { data: users } = await supabase.from('sys_users').select('id, employee_id').in('employee_id', empIds);
    const userMap = new Map((users || []).map(u => [u.employee_id, u.id]));

    // Build bulk insert arrays
    const sopRecords = [];
    const notificationRecords = [];

    for (const emp of employees) {
      sopRecords.push({
        employee_id: emp.id,
        task_description: task_desc,assigned_date:getBkkDateString(new Date()),
        assigned_by: req.user.employee_id || null
      });

      const userId = userMap.get(emp.id);
      if (userId) {
        notificationRecords.push({
          recipient_user_id: userId,
          title: 'New SOP Assigned',
          message: `You have been assigned a new SOP: ${title || 'Daily Task'}`,
          link_url: '/portal',
          is_read: false,
          created_at: new Date().toISOString()
        });
      }
    }

    if (sopRecords.length > 0) {
      checkedWrite(await supabase.from('daily_sops').insert(sopRecords));
    }
    if (notificationRecords.length > 0) {
      checkedWrite(await supabase.from('system_notifications').insert(notificationRecords));
    }
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'CREATE', module: 'SOPs', details: `Assigned SOP "${title || 'Daily Task'}" to ${employees.length} employees`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true, assigned_count: employees.length });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// PATCH /api/sops/bulk-update — Update task_description for a group of SOP IDs
router.patch('/sops/bulk-update', requireAdmin, async (req, res) => {
  try {
    const { ids, task_description } = req.body;
    if (!Array.isArray(ids) || !task_description) return res.status(400).json({ error: 'ids and task_description required' });
    if (ids.length > 0) {
      checkedWrite(await supabase.from('daily_sops').update({ task_description }).in('id', ids));
    }
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'UPDATE', module: 'SOPs', details: `Bulk updated ${ids.length} SOPs`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// DELETE /api/sops/:id
router.delete('/sops/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await dbDelete('daily_sops', id);
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'DELETE', module: 'SOPs', details: `Deleted SOP ID: ${id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// POST /api/sops/bulk-delete
router.post('/sops/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    if (ids.length > 0) {
      checkedWrite(await supabase.from('daily_sops').delete().in('id', ids));
    }
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'DELETE', module: 'SOPs', details: `Bulk deleted ${ids.length} SOPs`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// POST /api/sops/:id/complete
// POST /api/sops/:id/complete
router.post('/sops/:id/complete', receiveHrFile('file',{maxBytes:50*1024*1024,types:['image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime']}), async (req, res) => {
  try {
    const { id } = req.params;
    const { manualReport } = req.body;
    if(manualReport!==undefined&&(typeof manualReport!=='string'||manualReport.length>6000))return res.status(400).json({error:'Report text must be at most 6,000 characters.'});
    const sourceSop=await dbFetchOne('daily_sops','id,employee_id,assigned_date',{id});
    if(!sourceSop)return res.status(404).json({error:'SOP not found'});
    if(req.accessContext.personal&&sourceSop.assigned_date>getBkkDateString(new Date()))return res.status(409).json({error:'This task is not due yet.'});

    let videoUrl = null;
    if (req.file) {
      // Upload to Supabase Storage (supports both images and videos)
      const ext = path.extname(req.file.originalname);
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;

      const { data, error } = await supabase.storage
        .from('sop_videos')
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (error) {
        console.error("Supabase upload error:", error);
        throw new Error("Failed to upload file to storage");
      }

      // Get public URL
      videoUrl = hrFileUrl('sop_videos', filename);
    }

    await dbUpdate('daily_sops', id, {
      is_completed: true,
      completed_at: new Date().toISOString(),
      ...(videoUrl && { proof_video_url: videoUrl }),
      ...(manualReport && { manual_report: manualReport })
    });

    // Notify Boss and HR
    const sop = await dbFetchOne('daily_sops', '*', { id });
    if (sop) {
      const emp = await dbFetchOne('Employees', 'Full_name', { id: sop.employee_id });
      const empName = emp ? emp.Full_name : 'An employee';
      await dbInsert('system_notifications', {
        recipient_role: 'boss',
        title: 'SOP Completed',
        message: `${empName} has completed their assigned SOP.`,
        link_url: '/sops',
        is_read: false,
        created_at: new Date().toISOString()
      });
      await dbInsert('system_notifications', {
        recipient_role: 'hr_manager',
        title: 'SOP Completed',
        message: `${empName} has completed their assigned SOP.`,
        link_url: '/sops',
        is_read: false,
        created_at: new Date().toISOString()
      });
    }
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'UPDATE', module: 'SOPs', details: `SOP marked as completed by employee (ID: ${id})`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true, message: 'SOP marked as completed' });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// GET /api/birthdays
router.get('/birthdays', async (req, res) => {
  try {
    const employees = await dbFetch('Employees', 'id,Full_name,employee_id,date_of_birth,Dept_id', { status: 'Active' });

    const upcoming = employees
      .filter(e => e.date_of_birth)
      .map(e => {
        const dob = new Date(e.date_of_birth);
        return { ...e, birth_month: dob.getMonth() + 1, birth_day: dob.getDate() };
      })
      .sort((a, b) => {
        if (a.birth_month !== b.birth_month) return a.birth_month - b.birth_month;
        return a.birth_day - b.birth_day;
      });

    return res.json({ birthdays: upcoming });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// GET /api/peer-voting
router.get('/peer-voting', async (req, res) => {
  try {
    const [votes, employees] = await Promise.all([
      dbFetch('peer_voting_records', '*', {}, { order: 'created_at', ascending: false }),
      dbFetch('Employees', 'id,Full_name,employee_id', { status: 'Active' }),
    ]);
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    votes.forEach(v => {
      v.nominee_name = (empMap[v.nominee_id] || {}).Full_name || '—';
      v.voter_name = 'Anonymous Peer';
      delete v.voter_id; // Delete from payload for true anonymity
    });
    return res.json({ votes, employees });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// GET /api/peer-voting/colleagues — minimal list for personal-only voters
router.get('/peer-voting/colleagues',async(req,res)=>{
 try{
  if(!req.user.employee_id)return res.json({employees:[]});
  const {data,error}=await systemDb.from('Employees').select('id,Full_name,employee_id').eq('status','Active').is('deleted_at',null).neq('id',req.user.employee_id).order('Full_name');
  if(error)throw error;res.json({employees:data||[]});
 }catch(error){res.status(error.status||500).json({error:error.message});}
});
// POST /api/peer-voting/submit — one atomic monthly-vote implementation
router.post('/peer-voting/submit',async(req,res)=>{
 try{
  const {nominee_id,comment=''}=req.body;
  const scores=['attendance','punctuality','sops','peer','initiative'].map(key=>Number(req.body[key]));
  if(!scores.every(n=>Number.isInteger(n)&&n>=1&&n<=5)||typeof comment!=='string'||comment.length>2000)
   return res.status(400).json({error:'Provide all five scores from 1 to 5 and a comment up to 2000 characters.'});
  const vote=await integrityRpc('hr_submit_peer_vote',{p_actor:req.user.id,p_nominee:nominee_id,p_score:Math.round(scores.reduce((a,b)=>a+b,0)/5),p_comment:comment});
  const {data:recipient}=await systemDb.from('sys_users').select('id').eq('employee_id',nominee_id).eq('is_active',true).maybeSingle();
  if(recipient)await dbInsert('system_notifications',{recipient_user_id:recipient.id,title:'New Peer Vote Received',message:'You received an anonymous peer evaluation.',link_url:'/portal',is_read:false});
  await dbInsert('sys_audit_logs',{user_id:req.user.id,action:'CREATE',module:'Peer Voting',details:'Submitted a monthly peer evaluation'});
  return res.json({success:true,message:'Vote submitted successfully'});
 }catch(error){res.status(error.status||500).json({error:error.message});}
});

// GET /api/boss/users — Admin user management
router.get('/boss/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbFetch('sys_users', 'id,username,role,full_name,employee_id,created_at,is_active');
    return res.json({ users });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// POST /api/boss/announcements
router.post('/boss/announcements', requireAdmin, async (req, res) => {
  try {
    const d = req.body;

    // Default to 7 days if no expiry date provided
    let expiry = d.expiry_date;
    if (!expiry) {
      const dt = new Date();
      dt.setDate(dt.getDate() + 7);
      expiry = dt.toISOString().split('T')[0];
    }

    const finalContent = `${d.content || ''}___EXPIRY:${expiry}`;

    const result = await dbInsert('announcements', {
      title: d.title, content: finalContent,
      priority: d.priority || 'Medium',
      target_role: d.target_role || 'All',
      is_pinned: d.is_pinned || false,
      created_at: new Date().toISOString(),
    });

    // Create notification
    if (result && result.id) {
      await dbInsert('system_notifications', {
        recipient_role: d.target_role || 'All',
        title: `📢 New Announcement: ${d.title}`,
        message: d.content,
        link_url: '/portal',
        is_read: false,
        created_at: new Date().toISOString()
      });

      // Send to Telegram if configured
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
          const dateStr = new Date().toISOString().split('T')[0];
          const prioEmoji = d.priority === 'Urgent' ? '🚨' : d.priority === 'High' ? '🔴' : '🟡';
          const brand=await getBranding();
          const text = `🏢 *${brand.name} HR ANNOUNCEMENT* 🏢\n➖➖➖➖➖➖➖➖➖➖➖➖\n📌 *Subject:* ${d.title}\n${prioEmoji} *Priority:* ${d.priority || 'Medium'}\n📅 *Date:* ${dateStr}\n\n💬 *Message:*\n${d.content}\n➖➖➖➖➖➖➖➖➖➖➖➖`;
          fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: text,
              parse_mode: 'Markdown'
            })
          }).catch(err => console.error('Telegram API error:', err));
        } catch (err) {
          console.error('Failed to send Telegram message:', err);
        }
      }
      await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'CREATE', module: 'Announcements', details: `Created announcement "${d.title}"`, ip_address: req.ip || '0.0.0.0' });
    }

    return res.json({ success: !!result, announcement: result });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.delete('/boss/announcements/:id', requireAdmin, async (req, res) => {
  try {
    await dbDelete('announcements', req.params.id);
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'DELETE', module: 'Announcements', details: `Deleted announcement ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.put('/boss/announcements/:id/publish', requireAdmin, async (req, res) => {
  try {
    await dbUpdate('announcements', req.params.id, { target_role: 'All' });
    await dbInsert('sys_audit_logs', { user_id: req.user.id, action: 'UPDATE', module: 'Announcements', details: `Published announcement ID: ${req.params.id}`, ip_address: req.ip || '0.0.0.0' });
    return res.json({ success: true });
  } catch (e) { return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message }); }
});

// GET /api/documents
router.get('/documents', async (req, res) => {
  try {
    let docs = [];
    let requests = [];
    let employees = [];

    try {
      docs = await dbFetch('employee_documents', '*', {}, { order: 'created_at', ascending: false });
    } catch (e) {
      console.error('Error fetching employee_documents:', e.message);
    }

    try {
      requests = await dbFetch('doc_approval_requests', '*', {}, { order: 'created_at', ascending: false });
    } catch (e) {
      console.warn('doc_approval_requests table missing or error, checking fallback on employee_documents:', e.message);
      // Fallback: Filter docs that have pending/approval status
      requests = docs.filter(d => d.status && d.status !== 'COMPLETED_AND_ISSUED');
    }

    try {
      const [empList, depts, positions] = await Promise.all([
        dbFetch('Employees', 'id,Full_name,employee_id,position_id,Dept_id'),
        dbFetch('Departments', 'id,Department_name'),
        dbFetch('positions', 'id,title'),
      ]);
      const deptMap = Object.fromEntries((depts || []).map(d => [d.id, d.Department_name]));
      const posMap = Object.fromEntries((positions || []).map(p => [p.id, p.title]));
      employees = (empList || []).map(e => ({
        ...e,
        Position: posMap[e.position_id] || 'Staff',
        Department: deptMap[e.Dept_id] || 'General',
      }));
    } catch (e) {
      console.error('Error fetching Employees:', e.message);
    }

    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    docs.forEach(d => {
      const emp = empMap[d.employee_id] || {};
      d.employee_name = emp.Full_name || 'General Blank Template';
    });

    requests.forEach(r => {
      const emp = empMap[r.employee_id] || {};
      r.employee_name = emp.Full_name || 'General Blank Template';
    });

    return res.json({ documents: docs, requests, employees });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Checked downloads work for delegated document managers and the issued document's employee.
router.get('/documents/generated/:id',async(req,res)=>{
 try{
  const source=await findDocument(req.params.id,true);
  if(!source||!source.generated_snapshot)return res.status(404).json({error:'Generated document not found'});
  if(!canOpenDocument(req.user,source))return res.sendStatus(403);
  const bytes=await officialDocumentPdf(source);
  res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="HR_Official_Document.pdf"','Cache-Control':'private, no-store'}).send(bytes);
 }catch(error){res.status(error.status||500).json({error:'Unable to open the official document'});}
});
router.get('/documents/download/:id',async(req,res)=>{
 try{
  const doc=await findDocument(req.params.id);
  if(!doc)return res.status(404).json({error:'Document not found'});
  const generated=/^\/api\/documents\/generated\/([0-9a-f-]{36})$/i.exec(doc.file_url||'');
  const source=generated?await findDocument(generated[1],true):doc;
  if(!source||!canOpenDocument(req.user,doc,source))return res.sendStatus(403);
  if(generated){
   const bytes=await officialDocumentPdf(source);
   return res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="HR_Official_Document.pdf"','Cache-Control':'private, no-store'}).send(bytes);
  }
  if(doc.file_url?.startsWith('company_documents/')){
   const key=doc.file_url.slice('company_documents/'.length);
   if(!key||key.includes('..'))return res.sendStatus(400);
   const {data,error}=await systemDb.storage.from('company_documents').createSignedUrl(key,60);
   if(error)throw error;return res.redirect(data.signedUrl);
  }
  const legacy=/^\/api\/uploads\/generated_docs\/([A-Za-z0-9_.-]+\.pdf)$/.exec(doc.file_url||'');
  if(legacy&&!legacy[1].includes('..'))return res.sendFile(path.resolve(process.cwd(),'uploads','generated_docs',legacy[1]));
  if(typeof doc.file_url==='string'&&/^https:\/\//.test(doc.file_url))return res.redirect(doc.file_url);
  return res.status(404).json({error:'Document file is unavailable'});
 }catch(error){res.status(error.status||500).json({error:'Unable to open the document'});}
});

// POST /api/documents
router.post('/documents', requireAdmin, receiveHrFile('document_file',{types:['application/pdf']}), async (req, res) => {
  try {
    const { title, category, description, employee_id } = req.body;
    let file_url = req.body.file_url;
    let uploadedFilename = null;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!req.file) return res.status(400).json({ error: 'A PDF document file is strictly required for vault uploads' });

    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF files are allowed' });
      }
      const buffer = req.file.buffer;
      if (buffer.length < 5 || buffer.toString('utf8', 0, 5) !== '%PDF-') {
        return res.status(400).json({ error: 'Invalid PDF file signature' });
      }
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size must be under 10MB' });
      }
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}_${safeName}`;
      const { error } = await supabaseAdmin.storage
        .from('company_documents')
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });
      if (error) throw new Error('Failed to upload secure document: ' + error.message);
      file_url = `company_documents/${filename}`;
      uploadedFilename = filename;
    }

    try {
      const doc = await dbInsert('employee_documents', {
        title,
        category: category || 'General',
        doc_type: category || 'General',
        file_url: file_url,
        description: description || '',
        employee_id: (employee_id && employee_id !== 'GENERAL') ? employee_id : null,
        uploaded_by_user_id: req.user.id,
        created_at: new Date().toISOString(),
      });

      return res.json({ success: true, document: doc });
    } catch (dbError) {
      if (uploadedFilename) {
        try {
          await supabaseAdmin.storage.from('company_documents').remove([uploadedFilename]);
        } catch (cleanupError) {
          console.error('[STORAGE CLEANUP FAILED]', cleanupError);
        }
      }
      throw dbError; // Handled by outer catch
    }
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/documents/request-approval (HR -> Boss Request)
router.post('/documents/request-approval', requireAdmin, async (req, res) => {
  try {
    const { title, category, doc_type, description, file_url, employee_id, effective_date, new_position, new_department, new_salary } = req.body;
    if (/warning|disciplinary/i.test([title, category, doc_type].filter(Boolean).join(' '))) return res.status(409).json({error:'Create new warning letters in the Warning Letters app with Supervisor and HR approval.'});
    if (!title) {
      return res.status(400).json({ error: 'Document Title is required' });
    }

    // Lookup employee name & details or use General Bulk Template
    let empName = 'General Blank Template (Bulk Use)';
    let empIdStr = 'BULK-TEMPLATE';
    let targetEmpId = null;

    if (employee_id && employee_id !== 'GENERAL' && employee_id !== 'BULK') {
      const emp = await dbFetchOne('Employees', '*', { id: employee_id });
      if (!emp)return res.status(404).json({error:'Employee not found'});
      if (emp) {
        empName = emp.Full_name;
        empIdStr = emp.employee_id;
        targetEmpId = emp.id;
      }
    }

    const requestId=crypto.randomUUID();
    let finalFileUrl=(file_url||'').trim(),generated_snapshot=null;
    if(!finalFileUrl){
      if(new_salary!==undefined&&new_salary!==''&&new_salary!==null&&!req.user.is_owner&&!req.user.access.sensitive.salary)
       return res.status(403).json({error:'Salary access is required to create a salary letter.'});
      const amount=new_salary===undefined||new_salary===''||new_salary===null?null:Number(new_salary);
      if(amount!==null&&(!Number.isFinite(amount)||amount<0))return res.status(400).json({error:'Salary must be a non-negative number.'});
      const currency=String(req.body.salary_currency||'THB').toUpperCase();
      if(!/^[A-Z]{3}$/.test(currency))return res.status(400).json({error:'Use a three-letter salary currency.'});
      generated_snapshot={employee_name:empName,employee_code:empIdStr,new_position:new_position||null,new_department:new_department||null,new_salary:amount,salary_currency:currency};
      finalFileUrl='/api/documents/generated/'+requestId;
    }else if(!/^https:\/\//.test(finalFileUrl)&&!finalFileUrl.startsWith('company_documents/'))
      return res.status(400).json({error:'Use an HTTPS document link or upload a PDF.'});
    if(finalFileUrl.startsWith('company_documents/')&&!await dbFetchOne('employee_documents','id',{file_url:finalFileUrl}))
      return res.status(403).json({error:'Choose a vault file within your current document access.'});

    const payload = {
      id:requestId,generated_snapshot,
      employee_id: targetEmpId,
      title,
      doc_type: doc_type || category || 'Official Letter',
      category: category || 'General',
      description: description || '',
      file_url: finalFileUrl,
      effective_date: effective_date || new Date().toISOString().split('T')[0],
      status: 'PENDING_BOSS',
      requested_by_user_id: req.user.id,
      created_at: new Date().toISOString(),
    };

    const createdRequest=await dbInsert('doc_approval_requests',payload);

    // Notify Boss
    await dbInsert('system_notifications', {
      recipient_role: 'management',
      employee_id:targetEmpId,
      title: `📄 New Document Approval Requested`,
      message: `HR requested approval for "${title}" (${empName}).`,
      link_url: '/documents',
      is_read: false,
      created_at: new Date().toISOString()
    });

    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'CREATE_REQUEST',
      module: 'Document Vault',
      details: `Requested approval for document "${title}" targeting ${empName}`,
      ip_address: req.ip || '0.0.0.0'
    });

    return res.json({ success: true, request: createdRequest });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Both signatures lock the request and issue the document in one transaction.
// Capabilities are independent of legacy job titles.
for(const stage of ['boss','hr']) {
 router.post('/documents/'+stage+'-sign/:id', async(req,res)=>{
  try {
   const result=await integrityRpc('hr_sign_document',{p_actor:req.user.id,p_request:req.params.id,p_stage:stage,p_action:stage==='hr'?'APPROVE':req.body.action,p_signature:req.body[stage+'_signature']||null,p_reason:req.body.rejection_reason||null});
   res.json({success:true,status:result.status,request:result});
  }catch(error){res.status(error.status||500).json({error:error.message});}
 });
}

// DELETE /api/documents/request/:id
router.delete('/documents/request/:id',requireAdmin,async(req,res)=>{
 try{
  const row=await dbFetchOne('doc_approval_requests','id',{id:req.params.id});
  if(!row)return res.status(404).json({error:'Document request not found'});
  await dbDelete('doc_approval_requests',row.id);
  await dbInsert('sys_audit_logs',{user_id:req.user.id,action:'DELETE',module:'Document Vault',details:'Removed unreviewed document request '+row.id});
  res.json({success:true});
 }catch(error){res.status(error.status||(error.code==='23514'?409:500)).json({error:error.message});}
});
router.delete('/documents/:id',requireAdmin,async(req,res)=>{
 try{
  const row=await dbFetchOne('employee_documents','id',{id:req.params.id});
  if(!row)return res.status(404).json({error:'Document not found'});
  await dbDelete('employee_documents',row.id);
  // Storage remains private. Never remove shared bytes until all retained references are checked by maintenance.
  await dbInsert('sys_audit_logs',{user_id:req.user.id,action:'DELETE',module:'Document Vault',details:'Removed unissued vault record '+row.id});
  res.json({success:true});
 }catch(error){res.status(error.status||(error.code==='23514'?409:500)).json({error:error.message});}
});

export default router;
