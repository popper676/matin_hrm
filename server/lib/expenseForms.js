import { can, personalCan, employeeScope } from "../../shared/accessPolicy.js";
export const EXPENSE_BUCKET = "expense_documents";
export function expenseVisible(user, row, approval) {
  if (user.is_owner) return true;
  if (
    personalCan(user, "rewards") &&
    (row.requester_id === user.id || row.employee_id === user.employee_id)
  )
    return true;
  const scope = employeeScope(user);
  if (
    can(user, "rewards") &&
    (scope === null || scope.includes(row.employee_id))
  )
    return true;
  return !!approval?.stages.some(
    (s) => s.assignee_id === user.id && can(user, "rewards", s.action),
  );
}
