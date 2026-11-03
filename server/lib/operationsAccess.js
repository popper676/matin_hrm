import {can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
export function scoped(user,module,id,action='view'){const ids=employeeScope(user);return can(user,module,action)&&(ids===null||ids.includes(id));}
export function ownSource(user,app,id){return user.employee_id===id&&personalCan(user,app);}
export function rowsFor(user,module,app,rows){return rows.filter(r=>scoped(user,module,r.employee_id)||(app&&ownSource(user,app,r.employee_id)));}
export const hasSalary=user=>user.is_owner||user.access?.sensitive?.salary===true;
export const payrollAllowed=user=>can(user,'payroll')&&hasSalary(user);
