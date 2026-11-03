import {payrollCalculationDb} from '../../../lib/calculationDatabase.js';
import {summarizeLeaveUnits} from '../../../lib/leaveUnits.js';
import { dbFetch, dbFetchOne, supabase } from '../../../lib/supabase.js';
import { getBkkDateString,bkkMonthBounds } from '../../../lib/dateUtils.js';
import {
  calculateAttendanceScore,
  calculatePunctualityScore,
  calculateSopScore,
  calculatePeerScore,
} from '../engine/payrollCalculationEngine.js';
import { getPayrollPolicy, getWeeklyHolidaySet } from './payrollPolicyService.js';

export const compensationService = {
  getEmployeeCompensationContext: async (employee_id, month, req_working_days = null) => {
    const source = payrollCalculationDb(employee_id);
    const {data:employee,error:employeeError} = await source.from('Employees').select('id, Full_name, position_id, salary').maybeSingle();
    if(employeeError)throw employeeError;
    if (!employee) throw new Error('Employee not found');

    // Load company payroll policy (Phase 2)
    const policy = await getPayrollPolicy('lm');
    const holidaySet = getWeeklyHolidaySet(policy);

    const base_salary  = Number(employee.salary ?? 0);
    // If caller passes explicit working_days (from payroll UI), use it.
    // Otherwise use policy.salary_divisor (Phase 2). LM_HR default = 26.
    const working_days = Number(req_working_days ?? policy.salary_divisor);
    if(!Number.isFinite(base_salary)||base_salary<0)throw Object.assign(new Error('Employee salary must be a non-negative number.'),{status:400});
    if(!Number.isInteger(working_days)||working_days<1||working_days>365)throw Object.assign(new Error('working_days must be an integer between 1 and 365.'),{status:400});
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(new Error('month must be YYYY-MM.'),{status:400});
    
    const {start:startDate,end:endDate,nextDay}=bkkMonthBounds(month);
    
    // 1. Attendance & Leaves
    const { data: monthly_attendance, error:attendanceError } = await source
      .from('attendance_records')
      .select('check_in, check_out, is_late')
      .eq('employee_id', employee_id)
      .gte('check_in', startDate)
      .lt('check_in', endDate);
      
    if(attendanceError)throw attendanceError;
    const valid_attendance = monthly_attendance || [];
    const attendance_dates = new Set();
    let on_time_count = 0;
    const checkinByDate = {};
    
    valid_attendance.forEach(a => {
      if (!a.check_in) return;
      const dateStr = getBkkDateString(a.check_in);
      attendance_dates.add(dateStr);
      if (!checkinByDate[dateStr] || new Date(a.check_in) < new Date(checkinByDate[dateStr].check_in)) {
        checkinByDate[dateStr] = a;
      }
    });

    Object.values(checkinByDate).forEach(a => {
      if (a.is_late === false || a.is_late === 'false') {
        on_time_count++;
      }
    });
    
    let creditedAttendance=null;
    let approved_leave_days = 0;
    let unpaid_leave_days = 0;
    try {
      const [{ data: leaveTypes, error: typeError }, {data: leaves,error:leaveError}] = await Promise.all([
        source.from('Leave_type').select('id, is_paid'),
        source.from('Leave_Request').select('*').eq('status','Approved')
      ]);
      if(typeError||leaveError)throw typeError||leaveError;
      const unpaidTypeIds = new Set((leaveTypes || []).filter(t => t.is_paid === false || t.is_paid === 'false').map(t => t.id));
      
      const mStartStr = `${month}-01`;
      const mEndStr = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);

      const summary=summarizeLeaveUnits(leaves,mStartStr,mEndStr,attendance_dates,new Set(Object.entries(checkinByDate).filter(([,a])=>a.is_late===false||a.is_late==='false').map(([d])=>d)),unpaidTypeIds,holidaySet);
      approved_leave_days=summary.approved_leave_days;
      unpaid_leave_days=summary.unpaid_leave_days;
      on_time_count=summary.on_time_count;
      // Convert modern half-day presence to its remaining shift fraction.
      creditedAttendance=summary.actual_attendance;
    } catch(e) { 
      console.error('Leave fetch error', e); 
      throw e; 
    }

    const actual_attendance = creditedAttendance ?? attendance_dates.size + approved_leave_days;
    const attendance_score  = calculateAttendanceScore(actual_attendance, working_days);

    // Policy-driven punctuality rule: approved leave may count as on-time
    if (policy.approved_leave_counts_as_punctual) {
      on_time_count += approved_leave_days;
    }
    const punctuality_score = calculatePunctualityScore(on_time_count, actual_attendance);
    
    // 2. SOPs
    let sop_score = 100.0;
    let completed_sops_count = 0;
    let total_sops_count = 0;
    try {
      const { data: monthly_sops,error:sopError } = await source
        .from('daily_sops')
        .select('assigned_date, is_completed, task_description, content')
        .eq('employee_id', employee_id)
        .gte('assigned_date', month+'-01')
        .lt('assigned_date', nextDay);
        
      if(sopError)throw sopError;
      if (monthly_sops && monthly_sops.length > 0) {
        monthly_sops.forEach(s => {
          const tasks = (s.task_description || s.content || '').split('\n').filter(t => t.trim());
          const taskCount = Math.max(1, tasks.length);
          total_sops_count += taskCount;
          if (s.is_completed) completed_sops_count += taskCount;
        });
        sop_score = calculateSopScore(completed_sops_count, total_sops_count, policy);
      }
    } catch (e) {
      console.error('SOP fetch error', e);
      throw e;
    }
    
    // 3. Peer Voting
    let peer_score = 100.0;
    let peer_votes_count = 0;
    try {
      const { data: all_votes, error: peerErr } = await source
        .from('peer_voting_records')
        .select('*')
        .eq('nominee_id', employee_id)
        .gte('created_at', startDate)
        .lt('created_at', endDate);
        
      if (peerErr) throw peerErr;
      if (all_votes && all_votes.length > 0) {
        peer_votes_count = all_votes.length;
        const avg_stars = all_votes.reduce((acc, v) => acc + parseFloat(v.score || 0), 0) / all_votes.length;
        peer_score = calculatePeerScore(avg_stars, policy.peer_score_max_stars, policy);
      }
    } catch (e) {
      console.error('Peer voting fetch error', e);
      throw e;
    }

    return {
      base_salary,
      working_days,
      actual_attendance,
      on_time_count,
      attendance_score,
      punctuality_score,
      completed_sops_count,
      total_sops_count,
      sop_score,
      peer_votes_count,
      peer_score,
      unpaid_leave_days
    };
  },
  
  getEmployeesForPayroll: async () => {
    const [employees, positions] = await Promise.all([
      dbFetch('Employees', 'id,Full_name,employee_id,position_id'),
      dbFetch('positions', 'id,title')
    ]);
    return { employees, positions };
  }
};
