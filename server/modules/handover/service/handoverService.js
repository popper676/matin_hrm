import {can} from '../../../../shared/accessPolicy.js';
import {integrityRpc} from '../../../lib/integrityRpc.js';
import { hrFileUrl } from '../../../lib/hrStorage.js';
import { dbFetch, dbFetchOne, dbInsert, dbUpdate } from '../../../lib/supabase.js';
import { handoverRepository } from '../repository/handoverRepository.js';

export const TERMINAL_HANDOVER_STATUSES = ['completed', 'waived', 'cancelled'];

export const DEFAULT_HANDOVER_ITEMS = [
  { title: 'Role summary', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 1, is_required: true },
  { title: 'Daily & weekly responsibilities', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 2, is_required: true },
  { title: 'Open projects & tasks', category: 'pending_work', owner_role: 'outgoing', sort_order: 3, is_required: true },
  { title: 'Pending approvals you own', category: 'pending_work', owner_role: 'outgoing', sort_order: 4, is_required: false },
  { title: 'Key internal contacts', category: 'clients_contacts', owner_role: 'outgoing', sort_order: 5, is_required: true },
  { title: 'Key external contacts (clients/vendors)', category: 'clients_contacts', owner_role: 'outgoing', sort_order: 6, is_required: false },
  { title: 'Important file & folder locations', category: 'documents', owner_role: 'outgoing', sort_order: 7, is_required: true },
  { title: 'Handover document upload', category: 'documents', owner_role: 'outgoing', sort_order: 8, is_required: true },
  { title: 'Systems & tools used', category: 'systems_access', owner_role: 'outgoing', sort_order: 9, is_required: true },
  { title: 'Training / shadowing given to successor', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 10, is_required: true },
  { title: 'Common issues & how to solve them', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 11, is_required: false },
  { title: 'Outstanding expenses or company assets in your care', category: 'pending_work', owner_role: 'outgoing', sort_order: 12, is_required: false },
];

export const LONG_LEAVE_COVERAGE_ITEMS = [
  { title: 'Role summary while on leave', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 1, is_required: true },
  { title: 'Active projects / deadlines during leave', category: 'pending_work', owner_role: 'outgoing', sort_order: 2, is_required: true },
  { title: 'Key contacts to handle', category: 'clients_contacts', owner_role: 'outgoing', sort_order: 3, is_required: true },
  { title: 'Systems / access acting person needs', category: 'systems_access', owner_role: 'outgoing', sort_order: 4, is_required: true },
  { title: 'Daily routines / SOP links', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 5, is_required: true },
  { title: 'Pending approvals to watch', category: 'pending_work', owner_role: 'outgoing', sort_order: 6, is_required: false },
  { title: 'Shadowing / walkthrough completed', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 7, is_required: true },
  { title: 'Notes for acting employee', category: 'other', owner_role: 'outgoing', sort_order: 8, is_required: true },
];

export const LONG_LEAVE_RETURN_ITEMS = [
  { title: 'What changed during coverage period', category: 'knowledge_transfer', owner_role: 'outgoing', sort_order: 1, is_required: true },
  { title: 'New issues or open items', category: 'pending_work', owner_role: 'outgoing', sort_order: 2, is_required: true },
  { title: 'Files / updates to review', category: 'documents', owner_role: 'outgoing', sort_order: 3, is_required: true },
  { title: 'Access to revoke from acting employee', category: 'systems_access', owner_role: 'outgoing', sort_order: 4, is_required: true },
  { title: 'Handover meeting date', category: 'other', owner_role: 'outgoing', sort_order: 5, is_required: true },
];

export function getHandoverKind(handover) {
  if (!handover) return 'unknown';
  if (handover.trigger_type === 'exit') return 'exit';
  if (handover.parent_handover_id) return 'return';
  if (handover.trigger_type === 'temporary_coverage') return 'coverage';
  return handover.trigger_type || 'unknown';
}

export function getHandoverLabel(handover) {
  const kind = getHandoverKind(handover);
  if (kind === 'exit') return 'Exit handover';
  if (kind === 'coverage') return 'Coverage handover (long leave)';
  if (kind === 'return') return 'Return handover';
  return 'Handover';
}

function computeHandoverDeadline(effectiveDate) {
  if (!effectiveDate) return null;
  const d = new Date(effectiveDate);
  d.setDate(d.getDate() - 3);
  const today = new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10) < today ? today : d.toISOString().slice(0, 10);
}

