import {validDate} from '../../shared/probationForm.js';
import {can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
export function probationScoped(user,employee,action='view'){
 const scope=employeeScope(user);return can(user,'probation',action)&&(scope===null||scope.includes(employee));
}
export function probationView(user,row,approval){
 const own=user.employee_id===row.employee_id;
 if(own){if(!personalCan(user,'probation')||!row.self_invited_at)return null;
  if(row.status!=='decided')return {id:row.id,employee_id:row.employee_id,status:row.status,version:row.version,employee_snapshot:row.employee_snapshot,anchor:row.anchor,self_invited_at:row.self_invited_at,self_due_date:row.self_due_date,self_response:row.self_response,self_responded_at:row.self_responded_at,personal:true};
 }else if(!user.is_owner&&!probationScoped(user,row.employee_id)&&!approval?.stages.some(s=>s.assignee_id===user.id&&can(user,'probation','approve')))return null;
 const copy={...row,personal:own};
 const hr=approval?.stages.find(s=>s.key==='hr')?.assignee_id===user.id&&can(user,'probation','approve');
 if(own||(!user.is_owner&&!hr))delete copy.legal_review;
 if(!user.is_owner&&!user.access?.sensitive?.salary&&!(own&&personalCan(user,'payslips')))delete copy.salary_adjustment;
 return copy;
}
export function cleanFinal(body,complete=false){
 const out={};for(const k of ['outcome','effective_date','new_end','benefits_date','reason','conditions','new_goals','hr_notes','late_reason','no_response_note','employment_update_reference']){
  if(typeof(body?.[k]||'')!=='string'||(body?.[k]||'').length>4000)throw new Error('Invalid HR final decision');out[k]=(body?.[k]||'').trim();
 }
 for(const k of ['effective_date','new_end','benefits_date'])if(out[k]&&!validDate(out[k]))throw new Error('Enter valid HR decision dates');
 if(complete&&(!['confirmed','extended','terminated'].includes(out.outcome)||!out.effective_date))throw new Error('Choose the final outcome and effective date');
 if(complete&&out.outcome==='extended'&&!out.new_end)throw new Error('Enter the final extension end date');
 if(complete&&out.outcome==='confirmed'&&!out.benefits_date)throw new Error('Enter the benefits activation date');
 out.opportunity_confirmed=body?.opportunity_confirmed===true;out.employment_status_updated=body?.employment_status_updated===true;
 return out;
}
