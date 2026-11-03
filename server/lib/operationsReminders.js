import {systemDb} from '../shared/db/index.js';
import {emptyPolicy} from '../../shared/accessPolicy.js';
import {todayBangkok,addDays,daysBetween,OPERATIONS_DEFAULTS} from '../../shared/operations.js';
import {allRows,checked,loadOperationsData,operationsSettings} from './operationsData.js';
import {buildOperationsTasks} from './operationsTasks.js';
export function reminderBucket(task,today,settings){const repeat=task.state==='overdue'?1:settings.repeat_days,offset=((daysBetween('1970-01-01',today)%repeat)+repeat)%repeat;return addDays(today,-offset);}
export async function runOperationsReminders({preview=false,actor=null,today=todayBangkok()}={}){
 const setting=await operationsSettings(),settings={...OPERATIONS_DEFAULTS,...setting.settings};if(!settings.enabled&&!preview)return {enabled:false,delivered:0,skipped:0,failed:0};
 const [data,users,policies]=await Promise.all([loadOperationsData(),allRows('sys_users','id,username,full_name,employee_id,is_active,is_owner,role'),allRows('hr_access_policies','user_id,policy,version','user_id')]);
 const recipients=[],result={enabled:settings.enabled,delivered:0,skipped:0,failed:0};
 for(const u of users.filter(u=>u.is_active)){
  const p=policies.find(p=>p.user_id===u.id),user={...u,access:p?.policy||emptyPolicy(),access_version:p?.version||0},tasks=buildOperationsTasks(user,data,settings,today).filter(t=>t.remind);
  if(preview){if(tasks.length)recipients.push({user_id:u.id,name:u.full_name||u.username,count:tasks.length});continue;}
  for(const t of tasks){try{
   const ok=checked(await systemDb.rpc('hr_deliver_operations_reminder',{p_user:u.id,p_access_version:user.access_version,p_key:t.key,p_bucket:reminderBucket(t,today,settings),p_title:'HR follow-up / HR ဆောင်ရွက်ရန်',p_message:t.title+' · '+t.due_date+' / '+t.title_my,p_link:t.href,p_context:{key:t.key,group:t.group,employee_id:t.employee_id}}));
   if(ok)result.delivered++;else result.skipped++;
  }catch{result.failed++;}}
 }
 if(preview)return {...result,recipients,total:recipients.reduce((s,v)=>s+v.count,0),date:today};
 checked(await systemDb.from('hr_reminder_runs').insert({status:result.failed?'partial':'success',delivered:result.delivered,skipped:result.skipped,failed:result.failed}));
 if(actor)checked(await systemDb.from('sys_audit_logs').insert({user_id:actor,action:'RUN','module':'HR reminders',details:`Delivered ${result.delivered}; skipped ${result.skipped}; failed ${result.failed}`}));return result;
}
export async function filterReminderNotifications(user,notifications){
 if(!notifications.length)return notifications;
 // Match saved reminders against current permissions and current source state; old or revoked work disappears.
 const deliveries=checked(await systemDb.from('hr_reminder_deliveries').select('notification_id,source_key').eq('recipient_user_id',user.id).in('notification_id',notifications.map(n=>n.id)));
 if(!deliveries.length)return notifications;const settings=(await operationsSettings()).settings,data=await loadOperationsData(),visible=new Set(buildOperationsTasks(user,data,settings).map(t=>t.key)),map=new Map(deliveries.map(d=>[d.notification_id,d.source_key]));return notifications.filter(n=>!map.has(n.id)||visible.has(map.get(n.id)));
}
