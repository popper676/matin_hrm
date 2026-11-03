import { leaveRepository } from '../repository/leaveRepository.js';
import {
  enrichLeaveWithHandoverFlags,
  getActiveLinkedLeaveHandovers,
} from '../../../lib/handoverHelpers.js';
import { dbFetch, systemDb } from '../../../lib/supabase.js';
import { integrityRpc } from '../../../lib/integrityRpc.js';

export function getWorkingDays(startDateStr, endDateStr) {
  const start = new Date(`${startDateStr}T12:00:00`);
  const end = new Date(`${endDateStr}T12:00:00`);
  if (end < start) return 0;
  
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  
  let count = 0;
  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    if (currentDate.getDay() !== 0) { // 0 is Sunday
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return count;
}

export const leaveService = {
  getLeaveOverview: async (isAdmin, employeeId) => {
    const reqFilter = isAdmin ? {} : { employee_id: employeeId };
    const balFilter = isAdmin ? {} : { employee_id: employeeId };

    const [requests, leaveTypes, employees, balances] = await Promise.all([
      leaveRepository.getLeaveRequests(reqFilter, { order: 'created_at', ascending: false }),
      leaveRepository.getLeaveTypes(),
      dbFetch('Employees', 'id,Full_name,employee_id', { status: 'Active' }),
      leaveRepository.getLeaveBalances(balFilter)
    ]);

    const approvals=requests.length?await systemDb.from('hr_approval_requests').select('id,resource_id').eq('workflow_key','leave').in('resource_id',requests.map(r=>r.id)):{data:[]};
    if(approvals.error)throw approvals.error;
    const approvalMap=new Map((approvals.data||[]).map(a=>[a.resource_id,a.id]));
    for(const r of requests){r.approval_id=approvalMap.get(r.id)||null;}
    const ltMap = Object.fromEntries(leaveTypes.map(t => [t.id, t.type_name]));
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    
    const activeBalances = balances.filter(b => empMap[b.employee_id]);
    
    const handoverIds = [
      ...new Set(
        requests.flatMap(r => [r.coverage_handover_id, r.return_handover_id].filter(Boolean))
      ),
    ];
    let handoverMap = {};
    if (handoverIds.length) {
      const handovers = await leaveRepository.getHandoversByIds(handoverIds);
      handoverMap = Object.fromEntries(handovers.map(h => [h.id, h]));
    }

    const { lifecycleModule } = await import('../../lifecycle/index.js');

    for (const r of requests) {
      r.type_name = r.form_snapshot?.type_name || ltMap[r.leave_type_id] || '—';
      const emp = empMap[r.employee_id] || {};
      r.employee_name = emp.Full_name || '—';
      r.employee_code = emp.employee_id || '—';
      await enrichLeaveWithHandoverFlags(r, handoverMap);
      if(r.approval_id){r.can_delete_leave=false;r.delete_blocked_reason='Requests with approval history must be retained.';}
      
      const ob = await lifecycleModule.getLastWorkingDate(r.employee_id);
      r.employee_in_offboarding = !!ob;
      if (ob) {
        r.offboarding_warning =
          'Employee is in offboarding. Leave coverage can proceed, but exit tasks (laptop, NDA, exit interview, settlement) must still be completed separately.';
        r.offboarding_last_working_date = ob.last_working_date || null;
      }
    }
    activeBalances.forEach(b => { b.type_name = ltMap[b.leave_type_id] || '—'; });
    
    return { requests, leave_types: leaveTypes, employees, balances: activeBalances };
  },

  createLeaveRequest: async (data, documentUrl) => {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (end < start) {
      throw new Error('Invalid date range: end date cannot be earlier than start date.');
    }
    return await leaveRepository.createLeaveRequest({
      employee_id: data.employee_id,
      leave_type_id: data.leave_type_id,
      start_date: data.start_date,
      end_date: data.end_date,
      reason: data.reason,
      status: 'Pending',
      document_url: documentUrl,
      created_at: new Date().toISOString(),
    });
  },

  updateLeaveStatus: async (id, status, e_signature, actorId) => {
    // Legacy form history is not an alternative to the modern staged approval
    // workflow. Only the Owner may reverse a historic approval, and both the
    // leave row and its annual balances change in a single database transaction.
    const result = await integrityRpc('hr_correct_legacy_leave', {
      p_actor: actorId,
      p_id: id,
      p_status: status,
      p_signature: e_signature ?? null,
    });
    return { reqData: result, warning: null };
  },

  deleteLeaveRequest: async (id) => {
    const leave = await leaveRepository.getLeaveRequestById(id);
    if (!leave) throw new Error('Leave request not found');

    if(leave.status==='Approved')throw Object.assign(new Error('Approved leave records must be retained. Reverse the legacy approval before deleting.'),{status:409});
    const activeHandovers = await getActiveLinkedLeaveHandovers(leave);
    if (activeHandovers.length > 0) {
      const first = activeHandovers[0];
      const err = new Error(`Cannot delete leave while ${first.handover_kind || 'coverage'} handover is active (${first.status?.replace(/_/g, ' ')}). Waive or complete the handover first.`);
      err.active_handovers = activeHandovers.map(h => ({
        id: h.id,
        kind: h.handover_kind,
        status: h.status,
      }));
      throw err;
    }

    if(leave.coverage_handover_id||leave.return_handover_id)throw Object.assign(new Error('Leave linked to handover history must be retained.'),{status:409});
    await leaveRepository.deleteLeaveRequest(id);
  },
  
  getLeaveTypes: async () => leaveRepository.getLeaveTypes(),
  createLeaveType: async (data) => leaveRepository.createLeaveType(data),
  updateLeaveType: async (id, data) => leaveRepository.updateLeaveType(id, data),
  deleteLeaveType: async (id) => leaveRepository.deleteLeaveType(id),

  // Public HRM API methods:
  getEmployeeLeaveBalances: async (employeeId) => {
    return await leaveRepository.getLeaveBalances({ employee_id: employeeId });
  },

  getActiveLeaves: async () => {
    return await leaveRepository.getLeaveRequests({ status: 'Approved' });
  },

  getEmployeeLeaveRequests: async (employeeId) => {
    return await leaveRepository.getLeaveRequests({ employee_id: employeeId }, { order: 'created_at', ascending: false });
  },
  
  getAllLeaveRequests: async () => {
    return await leaveRepository.getLeaveRequests({}, { order: 'created_at', ascending: false });
  },
  
  getLeaveBalancesForAll: async () => {
    return await leaveRepository.getLeaveBalances({});
  },

  createNotification: async (data) => leaveRepository.createNotification(data),

  linkCoverageHandover: async (leaveId, handoverId) => {
    if (!leaveId) return;
    return await leaveRepository.updateLeaveRequest(leaveId, {
      coverage_handover_id: handoverId
    });
  },

  linkReturnHandover: async (leaveId, handoverId) => {
    if (!leaveId) return;
    return await leaveRepository.updateLeaveRequest(leaveId, {
      return_handover_id: handoverId
    });
  }
};
