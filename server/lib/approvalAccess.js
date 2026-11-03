import {WORKFLOWS,can,personalCan} from '../../shared/accessPolicy.js';
import {canReviewInformation} from '../../shared/employeeInformation.js';
import {probationScoped} from './probationForms.js';
import {warningScoped} from './warningForms.js';
export function approvalCanAct(user,a){
 const def=WORKFLOWS[a.workflow_key],stage=a.stages?.[a.current_stage];if(!def||!stage)return false;
 return a.status==='pending'&&stage.assignee_id===user.id&&can(user,def.module,stage.action)&&(a.workflow_key!=='employee_information'||canReviewInformation(user))&&(!user.employee_id||a.employee_id!==user.employee_id)&&(['probation','warning'].includes(a.workflow_key)||a.requester_id!==user.id);
}
export function approvalVisible(user,a){
 if(user.is_owner)return true;const def=WORKFLOWS[a.workflow_key];if(!def)return false;
 const personal={expense:'rewards',leave:'leave',probation:'probation',warning:'warnings',employee_information:'profile'}[a.workflow_key]||'documents';
 return (a.requester_id===user.id&&personalCan(user,'approvals')&&personalCan(user,personal)&&(a.workflow_key!=='probation'||probationScoped(user,a.employee_id))&&(a.workflow_key!=='warning'||warningScoped(user,a.employee_id)))||a.stages.some(s=>s.assignee_id===user.id&&can(user,def.module,s.action)&&(a.workflow_key!=='employee_information'||canReviewInformation(user)));
}
