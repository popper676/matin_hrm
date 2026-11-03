import {can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
export function warningScoped(user,employee,action='view'){
 const scope=employeeScope(user);return can(user,'warnings',action)&&(scope===null||scope.includes(employee));
}
export function warningHR(user,row,approval){return user.employee_id!==row.employee_id&&(user.is_owner||approval?.stages.some(s=>s.key==='hr'&&s.assignee_id===user.id&&can(user,'warnings','approve')));}
export function warningView(user,row,approval){
 const own=user.employee_id===row.employee_id;
 if(own){if(row.status!=='issued'||!personalCan(user,'warnings'))return null;}
 else if(!user.is_owner&&!warningScoped(user,row.employee_id)&&!approval?.stages.some(s=>s.assignee_id===user.id&&can(user,'warnings','approve')))return null;
 const copy={...row,personal:own};
 if(!warningHR(user,row,approval))delete copy.hr_records;
 return copy;
}
