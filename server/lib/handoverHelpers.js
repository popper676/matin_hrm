import { handoverModule } from '../modules/handover/index.js';

export const TERMINAL_HANDOVER_STATUSES = handoverModule.TERMINAL_HANDOVER_STATUSES;
export const DEFAULT_HANDOVER_ITEMS = handoverModule.DEFAULT_HANDOVER_ITEMS;
export const LONG_LEAVE_COVERAGE_ITEMS = handoverModule.LONG_LEAVE_COVERAGE_ITEMS;
export const LONG_LEAVE_RETURN_ITEMS = handoverModule.LONG_LEAVE_RETURN_ITEMS;

export function getHandoverKind(handover) {
  return handoverModule.getHandoverKind(handover);
}

export function getHandoverLabel(handover) {
  return handoverModule.getHandoverLabel(handover);
}

export async function seedHandoverItems(handoverId, items) {
  return handoverModule.seedHandoverItems(handoverId, items);
}

export async function recalcHandoverCompletion(handoverId) {
  return handoverModule.recalcHandoverCompletion(handoverId);
}

export async function enrichHandover(handover) {
  return handoverModule.enrichHandover(handover);
}

export async function enrichHandoversBulk(handovers) {
  return handoverModule.enrichHandoversBulk(handovers);
}

export function isActiveHandover(h) {
  return handoverModule.isActiveHandover(h);
}

export function isTerminalHandoverStatus(status) {
  return handoverModule.isTerminalHandoverStatus(status);
}

export function canReplaceCoverageHandover(existing) {
  return handoverModule.canReplaceCoverageHandover(existing);
}

export function canStartCoverageHandover(leave, coverageHandover) {
  return handoverModule.canStartCoverageHandover(leave, coverageHandover);
}

export async function getLinkedLeaveHandovers(leave) {
  return handoverModule.getLinkedLeaveHandovers(leave);
}

export async function getActiveLinkedLeaveHandovers(leave) {
  return handoverModule.getActiveLinkedLeaveHandovers(leave);
}

export function isLeaveLinkedHandover(handover) {
  return handoverModule.isLeaveLinkedHandover(handover);
}

export async function notifyLeaveHandoverWaived(handover, reason) {
  return handoverModule.notifyLeaveHandoverWaived(handover, reason);
}

export async function detachTerminalHandoversFromLeave(leave) {
  return handoverModule.detachTerminalHandoversFromLeave(leave);
}

export async function getActiveHandoversForOutgoing(employeeId) {
  return handoverModule.getActiveHandoversForOutgoing(employeeId);
}

export async function getActiveHandoversForIncoming(employeeId) {
  return handoverModule.getActiveHandoversForIncoming(employeeId);
}

export async function getTerminalHandoversForOutgoing(employeeId) {
  return handoverModule.getTerminalHandoversForOutgoing(employeeId);
}

export async function getTerminalHandoversForIncoming(employeeId) {
  return handoverModule.getTerminalHandoversForIncoming(employeeId);
}

export function summarizeHandoverForList(handover, itemCount) {
  return handoverModule.summarizeHandoverForList(handover, itemCount);
}

export async function getHandoversForEmployee(employeeId) {
  return handoverModule.getHandoversForEmployee(employeeId);
}

export function filterHandoversList(handovers, opts) {
  return handoverModule.filterHandoversList(handovers, opts);
}

export async function getSuccessorAckSummary(handoverId) {
  return handoverModule.getSuccessorAckSummary(handoverId);
}

export function handoverRequiresSuccessorAck(handover) {
  return handoverModule.handoverRequiresSuccessorAck(handover);
}

export async function validateHandoverApproval(handover) {
  return handoverModule.validateHandoverApproval(handover);
}

export async function syncKnowledgeTransferFromHandover(handoverId) {
  return handoverModule.syncKnowledgeTransferFromHandover(handoverId);
}

export async function createHandoverForOffboarding(offboarding, createdByUserId) {
  return handoverModule.createHandoverForOffboarding(offboarding, createdByUserId);
}

export async function getOffboardingWarningForEmployee(employeeId) {
  return handoverModule.getOffboardingWarningForEmployee(employeeId);
}

export async function createHandoverForLongLeave(leave, opts) {
  return handoverModule.createHandoverForLongLeave(leave, opts);
}

export async function createReturnHandover(parentHandover, createdByUserId) {
  return handoverModule.createReturnHandover(parentHandover, createdByUserId);
}

export async function enrichLeaveWithHandoverFlags(leave, handoverMap) {
  return handoverModule.enrichLeaveWithHandoverFlags(leave, handoverMap);
}

export async function isHandoverBlockingSettlement(offboarding) {
  return handoverModule.isHandoverBlockingSettlement(offboarding);
}

export async function notifyUser(employeeId, title, message, linkUrl) {
  return handoverModule.notifyUser(employeeId, title, message, linkUrl);
}

export async function auditLog(req, action, details) {
  return handoverModule.auditLog(req, action, details);
}
