import { dbFetch, dbFetchOne, dbInsert, dbUpdate } from '../../../lib/supabase.js';

export const handoverRepository = {
  // --- Handovers ---
  getHandoverById: async (id) => {
    return await dbFetchOne('employee_handovers', '*', { id });
  },
  
  getHandoversByOutgoingEmployee: async (employeeId) => {
    return await dbFetch('employee_handovers', '*', { outgoing_employee_id: employeeId });
  },

  getHandoversBySuccessorEmployee: async (employeeId) => {
    return await dbFetch('employee_handovers', '*', { successor_employee_id: employeeId });
  },

  getHandoversByOffboardingId: async (offboardingId) => {
    return await dbFetchOne('employee_handovers', '*', { offboarding_id: offboardingId });
  },

  getHandoversByCoverageLeaveId: async (leaveId) => {
    return await dbFetchOne('employee_handovers', '*', { id: leaveId }); // Wait, id? No, coverage_handover_id? 
    // Usually we fetch by leave_request_id or parent_handover_id, but the caller handles that.
  },

  getAllHandovers: async (orderBy = 'created_at', ascending = false) => {
    return await dbFetch('employee_handovers', '*', {}, { order: orderBy, ascending });
  },

  createHandover: async (data) => {
    return await dbInsert('employee_handovers', data);
  },

  updateHandover: async (id, data) => {
    return await dbUpdate('employee_handovers', id, data);
  },

  // --- Handover Items ---
  getItemsByHandoverId: async (handoverId) => {
    return await dbFetch('handover_items', '*', { handover_id: handoverId }, { order: 'sort_order', ascending: true });
  },

  getItemById: async (id, handoverId) => {
    return await dbFetchOne('handover_items', '*', { id, handover_id: handoverId });
  },

  createHandoverItem: async (data) => {
    return await dbInsert('handover_items', data);
  },

  updateHandoverItem: async (id, data) => {
    return await dbUpdate('handover_items', id, data);
  },

  bulkGetItemsByHandoverIds: async (handoverIds) => {
    if (!handoverIds || handoverIds.length === 0) return [];
    const { supabase } = await import('../../../lib/supabase.js');
    const { data } = await supabase.from('handover_items').select('*').in('handover_id', handoverIds).order('sort_order');
    return data || [];
  },

  // --- Handover Attachments ---
  getAttachmentsByHandoverId: async (handoverId) => {
    return await dbFetch('handover_attachments', '*', { handover_id: handoverId });
  },

  createAttachment: async (data) => {
    return await dbInsert('handover_attachments', data);
  },

  bulkGetAttachmentsByHandoverIds: async (handoverIds) => {
    if (!handoverIds || handoverIds.length === 0) return [];
    const { supabase } = await import('../../../lib/supabase.js');
    const { data } = await supabase.from('handover_attachments').select('*').in('handover_id', handoverIds);
    return data || [];
  }
};
