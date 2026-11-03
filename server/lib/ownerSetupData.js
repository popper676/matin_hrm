import {systemDb} from '../shared/db/index.js';
import {allRows,checked} from './operationsData.js';
import {brandRecord} from './branding.js';
import {DEFAULT_PAYROLL_POLICY} from '../modules/hrm/service/payrollPolicyService.js';
export async function loadOwnerSetup() {
 const out={payrollDefaults:DEFAULT_PAYROLL_POLICY};
 const definitions={
  employees:['Employees','id,employee_id,Full_name,status,employment_status,deleted_at,salary'],
  users:['sys_users','id,username,full_name,employee_id,is_active,is_owner'],
  policies:['hr_access_policies','user_id,policy,version','user_id'],
  businesses:['hr_business_units','*','key'],
  reviews:['hr_owner_setup_reviews','*','step'],workflows:['hr_workflow_settings','*','workflow_key'],
  calendarDates:['hr_leave_calendar_dates','*','work_date'],leaveTypes:['Leave_type','id,type_name,is_paid,kind'],
  balances:['Leave_balances','id,employee_id,leave_type_id,year,entitled_days,version'],
 };
 await Promise.all([
  ...Object.entries(definitions).map(async([key,args])=>{out[key]=await allRows(...args);}),
  brandRecord({required:true}).then(r=>{out.branding=r;}),
  systemDb.from('hr_leave_calendar').select('*').eq('id',true).single().then(r=>{out.calendar=checked(r);}),
  systemDb.from('company_payroll_policy').select('*').eq('company_id','lm').maybeSingle().then(r=>{out.payrollPolicy=checked(r);}),
  systemDb.from('hr_expense_routing').select('*').eq('id',true).single().then(r=>{out.expenseRouting=checked(r);}),
  systemDb.from('kpi_settings').select('settings').eq('id',1).maybeSingle().then(r=>{out.kpiSettings=checked(r)?.settings||null;}),
 ]);
 return out;
}
