import {can,personalCan} from '../../shared/accessPolicy.js';
import {OPERATIONS_DEFAULTS,addDays,daysBetween,todayBangkok,assignmentAt,probationEnd,validDay,monthEnd} from '../../shared/operations.js';
import {approvalCanAct} from './approvalAccess.js';
import {probationView} from './probationForms.js';
import {warningHR,warningView} from './warningForms.js';
import {scoped,hasSalary} from './operationsAccess.js';
const date=v=>v?new Date(new Date(v).getTime()+7*3600000).toISOString().slice(0,10):null;
export function buildOperationsTasks(user,data,settings={},today=todayBangkok(),{personal=false,business=''}={}){
 const cfg={...OPERATIONS_DEFAULTS,...settings},items=[],byEmployee=new Map(data.employees.filter(e=>!e.deleted_at).map(e=>[e.id,e])),approvals=new Map(data.approvals.map(a=>[a.workflow_key+':'+a.resource_id,a]));
 const add=(kind,id,employee,due,title,my,href,group,{window=cfg.due_soon_days,stage='',name='',remind=true}={})=>{
  if(!validDay(due)||daysBetween(today,due)>window)return;
  const e=byEmployee.get(employee),tags=assignmentAt(data.assignments,employee,today)?.items||[];
  if(business&&!(group==='expense'?data.expenses.find(r=>r.id===id)?.form_snapshot?.input?.business_unit===business:tags.some(v=>v.business_key===business)))return;
  items.push({key:[kind,id,due,stage].join(':'),kind,source_id:id,employee_id:employee,title,title_my:my,employee_name:name||e?.Full_name||'',due_date:due,days:daysBetween(today,due),state:due<today?'overdue':due===today?'today':'upcoming',group,href,remind,business_keys:tags.map(v=>v.business_key)});
 };
 if(!personal&&can(user,'today')){
  for(const a of data.approvals)if(approvalCanAct(user,a))add('approval',a.id,a.employee_id,addDays(date(a.updated_at||a.created_at)||today,cfg.approval_after_days),'Approval waiting for you','မိမိ အတည်ပြုရန် စောင့်နေသည်','/approvals?request='+a.id,'approvals',{stage:String(a.current_stage),name:a.snapshot?.employee_name||'',window:365,remind:addDays(date(a.updated_at||a.created_at)||today,cfg.approval_after_days)<=today});
  for(const e of byEmployee.values()){
   if(!['Active',null,undefined].includes(e.status)||!['Active',null,undefined].includes(e.employment_status))continue;
   if(scoped(user,'employees',e.id)&&!data.profiles.some(p=>p.employee_id===e.id))add('profile',e.id,e.id,e.hire_date&&e.hire_date<=today?e.hire_date:date(e.created_at)||today,'Employee information incomplete','ဝန်ထမ်းအချက်အလက် မပြည့်စုံသေး','/employees/'+e.id+'/360','people',{window:0});
   if(scoped(user,'probation',e.id)&&user.employee_id!==e.id){
    const rounds=data.probations.filter(r=>r.employee_id===e.id&&r.anchor?.hire_date===e.hire_date).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')),latest=rounds[0];
    if(!latest||latest.status==='rejected'||latest.status==='decided'&&latest.final_decision?.outcome==='extended'){
     const end=latest?.status==='decided'?latest.final_decision.new_end:probationEnd(e.hire_date,e.probation_period);
     if(end)add('probation-start',e.id,e.id,addDays(end,-14),'Probation evaluation due','အစမ်းခန့် အကဲဖြတ်ရန် လိုသည်',(can(user,'employees')?'/employees/'+e.id+'/360':'/performance/probation'),'probation');
    }
   }
  }
  for(const r of data.probations){
   const a=approvals.get('probation:'+r.id);if(!['draft','pending'].includes(r.status)||!probationView(user,r,a)||user.employee_id===r.employee_id)continue;
   add('probation',r.id,r.employee_id,addDays(r.anchor.current_end,-14),'Complete probation evaluation','အစမ်းခန့် အကဲဖြတ်ချက် ပြီးစီးရန်','/performance/probation?record='+r.id,'probation');
  }
  for(const r of data.warnings){
   const a=approvals.get('warning:'+r.id);if(r.status!=='issued'||!warningView(user,r,a)||!warningHR(user,r,a))continue;
   const last=r.hr_records?.at(-1);if(last?.review_completed===true)continue;
   add('warning-followup',r.id,r.employee_id,last?.review_date||r.data.target_date,'Warning follow-up review','သတိပေးစာ နောက်ဆက်တွဲ သုံးသပ်ရန်','/warnings?record='+r.id,'warnings');
  }
  for(const p of data.profiles)if(scoped(user,'employees',p.employee_id)&&(user.is_owner||user.access?.sensitive?.identity))for(const [k,en,my]of [['visa_expiry_date','Visa expiry','ဗီဇာ သက်တမ်းကုန်ရက်'],['work_permit_expiry_date','Work permit expiry','အလုပ်လုပ်ခွင့် သက်တမ်းကုန်ရက်']])if(p.data[k])add(k,p.employee_id,p.employee_id,p.data[k],en,my,'/employees/'+p.employee_id+'/360','documents',{window:cfg.expiry_lead_days});
  if(can(user,'payroll')&&hasSalary(user))for(const p of data.payrolls)if(scoped(user,'payroll',p.employee_id)&&p.payment_status!=='Paid'&&p.month<=today.slice(0,7))add('payroll',p.id,p.employee_id,monthEnd(p.month),'Payroll month-end review','လစာပေးချေမှု စစ်ဆေးရန်',(can(user,'monthly-review')?'/monthly-review?month='+p.month:'/payroll'),'payroll',{window:31,remind:monthEnd(p.month)<=today});
  for(const r of data.expenses)if(r.form_version===2&&r.status==='APPROVED'&&scoped(user,'rewards',r.employee_id))add('expense-payment',r.id,r.employee_id,r.form_snapshot?.input?.required_payment_date,'Approved expense awaiting payment','အတည်ပြု အသုံးစရိတ် ပေးချေရန်','/hr-operations/expense/'+r.id,'expense');
 }
 if(user.employee_id){
  for(const p of data.profiles)if(p.employee_id===user.employee_id&&personalCan(user,'profile'))for(const [k,en,my]of [['visa_expiry_date','Your visa expires','မိမိ ဗီဇာ သက်တမ်းကုန်ရက်'],['work_permit_expiry_date','Your work permit expires','မိမိ အလုပ်လုပ်ခွင့် သက်တမ်းကုန်ရက်']])if(p.data[k])add('own-'+k,p.employee_id,p.employee_id,p.data[k],en,my,'/portal/profile','personal',{window:cfg.expiry_lead_days});
  for(const r of data.probations)if(r.employee_id===user.employee_id&&personalCan(user,'probation')&&r.self_invited_at&&!r.self_response&&['draft','pending'].includes(r.status))add('probation-response',r.id,r.employee_id,r.self_due_date,'Your probation response is due','မိမိ အစမ်းခန့် သုံးသပ်ချက် တင်ရန်','/portal/probation?record='+r.id,'personal');
  for(const r of data.warnings)if(r.employee_id===user.employee_id&&personalCan(user,'warnings')&&r.status==='issued'&&!r.acknowledgment&&!r.external_receipts?.some(v=>['signed','refused'].includes(v.status)))add('warning-receipt',r.id,r.employee_id,addDays(date(r.issued_at),cfg.approval_after_days),'Review your issued warning letter','မိမိ သတိပေးစာ ဖတ်ရှုရန်','/portal/warnings?record='+r.id,'personal',{window:0});
 }
 return items.sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.title.localeCompare(b.title)||a.key.localeCompare(b.key));
}
