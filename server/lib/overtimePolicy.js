import {can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
import {bkkDayBounds} from './dateUtils.js';
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
const inScope=(user,id)=>{const ids=employeeScope(user);return ids===null||ids.includes(id);};
export function overtimeInput(user,body,personal) {
 const employee_id=personal?user.employee_id:body.employee_id;
 if(!employee_id)fail('An employee profile is required',400);
 if(personal){
  if(!personalCan(user,'attendance')||body.employee_id&&body.employee_id!==employee_id)fail('Submit overtime only for your own employee profile.');
 }else{
  if(!can(user,'attendance','edit')||!inScope(user,employee_id))fail('Attendance Edit and employee scope are required.');
  if(employee_id===user.employee_id)fail('Submit your own overtime in the employee portal for an independent reviewer.');
 }
 bkkDayBounds(body.ot_date);
 const time=/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/;
 if(typeof body.start_time!=='string'||typeof body.end_time!=='string'||!time.test(body.start_time)||!time.test(body.end_time)||body.start_time.slice(0,5)===body.end_time.slice(0,5))fail('Use valid, different start and end times.',400);
 return {employee_id,ot_date:body.ot_date,start_time:body.start_time.slice(0,5),end_time:body.end_time.slice(0,5),reason:String(body.reason||'').trim().slice(0,2000),requested_by:personal?'employee':'hr_boss'};
}
export function overtimeDecision(user,row,status) {
 if(!row)fail('Overtime request not found',404);
 if(!['Approved','Rejected'].includes(status))fail('Choose Approved or Rejected; pending stages cannot be set manually.',400);
 const own=row.employee_id===user.employee_id;
 if(row.requested_by==='hr_boss'){
  if(!own||!personalCan(user,'attendance'))fail('Only the assigned employee can accept or decline this overtime.');
  if(!['Pending_Employee_Acceptance',status].includes(row.status))fail('This overtime is no longer awaiting acceptance.',409);
 }else{
  if(own)fail('Your own overtime needs an independent approver.');
  if(!can(user,'attendance','approve')||!inScope(user,row.employee_id))fail('Attendance Approve and employee scope are required.');
  if(!['Pending_Boss_Approval',status].includes(row.status))fail('This overtime is no longer awaiting approval.',409);
 }
 return row.status!==status;
}