export async function seedHandoverItems(handoverId, items = DEFAULT_HANDOVER_ITEMS) {
  const insertPromises = items.map(item => {
    return handoverRepository.createHandoverItem({
      handover_id: handoverId,
      title: item.title,
      category: item.category,
      owner_role: item.owner_role,
      sort_order: item.sort_order,
      is_required: item.is_required,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  });
  await Promise.all(insertPromises);
}

export async function recalcHandoverCompletion(handoverId) {
  const items = await handoverRepository.getItemsByHandoverId(handoverId);
  if (!items.length) return { pct: 0, allRequiredDone: false };

  const required = items.filter(i => i.is_required !== false);
  const requiredDone = required.filter(i => i.status === 'done' || i.status === 'not_applicable');
  const pct = required.length
    ? Math.round((requiredDone.length / required.length) * 100)
    : 100;

  await handoverRepository.updateHandover(handoverId, {
    completion_pct: pct,
    updated_at: new Date().toISOString(),
  });

  return { pct, allRequiredDone: requiredDone.length === required.length, items };
}

export async function enrichHandover(handover) {
  if (!handover) return null;

  // Cross-domain dependency: Employees
  const employees = await dbFetch('Employees', 'id,Full_name,employee_id,Manager_id');
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  handover.outgoing_name = empMap[handover.outgoing_employee_id]?.Full_name || '—';
  handover.outgoing_code = empMap[handover.outgoing_employee_id]?.employee_id || '—';
  handover.successor_name = handover.successor_employee_id
    ? (empMap[handover.successor_employee_id]?.Full_name || '—')
    : null;
  handover.successor_code = handover.successor_employee_id
    ? (empMap[handover.successor_employee_id]?.employee_id || '—')
    : null;
  handover.handover_kind = getHandoverKind(handover);
  handover.handover_label = getHandoverLabel(handover);

  // Cross-domain dependency: Leave_Request
  if (handover.leave_request_id) {
    const leave = await dbFetchOne('Leave_Request', 'start_date,end_date,status', { id: handover.leave_request_id });
    if (leave) {
      handover.leave_start = leave.start_date;
      handover.leave_end = leave.end_date;
      handover.leave_status = leave.status;
    }
  } else {
    const leave = await dbFetchOne('Leave_Request', 'start_date,end_date,status', { coverage_handover_id: handover.id });
    const returnLeave = leave ? null : await dbFetchOne('Leave_Request', 'start_date,end_date,status', { return_handover_id: handover.id });
    const linked = leave || returnLeave;
    if (linked) {
      handover.leave_start = linked.start_date;
      handover.leave_end = linked.end_date;
      handover.leave_status = linked.status;
      if (!handover.leave_request_id) handover.leave_request_id = linked.id;
    }
  }

  return handover;
}

export async function enrichHandoversBulk(handovers) {
  if (!handovers || handovers.length === 0) return handovers;

  const employees = await dbFetch('Employees', 'id,Full_name,employee_id,Manager_id');
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  const leaveIds = new Set();
  const handoverIds = new Set();

  handovers.forEach(h => {
    if (h.leave_request_id) leaveIds.add(h.leave_request_id);
    handoverIds.add(h.id);
  });

  const { supabase } = await import('../../../lib/supabase.js');
  let allLeaves = [];
  if (leaveIds.size > 0 || handoverIds.size > 0) {
    const { data } = await supabase.from('Leave_Request').select('id,start_date,end_date,status,coverage_handover_id,return_handover_id');
    allLeaves = data || [];
  }

  handovers.forEach(handover => {
    handover.outgoing_name = empMap[handover.outgoing_employee_id]?.Full_name || '—';
    handover.outgoing_code = empMap[handover.outgoing_employee_id]?.employee_id || '—';
    handover.successor_name = handover.successor_employee_id
      ? (empMap[handover.successor_employee_id]?.Full_name || '—')
      : null;
    handover.successor_code = handover.successor_employee_id
      ? (empMap[handover.successor_employee_id]?.employee_id || '—')
      : null;
    handover.handover_kind = getHandoverKind(handover);
    handover.handover_label = getHandoverLabel(handover);

    if (handover.leave_request_id) {
      const leave = allLeaves.find(l => l.id === handover.leave_request_id);
      if (leave) {
        handover.leave_start = leave.start_date;
        handover.leave_end = leave.end_date;
        handover.leave_status = leave.status;
      }
    } else {
      const leave = allLeaves.find(l => l.coverage_handover_id === handover.id);
      const returnLeave = leave ? null : allLeaves.find(l => l.return_handover_id === handover.id);
      const linked = leave || returnLeave;
      if (linked) {
        handover.leave_start = linked.start_date;
        handover.leave_end = linked.end_date;
        handover.leave_status = linked.status;
        if (!handover.leave_request_id) handover.leave_request_id = linked.id;
      }
    }
  });

  return handovers;
}

export function isActiveHandover(h) {
  return h && !TERMINAL_HANDOVER_STATUSES.includes(h.status);
}

export function isTerminalHandoverStatus(status) {
  return TERMINAL_HANDOVER_STATUSES.includes(status);
}

export function canReplaceCoverageHandover(existing) {
  return existing && ['waived', 'cancelled'].includes(existing.status);
}

export function canStartCoverageHandover(leave, coverageHandover) {
  if (leave.status !== 'Approved') return false;
  if (!leave.coverage_handover_id || !coverageHandover) return true;
  return canReplaceCoverageHandover(coverageHandover);
}

export async function getLinkedLeaveHandovers(leave) {
  const linked = [];
  if (leave.coverage_handover_id) {
    const h = await handoverRepository.getHandoverById(leave.coverage_handover_id);
    if (h) linked.push({ ...h, handover_kind: getHandoverKind(h) });
  }
  if (leave.return_handover_id) {
    const h = await handoverRepository.getHandoverById(leave.return_handover_id);
    if (h) linked.push({ ...h, handover_kind: getHandoverKind(h) });
  }
  return linked;
}

export async function getActiveLinkedLeaveHandovers(leave) {
  const linked = await getLinkedLeaveHandovers(leave);
  return linked.filter(h => isActiveHandover(h));
}

export function isLeaveLinkedHandover(handover) {
  return !!(handover?.leave_request_id || (handover?.trigger_type === 'temporary_coverage' && !handover?.offboarding_id));
}

export async function notifyLeaveHandoverWaived(handover, reason) {
  if (!isLeaveLinkedHandover(handover)) return;
  const label = getHandoverKind(handover) === 'return' ? 'Return handover' : 'Leave coverage handover';
  const msg = `${label} was waived by HR: ${reason}`;
  await notifyUser(handover.outgoing_employee_id, 'Handover waived', msg, '/portal');
  if (handover.successor_employee_id) {
    await notifyUser(handover.successor_employee_id, 'Handover waived', msg, '/portal');
  }
}

export async function detachTerminalHandoversFromLeave(leave) {
  const linked = await getLinkedLeaveHandovers(leave);
  for (const h of linked) {
    if (isTerminalHandoverStatus(h.status) && h.leave_request_id === leave.id) {
      await handoverRepository.updateHandover(h.id, {
        leave_request_id: null,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function getActiveHandoversForOutgoing(employeeId) {
  const all = await handoverRepository.getHandoversByOutgoingEmployee(employeeId);
  return all.filter(isActiveHandover);
}

export async function getActiveHandoversForIncoming(employeeId) {
  const all = await handoverRepository.getHandoversBySuccessorEmployee(employeeId);
  return all.filter(isActiveHandover);
}

function sortHandoversNewestFirst(a, b) {
  const dateA = a.approved_at || a.waived_at || a.updated_at || a.created_at || '';
  const dateB = b.approved_at || b.waived_at || b.updated_at || b.created_at || '';
  return String(dateB).localeCompare(String(dateA));
}

export async function getTerminalHandoversForOutgoing(employeeId) {
  const all = await handoverRepository.getHandoversByOutgoingEmployee(employeeId);
  return all.filter(h => isTerminalHandoverStatus(h.status)).sort(sortHandoversNewestFirst);
}

export async function getTerminalHandoversForIncoming(employeeId) {
  const all = await handoverRepository.getHandoversBySuccessorEmployee(employeeId);
  return all.filter(h => isTerminalHandoverStatus(h.status)).sort(sortHandoversNewestFirst);
}

export function summarizeHandoverForList(handover, itemCount = null) {
  return {
    id: handover.id,
    handover_kind: handover.handover_kind || getHandoverKind(handover),
    handover_label: handover.handover_label || getHandoverLabel(handover),
    status: handover.status,
    trigger_type: handover.trigger_type,
    outgoing_employee_id: handover.outgoing_employee_id,
    successor_employee_id: handover.successor_employee_id,
    outgoing_name: handover.outgoing_name,
    outgoing_code: handover.outgoing_code,
    successor_name: handover.successor_name,
    successor_code: handover.successor_code,
    effective_date: handover.effective_date,
    leave_start: handover.leave_start,
    leave_end: handover.leave_end,
    completion_pct: handover.completion_pct ?? 0,
    approved_at: handover.approved_at,
    waived_at: handover.waived_at,
    waived_reason: handover.waived_reason,
    created_at: handover.created_at,
    item_count: itemCount,
  };
}

export async function getHandoversForEmployee(employeeId) {
  const [outgoingAll, incomingAll] = await Promise.all([
    handoverRepository.getHandoversByOutgoingEmployee(employeeId),
    handoverRepository.getHandoversBySuccessorEmployee(employeeId),
  ]);
  const sortFn = (a, b) => sortHandoversNewestFirst(a, b);
  outgoingAll.sort(sortFn);
  incomingAll.sort(sortFn);
  for (const h of [...outgoingAll, ...incomingAll]) await enrichHandover(h);

  const outgoingSummaries = outgoingAll.map(h => summarizeHandoverForList(h));
  const incomingSummaries = incomingAll.map(h => summarizeHandoverForList(h));

  return {
    outgoing: outgoingSummaries,
    incoming: incomingSummaries,
    counts: {
      outgoing_active: outgoingAll.filter(isActiveHandover).length,
      outgoing_completed: outgoingAll.filter(h => h.status === 'completed').length,
      incoming_active: incomingAll.filter(isActiveHandover).length,
      incoming_completed: incomingAll.filter(h => h.status === 'completed').length,
    },
  };
}

export function filterHandoversList(handovers, { status, trigger_type, employee_id } = {}) {
  let result = handovers;
  if (status === 'active') {
    result = result.filter(isActiveHandover);
  } else if (status && status !== 'all') {
    result = result.filter(h => h.status === status);
  }
  if (trigger_type) {
    result = result.filter(h => h.trigger_type === trigger_type);
  }
  if (employee_id) {
    result = result.filter(
      h => h.outgoing_employee_id === employee_id || h.successor_employee_id === employee_id
    );
  }
  return result;
}

export async function getSuccessorAckSummary(handoverId) {
  const items = await handoverRepository.getItemsByHandoverId(handoverId);
  const needsAck = items.filter(i => i.status === 'done' || i.status === 'not_applicable');
  const acked = needsAck.filter(i => i.successor_acknowledged);
  return {
    total: needsAck.length,
    acked: acked.length,
    allAcked: needsAck.length > 0 && acked.length === needsAck.length,
    pending: needsAck.filter(i => !i.successor_acknowledged),
  };
}

export function handoverRequiresSuccessorAck(handover) {
  return !!(handover?.successor_employee_id);
}

export async function validateHandoverApproval(handover) {
  if (!handover) return { ok: false, error: 'Handover not found' };
  if (handover.status !== 'pending_review') {
    return {
      ok: false,
      error: 'Handover must be submitted for review before HR approval. The outgoing employee completes the checklist and submits from Portal → My Handovers.',
    };
  }
  if (handoverRequiresSuccessorAck(handover)) {
    const ack = await getSuccessorAckSummary(handover.id);
    if (ack.total === 0) {
      return {
        ok: false,
        error: 'No completed items to acknowledge yet. Outgoing employee must fill and submit the checklist first.',
        successor_ack: ack,
      };
    }
    if (!ack.allAcked) {
      return {
        ok: false,
        error: `Successor must acknowledge all handover items first (${ack.acked}/${ack.total} acknowledged). They can do this from Portal → Incoming Handover.`,
        successor_ack: ack,
      };
    }
  }
  return { ok: true };
}

export async function syncKnowledgeTransferFromHandover(handoverId) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover || !handover.offboarding_id) return;

  if (handover.status === 'completed' || handover.status === 'waived') {
    // Cross-domain logic for offboarding via Module capability
    const { lifecycleModule } = await import('../../lifecycle/index.js');
    await lifecycleModule.markKnowledgeTransferComplete(handover.offboarding_id);
  }
}

export async function createHandoverForOffboarding(offboarding, createdByUserId) {
  const effectiveDate = offboarding.last_working_date || offboarding.last_working_day || null;

  const handover = await handoverRepository.createHandover({
    outgoing_employee_id: offboarding.employee_id,
    trigger_type: 'exit',
    offboarding_id: offboarding.id,
    effective_date: effectiveDate,
    handover_deadline: computeHandoverDeadline(effectiveDate),
    status: 'pending_successor',
    successor_type: 'existing',
    created_by_user_id: createdByUserId || null,
    created_at: new Date().toISOString(),
  });

  if (!handover) return null;

  await seedHandoverItems(handover.id, DEFAULT_HANDOVER_ITEMS);

  // Cross-domain logic via Module capability
  const { lifecycleModule } = await import('../../lifecycle/index.js');
  await lifecycleModule.linkHandover(offboarding.id, handover.id);

  return handover;
}

export async function getOffboardingWarningForEmployee(employeeId) {
  if (!employeeId) return null;
  const { lifecycleModule } = await import('../../lifecycle/index.js');
  return await lifecycleModule.getActiveOffboardingWarning(employeeId);
}

export async function createHandoverForLongLeave(leave, { successorEmployeeId, createdByUserId }) {
  if (!successorEmployeeId) return { error: 'Acting successor is required' };
  if (leave.status !== 'Approved') return { error: 'Leave must be approved before starting coverage handover' };
  if (leave.coverage_handover_id) {
    const existing = await handoverRepository.getHandoverById(leave.coverage_handover_id);
    if (existing) {
      if (existing.status === 'completed') {
        return { error: 'Coverage handover is already completed for this leave' };
      }
      if (isActiveHandover(existing)) {
        return { error: 'An active coverage handover already exists for this leave' };
      }
      if (!canReplaceCoverageHandover(existing)) {
        return { error: 'Coverage handover already exists for this leave' };
      }
    }
  }

  const startDate = (leave.start_date || '').slice(0, 10);
  const endDate = (leave.end_date || '').slice(0, 10);

  const handover = await handoverRepository.createHandover({
    outgoing_employee_id: leave.employee_id,
    successor_employee_id: successorEmployeeId,
    successor_type: 'temporary',
    trigger_type: 'temporary_coverage',
    leave_request_id: leave.id,
    effective_date: startDate || null,
    expected_return_date: endDate || null,
    handover_deadline: computeHandoverDeadline(startDate),
    status: 'in_progress',
    created_by_user_id: createdByUserId || null,
    created_at: new Date().toISOString(),
  });

  if (!handover) return { error: 'Failed to create coverage handover' };

  await seedHandoverItems(handover.id, LONG_LEAVE_COVERAGE_ITEMS);

  // Cross-domain logic via Module capability
  const { leaveModule } = await import('../../hrm/index.js');
  await leaveModule.linkCoverageHandover(leave.id, handover.id);

  const acting = await dbFetchOne('Employees', 'Full_name', { id: successorEmployeeId });
  const actingName = acting?.Full_name || 'colleague';
  await notifyUser(
    leave.employee_id,
    'Coverage handover started',
    `Please complete your handover checklist before your leave. Acting cover: ${actingName}.`,
    '/portal/handover/outgoing'
  );
  await notifyUser(
    successorEmployeeId,
    'Acting coverage assigned',
    'You have been assigned to cover during a colleague\'s leave. Review the handover when ready.',
    '/portal/handover/incoming'
  );

  const warning = await getOffboardingWarningForEmployee(leave.employee_id);
  return { handover, warning };
}

export async function createReturnHandover(parentHandover, createdByUserId) {
  if (!parentHandover || getHandoverKind(parentHandover) !== 'coverage') {
    return { error: 'Parent must be a completed coverage handover' };
  }
  if (parentHandover.status !== 'completed') {
    return { error: 'Coverage handover must be completed before starting return handover' };
  }
  if (!parentHandover.successor_employee_id) {
    return { error: 'Coverage handover has no acting employee' };
  }

  const leave = parentHandover.leave_request_id
    ? await dbFetchOne('Leave_Request', '*', { id: parentHandover.leave_request_id })
    : null;

  if (leave?.return_handover_id) {
    return { error: 'Return handover already exists for this leave' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const endDate = (leave?.end_date || parentHandover.expected_return_date || '').slice(0, 10);
  if (endDate && endDate > today) {
    return { error: 'Return handover can only start after leave end date' };
  }

  const handover = await handoverRepository.createHandover({
    outgoing_employee_id: parentHandover.successor_employee_id,
    successor_employee_id: parentHandover.outgoing_employee_id,
    successor_type: 'temporary',
    trigger_type: 'temporary_coverage',
    leave_request_id: parentHandover.leave_request_id || null,
    parent_handover_id: parentHandover.id,
    effective_date: today,
    expected_return_date: null,
    handover_deadline: today,
    status: 'in_progress',
    created_by_user_id: createdByUserId || null,
    created_at: new Date().toISOString(),
  });

  if (!handover) return { error: 'Failed to create return handover' };

  await seedHandoverItems(handover.id, LONG_LEAVE_RETURN_ITEMS);

  if (leave) {
    const { leaveModule } = await import('../../hrm/index.js');
    await leaveModule.linkReturnHandover(leave.id, handover.id);
  }

  await notifyUser(
    parentHandover.successor_employee_id,
    'Return handover started',
    'Please document what changed during your acting coverage period.',
    '/portal/handover/outgoing'
  );
  await notifyUser(
    parentHandover.outgoing_employee_id,
    'Welcome back — review return handover',
    'Your acting colleague has prepared a return handover. Please review and acknowledge.',
    '/portal/handover/incoming'
  );

  return { handover };
}

export async function enrichLeaveWithHandoverFlags(leave, handoverMap = {}) {
  const coverage = leave.coverage_handover_id ? handoverMap[leave.coverage_handover_id] : null;
  const ret = leave.return_handover_id ? handoverMap[leave.return_handover_id] : null;

  leave.coverage_handover_status = coverage?.status || null;
  leave.return_handover_status = ret?.status || null;
  leave.coverage_handover_pct = coverage?.completion_pct ?? null;
  leave.return_handover_pct = ret?.completion_pct ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const endDate = (leave.end_date || '').slice(0, 10);

  leave.can_start_coverage = canStartCoverageHandover(leave, coverage);

  leave.can_start_return =
    coverage?.status === 'completed' &&
    !leave.return_handover_id &&
    (!endDate || endDate <= today);

  leave.has_coverage_handover = !!leave.coverage_handover_id;
  leave.has_return_handover = !!leave.return_handover_id;
  leave.can_view_coverage_history = !!leave.coverage_handover_id;
  leave.can_view_return_history = !!leave.return_handover_id;
  leave.coverage_handover_is_terminal = coverage ? isTerminalHandoverStatus(coverage.status) : false;
  leave.return_handover_is_terminal = ret ? isTerminalHandoverStatus(ret.status) : false;

  const activeLinked = [];
  if (coverage && isActiveHandover(coverage)) {
    activeLinked.push({ ...coverage, kind: 'coverage' });
  }
  if (ret && isActiveHandover(ret)) {
    activeLinked.push({ ...ret, kind: 'return' });
  }
  leave.has_active_leave_handover = activeLinked.length > 0;
  leave.can_delete_leave = activeLinked.length === 0;
  if (!leave.can_delete_leave) {
    const first = activeLinked[0];
    leave.delete_blocked_reason =
      `Cannot delete while ${first.kind} handover is active (${first.status?.replace(/_/g, ' ')}). Waive or complete the handover first.`;
  } else {
    leave.delete_blocked_reason = null;
  }

  return leave;
}

export async function isHandoverBlockingSettlement(offboarding) {
  if (offboarding?.handover_required === false) return false;
  if (!offboarding?.handover_id) return false;

  const handover = await handoverRepository.getHandoverById(offboarding.handover_id);
  if (!handover) return true;
  return !['completed', 'waived'].includes(handover.status);
}

export async function notifyUser(employeeId, title, message, linkUrl = '/portal') {
  if (!employeeId) return;
  // Cross-domain logic for sys_users
  const user = await dbFetchOne('sys_users', 'id', { employee_id: employeeId });
  if (!user) return;
  await dbInsert('system_notifications', {
    recipient_user_id: user.id,
    title,
    message,
    link_url: linkUrl,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function auditLog(req, action, details) {
  // Cross-domain logic for sys_audit_logs
  await dbInsert('sys_audit_logs', {
    user_id: req.user?.id,
    user_name: req.user?.full_name || req.user?.username,
    action,
    module: 'Handover',
    details,
    created_at: new Date().toISOString(),
  }).catch(console.error);
}

const adminRoles = ['boss', 'hr_manager', 'general_manager', 'admin'];

export function isAdmin(user) {
  return !!user?.is_owner || !!user?.access?.modules?.handovers?.includes('edit') || !!user?.access?.modules?.handovers?.includes('approve');
}

export async function getHandoverDetailSecured(req, handoverId) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover) return { error: 'Not found' };

  await enrichHandover(handover);
  const items = await handoverRepository.getItemsByHandoverId(handoverId);
  const attachments = await handoverRepository.getAttachmentsByHandoverId(handoverId);
  const employees = await dbFetch('Employees', 'id,Full_name,employee_id', { status: 'Active' });
  const successor_ack = await getSuccessorAckSummary(handoverId);
  handover.successor_ack = successor_ack;

  const empId = req.user?.employee_id;
  const canView = can(req.user,'handovers','view') || handover.outgoing_employee_id === empId || handover.successor_employee_id === empId;

  if (!canView) return { error: 'Access denied' };
  return { handover, items, attachments, employees, successor_ack };
}

async function loadBulkHandoverDetails(handovers) {
  if (!handovers || handovers.length === 0) return [];
  await enrichHandoversBulk(handovers);
  const hIds = handovers.map(h => h.id);

  const allItems = await handoverRepository.bulkGetItemsByHandoverIds(hIds);
  const allAttachments = await handoverRepository.bulkGetAttachmentsByHandoverIds(hIds);

  return handovers.map(h => ({
    handover: h,
    items: allItems.filter(i => i.handover_id === h.id),
    attachments: allAttachments.filter(a => a.handover_id === h.id)
  }));
}

export async function getHandoversList({ status, trigger_type, employee_id, limit, offset }) {
  let handovers = await handoverRepository.getAllHandovers('created_at', false);
  handovers = filterHandoversList(handovers, { status, trigger_type, employee_id });

  const total = handovers.length;
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const page = handovers.slice(off, off + lim);

  await enrichHandoversBulk(page);
  const hIds = page.map(h => h.id);
  const allItems = await handoverRepository.bulkGetItemsByHandoverIds(hIds);

  const summaries = page.map(h => {
    const itemCount = allItems.filter(item => item.handover_id === h.id).length;
    return summarizeHandoverForList(h, itemCount);
  });

  return { handovers: summaries, total, limit: lim, offset: off };
}

export async function getOutgoingHistory(employeeId) {
  const terminal = await getTerminalHandoversForOutgoing(employeeId);
  return await loadBulkHandoverDetails(terminal);
}

export async function getIncomingHistory(employeeId) {
  const terminal = await getTerminalHandoversForIncoming(employeeId);
  return await loadBulkHandoverDetails(terminal);
}

export async function getEmployeeHandoverHistory(employeeId) {
  const emp = await dbFetchOne('Employees', 'id,Full_name', { id: employeeId });
  if (!emp) return { employee: null };
  const data = await getHandoversForEmployee(employeeId);
  return { employee: emp, ...data };
}

export async function getActiveOutgoing(employeeId) {
  const active = await getActiveHandoversForOutgoing(employeeId);
  const handovers = await loadBulkHandoverDetails(active);
  const first = handovers[0] || null;
  return {
    handovers,
    handover: first?.handover || null,
    items: first?.items || [],
    attachments: first?.attachments || [],
  };
}

export async function getActiveIncoming(employeeId) {
  const active = await getActiveHandoversForIncoming(employeeId);
  return await loadBulkHandoverDetails(active);
}

export async function getHandoverForOffboarding(offboardingId, req) {
  const { lifecycleModule } = await import('../../lifecycle/index.js');
  const ob = await lifecycleModule.getOffboardingById(offboardingId);
  if (!ob) return { error: 'Offboarding not found' };

  let handoverId = ob.handover_id;
  if (!handoverId) {
    const h = await handoverRepository.getHandoversByOffboardingId(ob.id);
    handoverId = h?.id;
  }
  if (!handoverId) {
    return { handover: null, items: [], attachments: [], employees: await dbFetch('Employees', 'id,Full_name,employee_id', { status: 'Active' }) };
  }
  return await getHandoverDetailSecured(req, handoverId);
}

export async function backfillOffboardingHandover(req, offboardingId) {
  const { lifecycleModule } = await import('../../lifecycle/index.js');
  const ob = await lifecycleModule.getOffboardingById(offboardingId);
  if (!ob) return { error: 'Offboarding not found' };
  if (ob.handover_id) {
    return await getHandoverDetailSecured(req, ob.handover_id);
  }

  const handover = await createHandoverForOffboarding(ob, req.user?.id);
  if (!handover) return { error: 'Failed to create handover' };

  await auditLog(req, 'CREATE', `Created handover for offboarding ${ob.id}`);
  return await getHandoverDetailSecured(req, handover.id);
}

export async function getHandoverForLeave(leaveId, req) {
  const leave = await dbFetchOne('Leave_Request', '*', { id: leaveId });
  if (!leave) return { error: 'Leave request not found' };

  const employees = await dbFetch('Employees', 'id,Full_name,employee_id', { status: 'Active' });
  let coverage = null, coverageDetail = null, returnHandover = null, returnDetail = null;

  if (leave.coverage_handover_id) {
    coverageDetail = await getHandoverDetailSecured(req, leave.coverage_handover_id);
    coverage = coverageDetail?.handover || null;
  }
  if (leave.return_handover_id) {
    returnDetail = await getHandoverDetailSecured(req, leave.return_handover_id);
    returnHandover = returnDetail?.handover || null;
  }

  return { leave, coverage, coverageDetail, returnHandover, returnDetail, employees };
}

export async function createLeaveCoverage(req, leaveId, successorEmployeeId) {
  const leave = await dbFetchOne('Leave_Request', '*', { id: leaveId });
  if (!leave) return { error: 'Leave request not found' };

  const result = await createHandoverForLongLeave(leave, { successorEmployeeId, createdByUserId: req.user?.id });
  if (result.error) return { error: result.error };

  await auditLog(req, 'CREATE', `Coverage handover for leave ${leave.id}`);
  const detail = await getHandoverDetailSecured(req, result.handover.id);
  return { warning: result.warning || null, ...detail };
}

export async function createLeaveReturn(req, leaveId) {
  const leave = await dbFetchOne('Leave_Request', '*', { id: leaveId });
  if (!leave) return { error: 'Leave request not found' };
  if (!leave.coverage_handover_id) return { error: 'No coverage handover for this leave' };

  const parent = await handoverRepository.getHandoverById(leave.coverage_handover_id);
  if (!parent) return { error: 'Coverage handover not found' };

  const result = await createReturnHandover(parent, req.user?.id);
  if (result.error) return { error: result.error };

  await auditLog(req, 'CREATE', `Return handover for leave ${leave.id}`);
  return await getHandoverDetailSecured(req, result.handover.id);
}

export async function assignSuccessor(req, handoverId, { successor_employee_id, successor_type }) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover) return { error: 'Not found' };

  const updates = {
    successor_employee_id: successor_employee_id || null,
    successor_type: successor_type || (successor_employee_id ? 'existing' : 'new_hire'),
    status: successor_employee_id ? 'in_progress' : 'pending_successor',
    updated_at: new Date().toISOString(),
  };
  await handoverRepository.updateHandover(handoverId, updates);

  if (successor_employee_id) {
    const enriched = await dbFetchOne('Employees', 'Full_name', { id: handover.outgoing_employee_id });
    const outgoingName = enriched?.Full_name || 'a colleague';
    await notifyUser(
      successor_employee_id,
      'Handover assigned to you',
      `You have been assigned as successor for ${outgoingName}. Please review the handover checklist.`,
      '/portal/handover/incoming'
    );
    await notifyUser(
      handover.outgoing_employee_id,
      'Complete your handover',
      'A successor has been assigned. Please complete your handover checklist.',
      '/portal/handover/outgoing'
    );
  }

  await auditLog(req, 'UPDATE', `Assigned successor on handover ${handoverId}`);
  return await getHandoverDetailSecured(req, handoverId);
}

export async function updateItem(req, handoverId, itemId, payload) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover) return { error: 'Not found' };

  const item = await handoverRepository.getItemById(itemId, handoverId);
  if (!item) return { error: 'Item not found' };

  const empId = req.user?.employee_id;
  const isOutgoing = handover.outgoing_employee_id === empId;
  if (!isOutgoing && !isAdmin(req.user)) {
    return { error: 'Only outgoing employee or admin can edit items' };
  }

  const updates = { updated_at: new Date().toISOString() };
  if (payload.outgoing_notes !== undefined) updates.outgoing_notes = payload.outgoing_notes;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.status !== undefined) {
    updates.status = payload.status;
    updates.completed_at = ['done', 'not_applicable'].includes(payload.status) ? new Date().toISOString() : null;
  }
  if (payload.evidence_url !== undefined) updates.evidence_url = payload.evidence_url;

  await handoverRepository.updateHandoverItem(itemId, updates);

  if (handover.status === 'pending_successor' || handover.status === 'draft') {
    await handoverRepository.updateHandover(handoverId, { status: 'in_progress', updated_at: new Date().toISOString() });
  }

  await recalcHandoverCompletion(handoverId);
  return await getHandoverDetailSecured(req, handoverId);
}

export async function acknowledgeItem(req, handoverId, itemId) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover) return { error: 'Not found' };

  if (handover.successor_employee_id !== req.user?.employee_id) {
    return { error: 'Only successor can acknowledge' };
  }

  const item=await handoverRepository.getItemById(itemId,handoverId);
  if(!item||!['done','not_applicable'].includes(item.status))return {error:'Item not found'};
  await handoverRepository.updateHandoverItem(itemId, {
    successor_acknowledged: true,
    successor_ack_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return await getHandoverDetailSecured(req, handoverId);
}

export async function submitHandover(req, handoverId) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover) return { error: 'Not found' };

  if (handover.outgoing_employee_id !== req.user?.employee_id && !isAdmin(req.user)) {
    return { error: 'Only outgoing employee can submit' };
  }

  const { allRequiredDone, pct } = await recalcHandoverCompletion(handoverId);
  if (!allRequiredDone) {
    return { error: `Complete all required items first (${pct}% done)` };
  }

  await handoverRepository.updateHandover(handoverId, {
    status: 'pending_review',
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (handover.successor_employee_id) {
    await notifyUser(
      handover.successor_employee_id,
      'Handover ready for your acknowledgment',
      'The outgoing employee has submitted their handover. Please review each item and acknowledge receipt before HR approval.',
      '/portal/handover/incoming'
    );
  }

  const reviewLink = handover.leave_request_id ? '/leave' : '/offboarding';
  await dbInsert('system_notifications', {
    recipient_role: 'hr_manager',
    title: 'Handover submitted for review',
    message: `Handover from employee is ready for manager/HR approval.`,
    link_url: reviewLink,
    is_read: false,
    created_at: new Date().toISOString(),
  });

  await auditLog(req, 'UPDATE', `Handover ${handoverId} submitted for review`);
  return await getHandoverDetailSecured(req, handoverId);
}

function requireHandoverVersion(req){if(!Number.isInteger(req.body?.version)||req.body.version<1)throw Object.assign(new Error('Reload the handover and submit its reviewed version.'),{status:400});}
export async function approveHandover(req,handoverId) {
 requireHandoverVersion(req);
 const handover=await handoverRepository.getHandoverById(handoverId);if(!handover)return {error:'Not found'};
 await integrityRpc('hr_decide_handover',{p_actor:req.user.id,p_id:handoverId,p_version:req.body.version,p_decision:'approve',p_reason:''});
 await notifyUser(handover.outgoing_employee_id,'Handover approved','Your handover has been approved.','/portal/handover/outgoing');
 return getHandoverDetailSecured(req,handoverId);
}
export async function waiveHandover(req,handoverId,reason) {
 requireHandoverVersion(req);
 if(typeof reason!=='string'||!reason.trim()||reason.length>4000)return {error:'Waiver reason required'};
 const handover=await handoverRepository.getHandoverById(handoverId);if(!handover)return {error:'Not found'};
 await integrityRpc('hr_decide_handover',{p_actor:req.user.id,p_id:handoverId,p_version:req.body.version,p_decision:'waive',p_reason:reason.trim()});
 await notifyLeaveHandoverWaived(handover,reason.trim());return getHandoverDetailSecured(req,handoverId);
}

export async function uploadFile(req, handoverId, file, itemId) {
  const handover = await handoverRepository.getHandoverById(handoverId);
  if (!handover) return { error: 'Not found' };

  const empId = req.user?.employee_id;
  if (handover.outgoing_employee_id !== empId && !isAdmin(req.user)) {
    return { error: 'Access denied' };
  }

  if(itemId&&!await handoverRepository.getItemById(itemId,handoverId))return {error:'Not found'};
  if(TERMINAL_HANDOVER_STATUSES.includes(handover.status))throw Object.assign(new Error('Completed handover history is read-only.'),{status:409});
  if (!file) return { error: 'No file uploaded' };

  const { supabase } = await import('../../../lib/supabase.js');
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${handoverId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

  const buckets = ['handover_documents'];
  let publicUrl = null;
  for (const bucket of buckets) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });
    if (!error) {
      publicUrl = hrFileUrl(bucket, data.path);
      break;
    }
  }
  if (!publicUrl) return { error: 'Failed to upload file to storage' };

  const attachment = await handoverRepository.createAttachment({
    handover_id: handoverId,
    handover_item_id: itemId || null,
    uploaded_by_user_id: req.user?.id,
    file_name: file.originalname,
    file_url: publicUrl,
    file_type: file.mimetype,
    created_at: new Date().toISOString(),
  });

  if (itemId) {
    await handoverRepository.updateHandoverItem(itemId, {
      evidence_url: publicUrl,
      status: 'done',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await recalcHandoverCompletion(handoverId);
  }

  const detail = await getHandoverDetailSecured(req, handoverId);
  return { attachment, detail };
}
