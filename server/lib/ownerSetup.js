import crypto from 'node:crypto';
import {normalizeExpenseRouting} from '../../shared/expenseRouting.js';
import {WORKFLOWS,emptyPolicy,can} from '../../shared/accessPolicy.js';
import {canReviewInformation} from '../../shared/employeeInformation.js';
import {todayBangkok} from '../../shared/operations.js';
export const SETUP_KEYS=['branding','businesses','employees','access','approvals','leave','payroll'];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const ordered=rows=>rows.map(canonical).sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});
export const setupFingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const message=(en,my)=>({en,my});
export function buildOwnerSetup(data,today=todayBangkok()) {
 const active=data.employees.filter(v=>!v.deleted_at&&(!v.status||v.status==='Active')&&(!v.employment_status||v.employment_status==='Active'));
 const users=data.users.filter(v=>v.is_active),staff=users.filter(v=>!v.is_owner),policies=new Map(data.policies.map(p=>[p.user_id,p])),accounts=new Map(users.map(u=>[u.id,{...u,access:policies.get(u.id)?.policy||emptyPolicy()}])),steps=[];
 const activeBusinesses=data.businesses.filter(v=>v.is_active);
 const metric=(en,my,value)=>({en,my,value}),link=(en,my,href)=>({en,my,href});
 const add=(key,title,my,description,description_my,source,metrics,links,issues=[],warnings=[])=>{
  const review=data.reviews.find(r=>r.step===key),fingerprint=setupFingerprint(source),can_review=!issues.length,state=can_review&&review?.fingerprint===fingerprint?'complete':can_review?'review':'blocked';
  steps.push({key,title,title_my:my,description,description_my,metrics,links:links.map(l=>({...l,href:l.href+(l.href.includes('?')?'&':'?')+'setup_step='+key})),issues,warnings,fingerprint,version:review?.version||0,reviewed_at:review?.reviewed_at||null,state,can_review});
 };
 add('branding','Brand identity','Brand အမှတ်အသား','Review your company name, logo, color and recruitment email wording.','ကုမ္ပဏီအမည်၊ Logo၊ အရောင်နှင့် Recruitment Email စာသားများကို စစ်ဆေးပါ။',
  {settings:data.branding.settings,version:data.branding.version},[metric('Company','ကုမ္ပဏီ',data.branding.settings.name),metric('Logo','Logo',data.branding.settings.logo?'Custom / ကိုယ်ပိုင်':'Default / မူလ')],[]);
 add('businesses','Expense business tags','Expense လုပ်ငန်းအမည်များ','Manage the business names available only in employee expense requests. No employee or salary splitting.','ဝန်ထမ်း Expense Request များတွင်သာ ရွေးရန် လုပ်ငန်းအမည်များကို စီမံပါ။ ဝန်ထမ်းနှင့် လစာကို မခွဲပါ။',
  ordered(data.businesses),[metric('Available expense tags','Expense လုပ်ငန်းအမည်များ',activeBusinesses.length),metric('Archived tags','သိမ်းထားသော အမည်များ',data.businesses.length-activeBusinesses.length)],
  [link('Open expense business tags','Expense လုပ်ငန်းအမည်များ ဖွင့်ရန်','/businesses')],activeBusinesses.length?[]:[message('Add at least one expense business tag.','Expense လုပ်ငန်းအမည် အနည်းဆုံးတစ်ခု ထည့်ပါ။')]);
 add('employees','Employees & accounts','ဝန်ထမ်းနှင့် အကောင့်များ','Manage one organization-wide employee record and account per person. Business assignment is not required.','အဖွဲ့အစည်းတစ်ခုတည်းအတွက် ဝန်ထမ်းတစ်ဦးလျှင် Record နှင့် Account တစ်ခုစီကို စီမံပါ။ လုပ်ငန်းခွဲချိတ်ဆက်မှု မလိုပါ။',
  {employees:ordered(active.map(v=>({id:v.id,name:v.Full_name,employee_id:v.employee_id}))),accounts:ordered(users.map(v=>({id:v.id,employee_id:v.employee_id,is_active:v.is_active})))},
  [metric('Active employees','Active ဝန်ထမ်း',active.length),metric('Employees with an active account','အကောင့်ချိတ်ထားသော ဝန်ထမ်း',active.filter(emp=>users.some(u=>u.employee_id===emp.id)).length)],
  [link('Open Employees','ဝန်ထမ်းစာရင်း ဖွင့်ရန်','/employees')],!active.length?[message('Add at least one active employee.','အနည်းဆုံး Active ဝန်ထမ်းတစ်ဦး ထည့်ပါ။')]:[]);
 const noPolicy=staff.filter(u=>!policies.has(u.id)),managers=staff.filter(u=>Object.values(policies.get(u.id)?.policy?.modules||{}).some(v=>v.includes('view')));
 add('access','Accounts & permissions','အကောင့်နှင့် သုံးခွင့်များ','Explicitly review each active staff account. Choose personal apps, management actions, employee scope and sensitive fields.','Active အကောင့်တိုင်းအတွက် Personal Apps၊ စီမံခန့်ခွဲမှုခွင့်၊ ဝန်ထမ်းအတိုင်းအတာနှင့် လျှို့ဝှက်အချက်အလက် သုံးခွင့်ကို စစ်ဆေးပါ။',
  {users:ordered(users),policies:ordered(data.policies)},[metric('Active staff accounts','Active ဝန်ထမ်းအကောင့်',staff.length),metric('Without saved access settings','သုံးခွင့် မသိမ်းရသေးသူ',noPolicy.length),metric('Delegated management accounts','စီမံခန့်ခွဲမှုခွင့် ပေးထားသူ',managers.length)],
  [link('Open People & Access','People & Access ဖွင့်ရန်','/people-access'),link('Open User accounts','အကောင့်စာရင်း ဖွင့်ရန်','/user-accounts')],
  [...(!staff.length?[message('Create or activate a non-Owner staff account.','Owner မဟုတ်သော ဝန်ထမ်းအကောင့်တစ်ခု ထည့်ပါ သို့မဟုတ် ဖွင့်ပါ။')]:[]),...(noPolicy.length?[message('Save an explicit access policy for every active non-Owner account. Personal-only access is valid.','Active ဝန်ထမ်းအကောင့်တိုင်းအတွက် သုံးခွင့်ကို သိမ်းပါ။ Personal Apps သာ ပေးထားခြင်းလည်း ရပါသည်။')]:[])]);
 const approvalIssues=[];
 for(const [key,def]of Object.entries(WORKFLOWS)){
  if(key==='expense'&&data.expenseRouting?.mode==='amount'){
   try{const route=normalizeExpenseRouting(data.expenseRouting);
    if(!Object.keys(route.limits).length)approvalIssues.push(message('Expense: set at least one currency limit; zero means CEO review for every positive amount.','Expense — Currency limit အနည်းဆုံးတစ်ခု သတ်မှတ်ပါ။ ၀ သတ်မှတ်လျှင် ပမာဏတိုင်း CEO ဆီ တင်ရမည်။'));
    for(const s of route.stages){const eligible=id=>{const u=accounts.get(id);return !!u&&can(u,'rewards',s.action);};
     if(!eligible(s.assignee_id)||s.alternate_id&&!eligible(s.alternate_id))approvalIssues.push(message('Expense / '+s.label+': check active reviewers and permissions.','Expense / '+s.label+' — အကောင့်နှင့် သုံးခွင့် စစ်ပါ။'));
     const person=accounts.get(s.assignee_id);if(person?.employee_id&&(!s.alternate_id||accounts.get(s.alternate_id)?.employee_id===person.employee_id))approvalIssues.push(message('Expense / '+s.label+': choose an independent alternate for own requests.','Expense / '+s.label+' — ကိုယ်ပိုင်တောင်းဆိုမှုအတွက် သီးခြား Alternate ရွေးပါ။'));
    }
    for(const requester of users.filter(u=>u.employee_id&&active.some(e=>e.id===u.employee_id))){
     const resolved=route.stages.map(s=>{const primary=accounts.get(s.assignee_id);return accounts.get(primary?.id===requester.id||primary?.employee_id===requester.employee_id?s.alternate_id:s.assignee_id);});
     if(resolved[0]&&resolved[1]&&(resolved[0].id===resolved[1].id||resolved[0].employee_id&&resolved[0].employee_id===resolved[1].employee_id))approvalIssues.push(message('Expense: '+(requester.full_name||requester.username)+' needs independent AGM and CEO reviewers after alternate selection.','Expense — '+(requester.full_name||requester.username)+' ၏ ကိုယ်ပိုင်တောင်းဆိုမှုအတွက် Alternate ရွေးပြီးချိန်တွင် AGM နှင့် CEO မတူရန် လိုသည်။'));
    }
   }catch(e){approvalIssues.push(message('Expense routing: '+e.message,'Expense လမ်းကြောင်း သတ်မှတ်ချက်များ ပြည့်စုံအောင် ဖြည့်ပါ။'));}
   continue;
  }
  const config=data.workflows.find(v=>v.workflow_key===key);
  if(!config?.enabled||config.stages?.length!==def.stages.length){approvalIssues.push(message(def.label+': configure and activate every stage.',def.my+' — အဆင့်အားလုံး သတ်မှတ်ပြီး ဖွင့်ပါ။'));continue;}
  for(let index=0;index<def.stages.length;index++){
   const [expected,label,action]=def.stages[index],stage=config.stages[index];
   const eligible=id=>{const user=accounts.get(id);return !!user&&can(user,def.module,action)&&(key!=='employee_information'||canReviewInformation(user));};
   if(stage.key!==expected||!eligible(stage.assignee_id)||stage.alternate_id&&(!eligible(stage.alternate_id)||stage.alternate_id===stage.assignee_id)){
    approvalIssues.push(message(def.label+' / '+label+': check active reviewers and their permissions.',def.my+' / '+label+' — Reviewer အကောင့်နှင့် သုံးခွင့် စစ်ပါ။'));continue;
   }
   const primary=accounts.get(stage.assignee_id);
   const selfSubjects=active.filter(emp=>primary.employee_id===emp.id);
   if(selfSubjects.length&&(!eligible(stage.alternate_id)||accounts.get(stage.alternate_id)?.employee_id===primary.employee_id))
    approvalIssues.push(message(def.label+' / '+label+': add an independent alternate for the reviewer’s own employee record.',def.my+' / '+label+' — Reviewer ၏ ကိုယ်ပိုင်ကိစ္စအတွက် သီးခြား Alternate ထည့်ပါ။'));
  }
 }
 add('approvals','Approval responsibilities','အတည်ပြုမည့်သူများ','Assign all five form routes, check active reviewer permissions and independent alternates. Existing submitted requests keep their saved routes.','Form ငါးမျိုးအတွက် Reviewer၊ လက်ရှိသုံးခွင့်နှင့် Alternate သတ်မှတ်ပါ။ တင်ပြီးသော Request များ၏ မူလအဆင့်များကို ထိန်းထားမည်။',
  {expenseRouting:data.expenseRouting||null,workflows:ordered(data.workflows),users:ordered(users),policies:ordered(data.policies),employees:active.map(v=>v.id).sort()},[metric('Enabled form workflows','ဖွင့်ထားသော Form လမ်းကြောင်း',(Object.keys(WORKFLOWS).filter(k=>k==='expense'&&data.expenseRouting?.mode==='amount'||data.workflows.some(w=>w.workflow_key===k&&w.enabled)).length)+' / '+Object.keys(WORKFLOWS).length),metric('Issues to resolve','ပြင်ရန် လိုအပ်ချက်',approvalIssues.length)],
  [link('Open Approval Setup','Approval Setup ဖွင့်ရန်','/approval-setup')],approvalIssues);
 const cal=data.calendar?.settings,calendarReady=!!cal&&/^([01]\d|2[0-3]):[0-5]\d$/.test(cal.default_start||'')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(cal.default_end||'')&&cal.default_start!==cal.default_end&&Array.isArray(cal.weekly_holidays)&&cal.weekly_holidays.length<7;
 const paid=data.leaveTypes.filter(v=>v.is_paid),year=Number(today.slice(0,4)),balances=data.balances.filter(v=>v.year===year),withoutPaid=active.filter(emp=>!balances.some(v=>v.employee_id===emp.id&&paid.some(t=>t.id===v.leave_type_id)));
 add('leave','Leave calendar & entitlements','ခွင့်ပြက္ခဒိန်နှင့် ခွင့်ရက်များ','Set working hours, holidays, leave categories and yearly entitlements. Review any employees intentionally given no paid entitlement.','အလုပ်ချိန်၊ ရုံးပိတ်ရက်၊ ခွင့်အမျိုးအစားနှင့် နှစ်အလိုက် ခွင့်ရက် သတ်မှတ်ပါ။ Paid Leave မပေးထားသူများကိုလည်း စစ်ပါ။',
  {calendar:data.calendar,dates:ordered(data.calendarDates),types:ordered(data.leaveTypes),balances:ordered(balances.map(v=>({id:v.id,employee_id:v.employee_id,leave_type_id:v.leave_type_id,year:v.year,entitled_days:v.entitled_days}))),year,employees:active.map(v=>v.id).sort()},[metric('Leave types','ခွင့်အမျိုးအစား',data.leaveTypes.length),metric('Review year','စစ်ဆေးသည့်နှစ်',year),metric('Without a paid entitlement','Paid ခွင့်ရက် မသတ်မှတ်ထားသူ',paid.length?withoutPaid.length:0)],
  [link('Open calendar settings','ပြက္ခဒိန် သတ်မှတ်ရန်','/approval-setup'),link('Open leave types & balances','ခွင့်အမျိုးအစားနှင့် လက်ကျန် ဖွင့်ရန်','/leave')],
  [...(!calendarReady?[message('Save valid company start/end hours and weekly holidays.','ကုမ္ပဏီ အလုပ်စ/ဆုံးချိန်နှင့် ပိတ်ရက်များကို မှန်ကန်စွာ သိမ်းပါ။')]:[]),...(!data.leaveTypes.length?[message('Configure at least one leave type.','အနည်းဆုံး ခွင့်အမျိုးအစားတစ်ခု ထည့်ပါ။')]:[])],
  paid.length&&withoutPaid.length?[message('Paid entitlements are not granted automatically. Confirm whether missing allocations are intentional.','Paid ခွင့်ရက်ကို အလိုအလျောက် မပေးပါ။ မသတ်မှတ်ထားခြင်းသည် ရည်ရွယ်ချက်ရှိမရှိ စစ်ပါ။')]:[]);
 add('payroll','Payroll policies','လစာတွက်ချက်မှု မူဝါဒ','Review salary records, payroll policy and KPI settings. You may intentionally retain the documented defaults after reviewing them.','ဝန်ထမ်းလစာ၊ Payroll Policy နှင့် KPI သတ်မှတ်ချက်များကို စစ်ပါ။ မူလသတ်မှတ်ချက်များကို စစ်ပြီး ရည်ရွယ်ချက်ရှိရှိ ဆက်သုံးနိုင်သည်။',
  {employees:ordered(active.map(v=>({id:v.id,salary:v.salary}))),policy:data.payrollPolicy||data.payrollDefaults,kpi:data.kpiSettings},[metric('Policy source','မူဝါဒ အရင်းအမြစ်',data.payrollPolicy?'Saved policy / သိမ်းထားသောမူဝါဒ':'Documented defaults / မူလသတ်မှတ်ချက်'),metric('Salary divisor','လစာစားကိန်း',(data.payrollPolicy||data.payrollDefaults).salary_divisor),metric('Employees with zero/missing salary','လစာ ၀ သို့မဟုတ် မထည့်ရသေးသူ',active.filter(v=>!Number(v.salary)).length)],
  [link('Open Payroll settings','Payroll သတ်မှတ်ရန်','/payroll/records'),link('Open Payroll workspace','လစာ တွက်ချက်ရာ ဖွင့်ရန်','/payroll/workspace')],active.length?[]:[message('Add employees before reviewing payroll setup.','Payroll Setup မစစ်မီ ဝန်ထမ်းများ ထည့်ပါ။')],
  [message('This review does not prepare payroll, mark payments or change employee salaries.','ဤစစ်ဆေးမှုသည် လစာ မတွက်ပါ၊ ပေးချေမှု မမှတ်သားပါ၊ ဝန်ထမ်းလစာ မပြောင်းပါ။')]);
 const completed=steps.filter(s=>s.state==='complete').length;
 return {steps,completed,total:steps.length,all_complete:completed===steps.length,date:today,branding:data.branding};
}
