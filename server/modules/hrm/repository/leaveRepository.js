import { supabase, dbFetch, dbFetchOne, dbInsert, dbUpdate, dbDelete } from '../../../lib/supabase.js';

export const leaveRepository = {
  getLeaveRequests: async (query = {}, options = {}) => {
    return await dbFetch('Leave_Request', '*', query, options);
  },

  getLeaveRequestById: async (id) => {
    return await dbFetchOne('Leave_Request', '*', { id });
  },

  createLeaveRequest: async (data) => {
    return await dbInsert('Leave_Request', data);
  },

  updateLeaveRequest: async (id, data) => {
    return await dbUpdate('Leave_Request', id, data);
  },

  deleteLeaveRequest: async (id) => {
    await dbDelete('Leave_Request', id);
  },

  getLeaveBalances: async (query = {}) => {
    return await dbFetch('Leave_balances', '*', query);
  },

  getLeaveBalanceByComposite: async (employeeId, leaveTypeId) => {
    return await dbFetchOne('Leave_balances', '*', { 
      employee_id: employeeId, 
      leave_type_id: leaveTypeId 
    });
  },

  updateLeaveBalance: async (id, data) => {
    return await dbUpdate('Leave_balances', id, data);
  },

  getLeaveTypes: async () => {
    return await dbFetch('Leave_type', '*', {}, { order: 'type_name', ascending: true });
  },

  createLeaveType: async (data) => {
    return await dbInsert('Leave_type', data);
  },

  updateLeaveType: async (id, data) => {
    return await dbUpdate('Leave_type', id, data);
  },

  deleteLeaveType: async (id) => {
    await dbDelete('Leave_type', id);
  },

  getHandoversByIds: async (ids) => {
    const { data } = await supabase
      .from('employee_handovers')
      .select('id,status,completion_pct')
      .in('id', ids);
    return data || [];
  },

  createNotification: async (data) => {
    return await dbInsert('system_notifications', data);
  }
};
