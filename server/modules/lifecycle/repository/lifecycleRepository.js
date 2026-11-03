import { dbFetch, dbFetchOne, dbInsert, dbUpdate } from '../../../lib/supabase.js';

export const lifecycleRepository = {
  // --- Onboarding ---
  getAllOnboardings: async () => {
    return await dbFetch('employee_onboarding', '*', {}, { order: 'created_at', ascending: false });
  },

  getOnboardingById: async (id) => {
    return await dbFetchOne('employee_onboarding', '*', { id });
  },

  createOnboarding: async (data) => {
    return await dbInsert('employee_onboarding', data);
  },

  updateOnboarding: async (id, data) => {
    return await dbUpdate('employee_onboarding', id, data);
  },

  // --- Onboarding Tasks ---
  getOnboardingTasks: async () => {
    return await dbFetch('onboarding_tasks', '*');
  },

  getDefaultOnboardingTasks: async () => {
    return await dbFetch('onboarding_tasks', 'id,due_days_after_hire');
  },

  // --- Onboarding Assignments ---
  getAllOnboardingAssignmentsStatus: async () => {
    return await dbFetch('onboarding_assignments', 'onboarding_id,status');
  },

  getAssignmentsByOnboardingId: async (onboardingId) => {
    return await dbFetch('onboarding_assignments', '*', { onboarding_id: onboardingId });
  },

  getAssignmentById: async (id) => {
    return await dbFetchOne('onboarding_assignments', '*', { id });
  },

  getAssignmentStatusCounts: async (onboardingId) => {
    return await dbFetch('onboarding_assignments', 'status', { onboarding_id: onboardingId });
  },

  createAssignmentsBulk: async (assignments) => {
    const { supabase } = await import('../../../lib/supabase.js');
    const { data,error } = await supabase.from('onboarding_assignments').insert(assignments);
    if(error)throw error;
    return data;
  },

  updateAssignment: async (id, data) => {
    return await dbUpdate('onboarding_assignments', id, data);
  },

  // --- Offboarding ---
  getAllOffboardings: async () => {
    return await dbFetch('corporate_offboarding', '*', {}, { order: 'created_at', ascending: false });
  },

  getCorporateOffboarding: async () => {
    return await dbFetch('corporate_offboarding', 'employee_id,id,last_working_date');
  },

  getOffboardingById: async (id) => {
    return await dbFetchOne('corporate_offboarding', '*', { id });
  },

  getOffboardingByEmployeeId: async (employeeId) => {
    return await dbFetchOne('corporate_offboarding', '*', { employee_id: employeeId });
  },

  createOffboarding: async (data) => {
    return await dbInsert('corporate_offboarding', data);
  },

  updateOffboarding: async (id, data) => {
    return await dbUpdate('corporate_offboarding', id, data);
  },

  // --- Offboarding Case Tasks ---
  getAllOffboardingTasksStatus: async () => {
    return await dbFetch('offboarding_case_tasks', 'offboarding_id,status');
  },

  getTasksByOffboardingId: async (offboardingId) => {
    return await dbFetch('offboarding_case_tasks', '*', { offboarding_id: offboardingId });
  },

  getTaskById: async (id) => {
    return await dbFetchOne('offboarding_case_tasks', '*', { id });
  },

  createTasksBulk: async (tasks) => {
    const { supabase } = await import('../../../lib/supabase.js');
    const { data,error } = await supabase.from('offboarding_case_tasks').insert(tasks);
    if(error)throw error;
    return data;
  },

  updateTask: async (id, data) => {
    return await dbUpdate('offboarding_case_tasks', id, data);
  },

  // --- Exit Interviews / Surveys ---
  getExitInterviewByOffboardingId: async (offboardingId) => {
    return await dbFetchOne('exit_interviews', '*', { offboarding_id: offboardingId });
  },

  createExitInterview: async (data) => {
    return await dbInsert('exit_interviews', data);
  },

  updateExitInterview: async (id, data) => {
    return await dbUpdate('exit_interviews', id, data);
  }
};
