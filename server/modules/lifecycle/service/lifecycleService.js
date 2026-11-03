import {auditContext} from '../../../middleware/auditContext.js';
import {integrityRpc} from '../../../lib/integrityRpc.js';
import { lifecycleRepository } from '../repository/lifecycleRepository.js';
import { handoverModule } from '../../handover/index.js';
import { dbFetch, dbFetchOne, dbInsert, dbUpdate } from '../../../lib/supabase.js';

function normalizeOffboarding(ob) {
  if (!ob) return ob;
  ob.last_working_day = ob.last_working_day || ob.last_working_date || null;
  ob.reason = ob.reason || ob.termination_reason || null;
  return ob;
}

export const lifecycleService = {
  // --- Onboarding ---
  getOnboardingList: async () => {
    const [onboarding, employees, assignments] = await Promise.all([
      lifecycleRepository.getAllOnboardings(),
      dbFetch('Employees', 'id,Full_name,employee_id,hire_date', { status: 'Active' }),
      lifecycleRepository.getAllOnboardingAssignmentsStatus()
    ]);
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    const assignMap = {};
    assignments.forEach(a => {
      if (!assignMap[a.onboarding_id]) assignMap[a.onboarding_id] = { total: 0, done: 0 };
      assignMap[a.onboarding_id].total += 1;
      if (a.status === 'Completed') assignMap[a.onboarding_id].done += 1;
    });

    onboarding.forEach(o => {
      const emp = empMap[o.employee_id] || {};
      o.employee_name = emp.Full_name || '—';
      o.employee_code = emp.employee_id || '—';

      const st = assignMap[o.id] || { total: 0, done: 0 };
      o.tasks_total = st.total;
      o.tasks_done = st.done;
      o.completion_pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    });

    const onboardedIds = new Set(onboarding.map(o => o.employee_id));
    const new_hires = employees.filter(e => !onboardedIds.has(e.id));

    const stats = {
      pre_boarding: onboarding.filter(o => o.status === 'Pre-boarding').length,
      in_progress: onboarding.filter(o => o.status === 'In Progress').length,
      completed: onboarding.filter(o => o.status === 'Completed').length,
    };

    return { onboarding, employees, new_hires, stats };
  },

  getOnboardingDetail: async (id) => {
    const ob = await lifecycleRepository.getOnboardingById(id);
    if (!ob) return null;

    const [tasks, employees, taskDefs] = await Promise.all([
      lifecycleRepository.getAssignmentsByOnboardingId(id),
      dbFetch('Employees', 'id,Full_name,employee_id'),
      lifecycleRepository.getOnboardingTasks()
    ]);

    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const emp = empMap[ob.employee_id] || {};
    ob.employee_name = emp.Full_name || '—';

    const tdMap = Object.fromEntries(taskDefs.map(t => [t.id, t]));
    tasks.forEach(t => {
      const def = tdMap[t.task_id] || {};
      t.task_name = def.task_name || '—';
      t.category = def.category || 'General';
      t.is_preboarding = def.is_preboarding || false;
      t.assigned_to = def.assigned_to_role || 'HR';
    });

    return { onboarding: ob, tasks };
  },

  createOnboarding: async (data) => {
    return integrityRpc('hr_create_lifecycle',{p_actor:auditContext.getStore()?.user?.id,p_kind:'onboarding',p_data:data,p_items:[]});
  },

  updateOnboarding: async (id, data) => {
    return await lifecycleRepository.updateOnboarding(id, {
      status: data.status,
      notes: data.notes,
      updated_at: new Date().toISOString()
    });
  },

  toggleOnboardingTask: async (onboardingId, assignId) => {
    const assign = await lifecycleRepository.getAssignmentById(assignId);
    // A task from a different onboarding case must never be changed by this URL.
    if (!assign || assign.onboarding_id !== onboardingId) throw new Error('Task not found');

    const isCompleted = assign.status === 'Completed';
    await lifecycleRepository.updateAssignment(assignId, {
      status: isCompleted ? 'Pending' : 'Completed',
      completed_at: isCompleted ? null : new Date().toISOString()
    });

    const allAssignments = await lifecycleRepository.getAssignmentStatusCounts(onboardingId);
    const done = allAssignments.filter(a => a.status === 'Completed').length;
    const total = allAssignments.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const newStatus = pct === 100 ? 'Completed' : 'In Progress';

    await lifecycleRepository.updateOnboarding(onboardingId, { completion_pct: pct, status: newStatus });

    return { pct, status: newStatus };
  },

  // --- Offboarding ---
  getOffboardingList: async () => {
    const [offboarding, employees, tasks, departments] = await Promise.all([
      lifecycleRepository.getAllOffboardings(),
      dbFetch('Employees', 'id,Full_name,employee_id,Dept_id,position_id'),
      lifecycleRepository.getAllOffboardingTasksStatus(),
      dbFetch('Departments', 'id,Department_name'),
    ]);

    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const deptMap = Object.fromEntries(departments.map(d => [d.id, d.Department_name]));

    const taskMap = {};
    tasks.forEach(t => {
      if (!taskMap[t.offboarding_id]) taskMap[t.offboarding_id] = { total: 0, done: 0 };
      taskMap[t.offboarding_id].total += 1;
      if (t.status === 'Completed') taskMap[t.offboarding_id].done += 1;
    });

    offboarding.forEach(o => {
      normalizeOffboarding(o);
      const emp = empMap[o.employee_id] || {};
      o.employee_name = emp.Full_name || '—';
      o.employee_code = emp.employee_id || '—';
      o.department = deptMap[emp.Dept_id] || '—';

      const st = taskMap[o.id] || { total: 0, done: 0 };
      o.tasks_total = st.total;
      o.tasks_done = st.done;
      o.completion_pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    });

    return { offboarding, employees };
  },

  getOffboardingDetail: async (id) => {
    const ob = await lifecycleRepository.getOffboardingById(id);
    if (!ob) return null;

    const employees = await dbFetch('Employees', 'id,Full_name,employee_id');
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const emp = empMap[ob.employee_id] || {};
    ob.employee_name = emp.Full_name || '—';
    ob.employee_code = emp.employee_id || '—';

    const tasks = await lifecycleRepository.getTasksByOffboardingId(id);

    let handover = null;
    normalizeOffboarding(ob);
    // Still safely querying handovers using direct dbFetchOne here to maintain exact legacy behavior for now.
    // Or we could use handoverModule. However, the requirement is to use handoverModule if possible.
    if (ob.handover_id) {
      handover = await dbFetchOne('employee_handovers', '*', { id: ob.handover_id });
    } else {
      handover = await dbFetchOne('employee_handovers', '*', { offboarding_id: ob.id });
    }

    return { offboarding: ob, tasks, handover };
  },

  getOffboardingSimple: async (id) => {
    const ob = await lifecycleRepository.getOffboardingById(id);
    if (!ob) return null;
    const employees = await dbFetch('Employees', 'id,Full_name,employee_id');
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const emp = empMap[ob.employee_id] || {};
    ob.employee_name = emp.Full_name || '—';
    return { offboarding: ob };
  },

  createOffboarding: async (data, creatorUserId) => {
    const result=await integrityRpc('hr_create_lifecycle',{p_actor:creatorUserId,p_kind:'offboarding',p_data:data,p_items:handoverModule.DEFAULT_HANDOVER_ITEMS});
    return normalizeOffboarding(result);
  },

  updateOffboardingStatus: async (id, data) => {
    if(data.settlement_status!=='Hold')throw Object.assign(new Error('Use the dedicated settlement release action.'),{status:409});
    return await lifecycleRepository.updateOffboarding(id, {
      settlement_status: data.settlement_status,
      updated_at: new Date().toISOString()
    });
  },

  toggleClearanceField: async (id, field, value) => {
    const allowed = ['laptop_returned', 'access_card_returned', 'nda_signed', 'knowledge_transfer'];
    if (!allowed.includes(field)) throw new Error('Invalid field');
    return await lifecycleRepository.updateOffboarding(id, {
      [field]: value,
      updated_at: new Date().toISOString()
    });
  },

  releaseSettlement: async (id) => {
    const actor=auditContext.getStore()?.user?.id;
    if(!actor)throw Object.assign(new Error('Authenticated settlement approval is required.'),{status:403});
    return integrityRpc('hr_release_settlement',{p_actor:actor,p_case:id});
  },

  toggleOffboardingTask: async (offboardingId, taskId) => {
    const task = await lifecycleRepository.getTaskById(taskId);
    if (!task || task.offboarding_id !== offboardingId) throw new Error('Task not found');
    const isDone = task.status === 'Completed';
    return await lifecycleRepository.updateTask(taskId, {
      status: isDone ? 'Pending' : 'Completed',
      completed_at: isDone ? null : new Date().toISOString(),
    });
  },

  saveExitInterview: async (id, data) => {
    const ob=await lifecycleRepository.getOffboardingById(id);
    if(!ob)throw Object.assign(new Error('Offboarding not found'),{status:404});
    const ei = await lifecycleRepository.getExitInterviewByOffboardingId(id);
    const dataObj = {
      offboarding_id: id,employee_id:ob.employee_id,
      interviewer_name: data.interviewer_name,
      interview_date: data.interview_date,
      reason_for_leaving: data.reason_for_leaving,
      job_satisfaction: data.job_satisfaction,
      management_rating: data.management_rating,
      work_environment: data.work_environment,
      compensation_benefits: data.compensation_benefits,
      career_growth: data.career_growth,
      return_future: data.return_future,
      recommend_company: data.recommend_company,
      highlights: data.highlights,
      improvements: data.improvements,
      additional_comments: data.additional_comments,
      updated_at: new Date().toISOString()
    };

    if (ei) {
      await lifecycleRepository.updateExitInterview(ei.id, dataObj);
    } else {
      await lifecycleRepository.createExitInterview({ ...dataObj, created_at: new Date().toISOString() });
    }
  },

  getExitSurvey: async (employeeId) => {
    if (!employeeId) return { ob: null, ei: null };

    const ob = await lifecycleRepository.getOffboardingByEmployeeId(employeeId);
    if (!ob) return { ob: null, ei: null };

    const ei = await lifecycleRepository.getExitInterviewByOffboardingId(ob.id);
    return { ob, ei };
  },

  linkHandover: async (offboardingId, handoverId) => {
    return await lifecycleRepository.updateOffboarding(offboardingId, {
      handover_id: handoverId,
      handover_required: true,
      updated_at: new Date().toISOString()
    });
  },

  getActiveOffboardingWarning: async (employeeId) => {
    if (!employeeId) return null;
    const ob = await lifecycleRepository.getOffboardingByEmployeeId(employeeId);
    if (!ob) return null;
    return {
      code: 'employee_in_offboarding',
      message: 'This employee has an active offboarding case. Leave and offboarding will run in parallel — continue tracking laptop return, NDA, exit interview, and settlement on Offboarding.',
      offboarding_id: ob.id,
      last_working_date: ob.last_working_date || null,
    };
  },

  getOffboardingById: async (id) => {
    return await lifecycleRepository.getOffboardingById(id);
  },

  submitExitSurvey: async (employeeId, data) => {
    if (!employeeId) throw new Error('No employee profile');

    const ob = await lifecycleRepository.getOffboardingByEmployeeId(employeeId);
    if (!ob) throw new Error('No offboarding record found for you');

    const ei = await lifecycleRepository.getExitInterviewByOffboardingId(ob.id);
    const dataObj = {
      offboarding_id: ob.id,employee_id:employeeId,
      reason_for_leaving: data.reason_for_leaving,
      job_satisfaction: data.job_satisfaction,
      management_rating: data.management_rating,
      work_environment: data.work_environment,
      compensation_benefits: data.compensation_benefits,
      career_growth: data.career_growth,
      return_future: data.return_future,
      recommend_company: data.recommend_company,
      highlights: data.highlights,
      improvements: data.improvements,
      additional_comments: data.additional_comments,
      updated_at: new Date().toISOString()
    };

    if (ei) {
      await lifecycleRepository.updateExitInterview(ei.id, dataObj);
    } else {
      await lifecycleRepository.createExitInterview(dataObj);
    }
  },

  markKnowledgeTransferComplete: async (offboardingId, options = {}) => {
    if (!offboardingId) return;

    const { isWaived, reason, userId } = options;

    const updateData = {
      knowledge_transfer: true,
      updated_at: new Date().toISOString(),
    };

    if (isWaived) {
      updateData.handover_required = false;
      updateData.handover_waived_reason = reason;
      updateData.handover_waived_by = userId;
    }

    await lifecycleRepository.updateOffboarding(offboardingId, updateData);

    const tasks = await lifecycleRepository.getTasksByOffboardingId(offboardingId);
    for (const t of tasks) {
      if (
        t.category === 'Knowledge Transfer' ||
        (t.task_name && (t.task_name.includes('Knowledge Transfer') || t.task_name.includes('Handover')))
      ) {
        if (t.status !== 'Completed') {
          await lifecycleRepository.updateTask(t.id, {
            status: 'Completed',
            completed_at: new Date().toISOString(),
          });
        }
      }
    }
  },

  getLastWorkingDate: async (employeeId) => {
    if (!employeeId) return null;
    const records = await lifecycleRepository.getCorporateOffboarding();
    const ob = records.find(r => r.employee_id === employeeId);
    return ob || null;
  }
};
