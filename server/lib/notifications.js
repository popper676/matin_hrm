import {systemDb} from '../shared/db/index.js';
import {can,employeeScope,pageAllowed,ROUTE_MODULES} from '../../shared/accessPolicy.js';
import {filterReminderNotifications} from './operationsReminders.js';
import {integrityRpc} from './integrityRpc.js';

export function notificationVisible(user,n) {
 if(n.recipient_user_id&&n.recipient_user_id!==user.id)return false;
 const path=typeof n.link_url==='string'&&/^\/(?![\\/])/.test(n.link_url)?n.link_url.split('?')[0]:null;
 if(path&&!pageAllowed(user,path))return false;
 const module=path&&ROUTE_MODULES.find(([prefix])=>path===prefix||path.startsWith(prefix+'/'))?.[1];
 const scope=employeeScope(user);
 if(n.employee_id&&scope!==null&&!scope.includes(n.employee_id))return false;
 if(n.recipient_user_id)return true;
 if(n.recipient_role==='All')return true;
 if(module){
  if(!can(user,module))return false;
  // Historic role-wide messages have no employee association; only all-scope managers may see them.
  return !!n.employee_id||scope===null;
 }
 return user.is_owner?['boss','admin','hr_manager','general_manager','management'].includes(n.recipient_role):n.recipient_role===user.role;
}
const checked=result=>{if(result.error)throw result.error;return result.data||[];};
export async function visibleNotifications(user) {
 const groups=await Promise.all([
  systemDb.from('system_notifications').select('*').eq('recipient_user_id',user.id).order('created_at',{ascending:false}).limit(1000),
  systemDb.from('system_notifications').select('*').is('recipient_user_id',null).order('created_at',{ascending:false}).limit(1000)
 ]);
 let rows=groups.flatMap(checked).filter(n=>notificationVisible(user,n)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 rows=await filterReminderNotifications(user,rows);
 if(!rows.length)return [];
 // Keep PostgREST URLs bounded as the shared notification feed grows.
 const batches=[];
 for(let i=0;i<rows.length;i+=100)batches.push(rows.slice(i,i+100).map(n=>n.id));
 const receipts=(await Promise.all(batches.map(ids=>systemDb.from('hr_notification_receipts').select('*').eq('user_id',user.id).in('notification_id',ids)))).flatMap(checked),byId=new Map(receipts.map(r=>[r.notification_id,r]));
 return rows.filter(n=>!byId.get(n.id)?.dismissed_at).map(n=>({...n,is_read:!!byId.get(n.id)?.read_at||(n.recipient_user_id===user.id&&!!n.is_read)}));
}
export async function recordNotification(user,id,dismiss=false) {
 const {data,error}=await systemDb.from('system_notifications').select('*').eq('id',id).maybeSingle();
 if(error)throw error;
 if(!data||!notificationVisible(user,data)||!(await filterReminderNotifications(user,[data])).length)
  throw Object.assign(new Error('Notification not found'),{status:404});
 await integrityRpc('hr_record_notification_receipt',{p_user:user.id,p_notification:id,p_dismiss:dismiss});
}
