import {systemDb} from '../shared/db/index.js';
export const checked=r=>{if(r.error)throw r.error;return r.data;};
const specs={
 departments:['Departments','id,Department_name'],positions:['positions','id,title'],
 employees:['Employees','id,employee_id,Full_name,Dept_id,position_id,Manager_id,hire_date,probation_period,status,employment_status,deleted_at,phone,email,salary,created_at'],
 approvals:['hr_approval_requests','*'],information:['hr_employee_information','id,employee_id,status,version,created_at,updated_at,approval_id'],profiles:['hr_employee_profiles','employee_id,data,version,approved_at'],
 attendance:['attendance_records','id,employee_id,check_in,check_out,is_late,attendance_method'],
 leaves:['Leave_Request','id,employee_id,status,start_date,end_date,reason,form_version,calendar_snapshot,form_snapshot,created_at'],payrolls:['payrolls','*'],expenses:['rewards_and_claims','*'],
 probations:['hr_probation_forms','id,employee_id,creator_id,status,employee_snapshot,anchor,self_invited_at,self_due_date,self_response,final_decision,appeal_due,appeal,acknowledged_at,created_at,submitted_at,decision_at,version'],
 warnings:['hr_warning_forms','id,employee_id,creator_id,status,employee_snapshot,data,issuance,issued_at,employee_comment,acknowledgment,external_receipts,hr_records,letter_number,created_at,version'],
 handovers:['employee_handovers','*'],onboarding:['employee_onboarding','*'],offboarding:['corporate_offboarding','*'],sops:['daily_sops','*'],career:['employee_career_timeline','*'],
 businesses:['hr_business_units','*'],assignments:['hr_employee_business_sets','*'],receipts:['hr_expense_receipts','*'],
};
export async function allRows(table,columns='*',keyOverride=null){
 const out=[],key=keyOverride||(table==='hr_business_units'?'key':table==='hr_employee_profiles'?'employee_id':'id');
 for(let from=0;from<100000;from+=1000){const page=checked(await systemDb.from(table).select(columns).order(key).range(from,from+999));out.push(...page);if(page.length<1000)return out;}
 throw new Error('The report exceeds 100,000 rows. Archive or narrow its source before continuing.');
}
export async function operationsSettings(){const r=checked(await systemDb.from('hr_operations_settings').select('*').eq('id',true).single());return r;}
export async function loadOperationsData(purpose='today'){
 const keys=purpose==='monthly'?['employees','payrolls','expenses','approvals','businesses','assignments','receipts']:purpose==='employee'?Object.keys(specs):['employees','approvals','information','profiles','payrolls','expenses','probations','warnings','businesses','assignments','receipts'];
 const data=Object.fromEntries(Object.keys(specs).map(k=>[k,[]]));
 await Promise.all(keys.map(async key=>{const [table,columns]=specs[key];data[key]=await allRows(table,columns);}));return data;
}
export {scoped,ownSource,rowsFor,hasSalary,payrollAllowed} from './operationsAccess.js';
