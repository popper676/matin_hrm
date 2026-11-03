import express from 'express';
import {getBkkDateString} from '../lib/dateUtils.js';
import { openingIsOpen } from '../lib/jobOpenings.js';
import { dbFetch } from '../shared/db/index.js';
import { verifyToken } from '../shared/auth/index.js';
import { payrollModule } from '../modules/payroll/index.js';
import { hrmModule } from '../modules/hrm/index.js';

const router = express.Router();

// GET /api/dashboard
router.get('/', verifyToken, async (req, res) => {
  try {
    const today = getBkkDateString(new Date());
    const user = req.user;
    const role = user?.role || '';

    const { supabase } = await import('../shared/db/index.js');

    const [
      employeesRes,
      attendanceData,
      leaveReqsData,
      offboardingRes,
      onboardingRes,
      candidatesRes,
      payrollsRes,
      announcementsRes,
      positionsRes
    ] = await Promise.all([
      supabase.from('Employees').select('id,employee_id,Full_name,status,Dept_id'),
      hrmModule.getAttendanceSummaryForPayroll(today),
      hrmModule.getAllLeaveRequests(),
      supabase.from('corporate_offboarding').select('id,settlement_status'),
      supabase.from('employee_onboarding').select('id,status'),
      supabase.from('recruitment_candidates').select('id,status'),
      payrollModule.getPaidPayrolls(),
      supabase.from('announcements').select('*'),
      supabase.from('job_openings').select('id,status,published_snapshot'),
    ]);

    const employees = employeesRes.data || [];
    const attendance = attendanceData || [];
    const leaveReqs = leaveReqsData || [];
    const offboarding = offboardingRes.data || [];
    const onboarding = onboardingRes.data || [];
    const candidates = candidatesRes.data || [];
    const payrolls = payrollsRes;
    const rawAnnouncements = announcementsRes.data || [];
    const positionsData = positionsRes.data || [];

    const totalStaff = employees.length;
    const activeStaff = employees.filter(e => String(e.status || '').toLowerCase() === 'active').length;
    const onLeave = employees.filter(e => String(e.status || '').toLowerCase().includes('leave')).length;
    const todayPresent = attendance.filter(a => a.check_in && getBkkDateString(a.check_in)===today).length;
    const lateToday = attendance.filter(a => a.is_late && a.check_in && getBkkDateString(a.check_in)===today).length;
    const pendingLeaves = leaveReqs.filter(l => String(l.status || '').toLowerCase() === 'pending').length;
    const approvedLeaves = leaveReqs.filter(l => String(l.status || '').toLowerCase() === 'approved').length;
    const rejectedLeaves = leaveReqs.filter(l => String(l.status || '').toLowerCase() === 'rejected').length;
    const pendingClear = offboarding.filter(o => String(o.settlement_status || '').toLowerCase().startsWith('hold')).length;
    const activeOnboard = onboarding.filter(o => ['Pre-boarding', 'In Progress'].includes(o.status)).length;
    const openPositions = positionsData.filter(p => openingIsOpen(p)).length;
    const totalPayroll = payrolls.filter(p => p.payment_status === 'Paid').reduce((sum, p) => sum + parseFloat(p.net_salary || 0), 0);
    const offboardedCount = offboarding.length;
    const turnoverRate = totalStaff > 0 ? ((offboardedCount / totalStaff) * 100).toFixed(1) : '0.0';

    // Attendance chart data
    const presentOnTime = todayPresent - lateToday;
    const absentToday = Math.max(0, activeStaff - todayPresent - onLeave);
    const attChart = {
      'On Time': presentOnTime,
      'Late': lateToday,
      'On Leave': onLeave,
      'Absent': absentToday,
    };

    const leaveChart = { Pending: pendingLeaves, Approved: approvedLeaves, Rejected: rejectedLeaves };

    const parsedAnnouncements = rawAnnouncements.map(a => {
      let content = a.content || '';
      let expiry = null;
      const match = content.match(/___EXPIRY:([\d-]+)/);
      if (match) {
        expiry = match[1];
        content = content.replace(match[0], '').trim();
      }
      return { ...a, content, expiry_date: expiry };
    });

    // Announcements with role filter
    const announcements = parsedAnnouncements.filter(a => {
      const tr = a.target_role || 'All';
      if (tr === 'Pending HR Review') return false;
      if (['boss', 'hr_manager', 'admin'].includes(role)) return true;
      return ['All', role].includes(tr);
    });

    const recentEmployees = employees.slice(0, 8);

    return res.json({
      stats: {
        total_staff: totalStaff,
        active_staff: activeStaff,
        on_leave: onLeave,
        today_present: todayPresent,
        late_today: lateToday,
        total_leaves: approvedLeaves,
        pending_clearances: pendingClear,
        active_onboarding: activeOnboard,
        open_recruitment: openPositions,
        total_payroll_paid: `$${totalPayroll.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        turnover_rate: `${turnoverRate}%`,
      },
      att_chart: attChart,
      leave_chart: leaveChart,
      recent_employees: recentEmployees,
      ann_list: announcements,
      today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    });
  } catch (e) {
    console.error('[DASHBOARD]', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
