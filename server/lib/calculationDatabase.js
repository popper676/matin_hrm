import {auditContext} from '../middleware/auditContext.js';
import {systemDb} from '../shared/db/index.js';
import {can,employeeScope} from '../../shared/accessPolicy.js';

// Narrow read-only access for a payroll calculation. This never changes the
// request's permissions or grants access to any raw attendance/leave endpoint.
function calculationDb(employeeId,module, salaryRequired) {
  const user=auditContext.getStore()?.user;
  if(!user || !can(user,module) || (salaryRequired&&!user.is_owner&&!user.access?.sensitive?.salary))
    throw Object.assign(new Error('Calculation access is required.'),{status:403});
  const ids=employeeScope(user);
  if(ids!==null&&!ids.includes(employeeId))
    throw Object.assign(new Error('Employee is outside your calculation scope.'),{status:403});
  const scoped={Employees:'id',attendance_records:'employee_id',Leave_Request:'employee_id',daily_sops:'employee_id',peer_voting_records:'nominee_id',kpis:'employee_id'};
  const globalTables=new Set(['Leave_type','kpi_settings','company_payroll_policy']);
  return {from(table) {
    if(!Object.hasOwn(scoped,table)&&!globalTables.has(table))throw new Error('Unsupported calculation source');
    return {select(columns) {
      const q=systemDb.from(table).select(columns);
      return scoped[table]?q.eq(scoped[table],employeeId):q;
    }};
  }};
}

export const payrollCalculationDb=id=>calculationDb(id,'payroll',true);
export const performanceCalculationDb=id=>calculationDb(id,'performance',false);
