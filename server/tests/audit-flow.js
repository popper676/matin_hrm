import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {logoPng} from './brandingFixtures.js';
import {getBkkDateString} from '../lib/dateUtils.js';
export async function exerciseAudit({db,request:parentRequest,realFetch,base,getCookie,setCookie,ownerCookie,storedFiles,failNext}) {
 let cookie=ownerCookie;
 async function request(...args){setCookie(cookie);const data=await parentRequest(...args);cookie=getCookie();return data;}
    const {emptyPolicy}=await import('../../shared/accessPolicy.js');
    const results=[];
    const note=(id)=>{results.push(id);};
    async function raw(path,method='GET',body,headers={}) {
      const r=await realFetch(base+path,{method,headers:{Cookie:cookie,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...headers},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body)});
      const data=await r.json();return {status:r.status,data};
    }
    async function account(code,policy=null){
      const e=(await db.query('INSERT INTO "Employees"(employee_id,"Full_name",salary,status) VALUES($1,$1,30000,\'Active\') RETURNING *',[code])).rows[0];
      const u=(await db.query('INSERT INTO sys_users(username,full_name,employee_id,role,password_hash,is_active) VALUES($1,$1,$2,\'employee\',$3,true) RETURNING id',[code,e.id,await bcrypt.hash('Audit-pass-1',4)])).rows[0];
      if(policy)await db.query('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[u.id,JSON.stringify(policy)]);
      return {emp:e.id,user:u.id,username:code};
    }
    async function login(a){await request('/auth/login','POST',{username:a.username,password:'Audit-pass-1'});}
    const person=await account('audit-worker'),other=await account('audit-other');
    const manager=await account('audit-manager',{...emptyPolicy(),scope:'all',modules:{employees:['view'],handovers:['view'],offboarding:['view','edit'],performance:['view']}});
    // New manual SOPs must have the report/calculation date.
    const position=(await db.query("INSERT INTO positions(title) VALUES('Audit role') RETURNING id")).rows[0].id;
    await db.query('UPDATE "Employees" SET position_id=$1 WHERE id=$2',[position,person.emp]);
    await request('/sops','POST',{title:'Audit task',content:'A manual assignment',position_id:position});
    const sop=(await db.query('SELECT * FROM daily_sops WHERE employee_id=$1',[person.emp])).rows[0];
    const month=new Date().toISOString().slice(0,7);
    const report=await request('/sops/report?month='+month);
    assert.equal(new Date(sop.assigned_date).toISOString().slice(0,10),getBkkDateString(new Date()));assert(report.sops.some(s=>s.id===sop.id));
    note('manual-sop-date');
    // Text-report completion must save its actual schema column.
    await login(person);const text=new FormData();text.append('manualReport','Completed audit task');
    const complete=await raw('/sops/'+sop.id+'/complete','POST',text,{'X-HR-Portal':'employee'});
    assert.equal(complete.status,200,JSON.stringify(complete));assert.equal((await db.query('SELECT manual_report FROM daily_sops WHERE id=$1',[sop.id])).rows[0].manual_report,'Completed audit task');
    note('sop-manual-report');
    // Exit surveys must retain the employee association required by scoped writes.
    cookie=ownerCookie;const ob=(await db.query('INSERT INTO corporate_offboarding(employee_id,handover_required) VALUES($1,false) RETURNING id',[person.emp])).rows[0].id;
    await login(person);const exit=await raw('/exit-survey','POST',{reason_for_leaving:'Audit only',job_satisfaction:4},{'X-HR-Portal':'employee'});
    assert.equal(exit.status,200,JSON.stringify(exit));note('employee-exit-survey');
    cookie=ownerCookie;await request('/offboarding/'+ob+'/exit-interview','POST',{reason_for_leaving:'Owner-entered audit interview',job_satisfaction:4});
    const interview=(await db.query('SELECT employee_id FROM exit_interviews WHERE offboarding_id=$1',[ob])).rows[0];
    await login(person);const survey=await request('/exit-survey','GET',undefined,{'X-HR-Portal':'employee'});assert.equal(survey.ei.employee_id,person.emp);assert.equal(interview.employee_id,person.emp);
    note('owner-exit-interview');
    // A roster for another weekday must not replace today's default shift.
    cookie=ownerCookie;const shifts=[];for(const name of ['Default','Other-day'])shifts.push((await db.query('INSERT INTO shifts(shift_name,start_time,end_time) VALUES($1,\'09:00\',\'18:00\') RETURNING id',[name])).rows[0].id);
    await db.query('UPDATE "Employees" SET default_shift_id=$1 WHERE id=$2',[shifts[0],person.emp]);
    const today=new Date(new Date().getTime()+7*3600000).toISOString().slice(0,10),wrongDay=(new Date(today+'T12:00:00Z').getUTCDay()+1)%7;
    await db.query('INSERT INTO employee_rosters(employee_id,day_of_week,shift_id,start_date) VALUES($1,$2,$3,\'2020-01-01\')',[person.emp,wrongDay,shifts[1]]);
    await login(person);const available=await request('/attendance/available-shifts');assert.equal(available.default_shift_id,shifts[0]);
    note('wrong-weekday-roster');
    // Salary decreases and their prose must be redacted without Salary access.
    cookie=ownerCookie;const original=(await db.query('SELECT * FROM "Employees" WHERE id=$1',[person.emp])).rows[0];
    await request('/employees/'+person.emp,'PUT',{...original,salary:'20000'});
    await login(manager);const history=await request('/employees/'+person.emp+'/timeline');
    const decrease=history.timeline.find(t=>t.event_type==='SALARY_CHANGE');
    assert(decrease);assert.equal(decrease.new_salary,undefined);assert(!/20,?000|30,?000/.test(JSON.stringify(decrease)));
    note('salary-decrease-disclosure');
    // Numeric zero salary must remain zero through the employee API.
    cookie=ownerCookie;await request('/employees/'+person.emp,'PUT',{...original,salary:0});
    const zero=(await db.query('SELECT salary FROM "Employees" WHERE id=$1',[person.emp])).rows[0].salary;assert.equal(Number(zero),0);note('numeric-zero-salary');
    // Changing required work must invalidate acknowledgment and prevent approval.
    const handover=(await db.query("INSERT INTO employee_handovers(outgoing_employee_id,successor_employee_id,status,offboarding_id) VALUES($1,$2,'pending_review',$3) RETURNING id",[person.emp,other.emp,ob])).rows[0].id;
    await db.query('UPDATE corporate_offboarding SET handover_id=$1,handover_required=true WHERE id=$2',[handover,ob]);
    const required=(await db.query("INSERT INTO handover_items(handover_id,title,status,is_required,successor_acknowledged) VALUES($1,'Required item','done',true,true) RETURNING id",[handover])).rows[0].id;
    await db.query("INSERT INTO handover_items(handover_id,title,status,is_required,successor_acknowledged) VALUES($1,'Other completed item','done',true,true)",[handover]);
    await login(person);await request('/handover/'+handover+'/items/'+required,'PUT',{status:'pending',outgoing_notes:'Changed after submission'},{'X-HR-Portal':'employee'});
    cookie=ownerCookie;const approval=await raw('/handover/'+handover+'/approve','POST',{version:(await db.query('SELECT version FROM employee_handovers WHERE id=$1',[handover])).rows[0].version});assert.equal(approval.status,409,JSON.stringify(approval));
    const item=(await db.query('SELECT status,successor_acknowledged FROM handover_items WHERE id=$1',[required])).rows[0];
    assert.equal(item.status,'pending');assert.equal(item.successor_acknowledged,false);note('incomplete-handover-approval');
    // A reviewed handover becomes immutable, including evidence children.
    await db.query("UPDATE handover_items SET status='done' WHERE handover_id=$1",[handover]);
    await db.query("UPDATE handover_items SET successor_acknowledged=true WHERE handover_id=$1",[handover]);
    await db.query("UPDATE employee_handovers SET status='pending_review' WHERE id=$1",[handover]);
    assert.equal((await raw('/handover/'+handover+'/approve','POST',{})).status,400,'A reviewer must send the version they reviewed');
    assert.equal((await raw('/handover/'+handover+'/approve','POST',{version:0})).status,400);
    const reviewed=(await db.query('SELECT version FROM employee_handovers WHERE id=$1',[handover])).rows[0].version;
    assert.equal((await raw('/handover/'+handover+'/approve','POST',{version:reviewed-1})).status,409,'Stale review cannot approve newer content');
    await request('/handover/'+handover+'/approve','POST',{version:reviewed});

    await login(person);const after=await raw('/handover/'+handover+'/items/'+required,'PUT',{status:'done',outgoing_notes:'Replaced after approval'},{'X-HR-Portal':'employee'});assert.equal(after.status,409,JSON.stringify(after));note('completed-handover-edit');
    cookie=ownerCookie;const nested=await request('/handover/offboarding/'+ob);assert.equal(nested.handover.id,handover);note('owner-nested-handover');
    await login(manager);const view=await raw('/handover/'+handover);assert.equal(view.status,200,JSON.stringify(view));note('view-only-handover');
    // Legacy payroll must save the canonical preview at KPI=100.
    cookie=ownerCookie;await db.query('UPDATE "Employees" SET salary=30000 WHERE id=$1',[other.emp]);
    await db.query("INSERT INTO kpi_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings",[JSON.stringify({target_bonus_percentage:15,auto_weights:{attendance:0,punctuality:0,sops:100,peer_voting:0},manual_metrics:[]})]);
    await db.query("INSERT INTO daily_sops(employee_id,task_description,is_completed,assigned_date) VALUES($1,'Completed task',true,'2026-08-03')",[other.emp]);
    const calc=await request('/payroll-engine/calculate/'+other.emp+'/2026-08');assert.equal(calc.auto_kpi_contribution,100);
    const created=await request('/payroll','POST',{employee_id:other.emp,month:'2026-08',basic_salary:'30000',allowances:'0',deductions:'0',final_kpi_score:'100'});
    assert.equal(Number(created.payroll.net_salary),34500);note('legacy-preview-saved');
    // Scoped Performance-only access must calculate the same results as Owner.
    const ownerPerf=(await request('/performance?month=2026-08')).employees.find(e=>e.employee_id===other.emp);
    await login(manager);const limitedPerf=(await request('/performance?month=2026-08')).employees.find(e=>e.employee_id===other.emp);
    assert.equal(limitedPerf.cpi,ownerPerf.cpi);assert.equal(limitedPerf.has_sop,ownerPerf.has_sop);
    assert.equal((await raw('/attendance')).status,403,'Performance access does not expose raw attendance');
    failNext('daily_sops','GET');assert.equal((await raw('/performance?month=2026-08')).status,503,'Source outages cannot become zero scores');
    note('performance-only-metrics');
    // Legacy status-only payment must preserve all saved monetary inputs.
    cookie=ownerCookie;await db.query('UPDATE payrolls SET basic_salary=12000,allowances=400,deductions=50,net_salary=12350 WHERE id=$1',[created.payroll.id]);
    await request('/payroll/'+created.payroll.id,'PUT',{payment_status:'Paid'});
    const paid=(await db.query('SELECT basic_salary,allowances,deductions,net_salary FROM payrolls WHERE id=$1',[created.payroll.id])).rows[0];
    assert.equal(Number(paid.basic_salary),12000);assert.equal(Number(paid.allowances),400);assert.equal(Number(paid.net_salary),12350);note('legacy-pay-recalculation');
    // Referenced source vault records and their issued file bytes must be retained.
    const file='audit-shared.pdf';storedFiles.set('company_documents/'+file,Buffer.from('%PDF-audit'));
    const source=(await db.query("INSERT INTO employee_documents(employee_id,title,file_url,status) VALUES($1,'Source file',$2,'ACTIVE') RETURNING id",[other.emp,'company_documents/'+file])).rows[0].id;
    const reqdoc=await request('/documents/request-approval','POST',{employee_id:other.emp,title:'Issued shared file',file_url:'company_documents/'+file});
    await request('/documents/boss-sign/'+reqdoc.request.id,'POST',{action:'APPROVE',boss_signature:'Audit executive'});
    await request('/documents/hr-sign/'+reqdoc.request.id,'POST',{hr_signature:'Audit HR'});
    assert.equal((await raw('/documents/'+source,'DELETE')).status,409);
    const copies=(await db.query("SELECT count(*)::int n FROM employee_documents WHERE file_url=$1",['company_documents/'+file])).rows[0].n;
    assert.equal(copies,2);assert.equal(storedFiles.has('company_documents/'+file),true);note('shared-document-deletion');
    // Birthday retries must not deliver duplicate notifications.
    const bday=new Date(new Date().getTime()+7*3600000).toISOString().slice(5,10);await db.query('UPDATE "Employees" SET date_of_birth=$1 WHERE id=$2',['2000-'+bday,other.emp]);
    const {checkAndNotifyBirthdays}=await import('../cron/birthdays.js');
    await checkAndNotifyBirthdays();const count1=(await db.query("SELECT count(*)::int n FROM system_notifications WHERE title='Upcoming Birthday! 🎂'")).rows[0].n;
    await checkAndNotifyBirthdays();const count2=(await db.query("SELECT count(*)::int n FROM system_notifications WHERE title='Upcoming Birthday! 🎂'")).rows[0].n;
    assert(count1>0);assert.equal(count2,count1);note('birthday-deduplication');
    // Bulk/workspace endpoints must enforce explicit Delete/Create capabilities.
    cookie=ownerCookie;
    const limited=await account('audit-limited',{...emptyPolicy(),scope:'all',modules:{sops:['view','edit'],payroll:['view','edit'],employees:['view','edit']},sensitive:{salary:true,bank:false,identity:false}});
    const doomed=(await db.query("INSERT INTO daily_sops(employee_id,task_description,assigned_date) VALUES($1,'Keep without Delete',current_date) RETURNING id",[other.emp])).rows[0].id;
    await login(limited);const deleted=await raw('/sops/bulk-delete','POST',{ids:[doomed]});assert.equal(deleted.status,403);assert.equal((await db.query('SELECT count(*)::int n FROM daily_sops WHERE id=$1',[doomed])).rows[0].n,1);
    note('delete-without-delete-permission');
    const applied=await raw('/payroll/workspace/apply','POST',{employee_id:other.emp,month:'2026-07',overrides:{}});assert.equal(applied.status,403,JSON.stringify(applied));note('create-payroll-without-create');
    const avatar=new FormData();avatar.append('avatar',new Blob([logoPng()],{type:'image/png'}),'avatar.png');const uploaded=await raw('/employees/'+other.emp+'/avatar','POST',avatar);assert.equal(uploaded.status,200,JSON.stringify(uploaded));note('avatar-with-edit-permission');
    // Default personal voting must also work in SQL without an explicit policy row.
    await login(person);const vote=await raw('/peer-voting/submit','POST',{nominee_id:other.emp,attendance:4,punctuality:4,sops:4,peer:4,initiative:4},{'X-HR-Portal':'employee'});assert.equal(vote.status,200,JSON.stringify(vote));note('default-account-voting');
    // Failed QR scans must leave their token unused.
    cookie=ownerCookie;
    const qr=(await request('/attendance/generate-qr','POST',{employee_id:person.emp})).token;
    await db.query("INSERT INTO attendance_records(employee_id,check_in,attendance_method) VALUES($1,now(),'Photo')",[person.emp]);
    await login(person);const scan=await raw('/attendance/scan','POST',{token:qr},{'X-HR-Portal':'employee'});assert.equal(scan.status,429);
    const used=(await db.query('SELECT used FROM qr_attendance_tokens WHERE token=$1',[qr])).rows[0].used;assert.equal(used,false);note('qr-consumed-on-failed-scan');
    // Invalid KPI settings must be rejected and preserve usable existing settings.
    cookie=ownerCookie;const badSettings=await raw('/payroll-engine/settings','POST',{});assert.equal(badSettings.status,400);
    failNext('kpi_settings','GET');assert.equal((await raw('/payroll-engine/calculate/'+other.emp+'/2026-06')).status,503,'Settings outages cannot silently use defaults');
    const broken=await raw('/payroll-engine/calculate/'+other.emp+'/2026-06');assert.equal(broken.status,200,JSON.stringify(broken));note('invalid-kpi-settings');
    // Finance must expose saved net_salary and payment status for the UI.
    const finance=await request('/finance/dashboard');const sample=finance.recent_payrolls.find(r=>Number(r.net_salary)>0);assert(sample);assert.equal(sample.total_amount,undefined);
    note('finance-table-field');
    // Failed Supabase writes must not return success.
    cookie=ownerCookie;const nonexistent=crypto.randomUUID();failNext('sop_templates','POST');
    const falseSave=await raw('/sops/templates','POST',{position_id:nonexistent,task_description:'Audit invalid reference'});assert.equal(falseSave.status,500);
    assert.equal((await db.query('SELECT count(*)::int n FROM sop_templates WHERE position_id::text=$1',[nonexistent])).rows[0].n,0);note('false-success-on-db-error');
    // Failed account provisioning must roll back that employee import row.
    await db.query("INSERT INTO sys_users(username,role,password_hash,is_active) VALUES('audit-bulk-collision','employee',$1,true)",[await bcrypt.hash('Audit-pass-1',4)]);
    const bulk=await request('/employees/bulk-import','POST',{employees:[{employee_id:'AUDIT-BULK-COLLISION',Full_name:'Synthetic bulk row',salary:1000}]});
    const orphan=(await db.query('SELECT e.id,(SELECT count(*)::int FROM sys_users u WHERE u.employee_id=e.id) n FROM "Employees" e WHERE e.employee_id=\'AUDIT-BULK-COLLISION\'')).rows[0];
    assert.equal(orphan,undefined);assert.equal(bulk.createdCount,0);assert.equal(bulk.errors.length,1);note('bulk-import-orphan');
    const historical=await account('audit-history-only');
    await db.query("INSERT INTO daily_sops(employee_id,task_description,assigned_date,is_completed) VALUES($1,'Retained completed HR history',current_date,true)",[historical.emp]);
    const hard=await raw('/employees/'+historical.emp+'/hard','DELETE');assert.equal(hard.status,409);
    const orphanSops=(await db.query('SELECT count(*)::int n FROM daily_sops WHERE employee_id=$1',[historical.emp])).rows[0].n;
    assert.equal(orphanSops,1);note('pristine-delete-with-history');
    // The inbox must retain an older assigned request despite unrelated newer rows.
    await db.query("UPDATE hr_access_policies SET policy=jsonb_set(policy,'{modules,leave}','[\"view\",\"approve\"]') WHERE user_id=$1",[manager.user]);
    const ownerId=(await db.query('SELECT id FROM sys_users WHERE is_owner LIMIT 1')).rows[0].id;
    const stages=JSON.stringify([{key:'manager',label:'Manager',action:'approve',assignee_id:manager.user}]);
    const oldApproval=(await db.query("INSERT INTO hr_approval_requests(workflow_key,requester_id,employee_id,title,stages,created_at) VALUES('leave',$1,$2,'Still waiting for reviewer',$3,'2020-01-01') RETURNING id",[ownerId,person.emp,stages])).rows[0].id;
    await db.query("INSERT INTO hr_approval_requests(workflow_key,requester_id,title,stages,created_at) SELECT 'leave',$1,'Other request '||n,$2,now() FROM generate_series(1,1000)n",[ownerId,JSON.stringify([{key:'manager',label:'Manager',action:'approve',assignee_id:ownerId}])]);
    await login(manager);const inbox=await request('/approvals');assert.equal(inbox.requests.some(r=>r.id===oldApproval),true);note('pending-approval-cutoff');
    // The dashboard must use the advanced Bangkok date at a UTC day boundary.
    cookie=ownerCookie;const RealDate=globalThis.Date;
    try {
      const fixed=RealDate.parse('2026-10-21T23:30:00Z');
      globalThis.Date=class extends RealDate {constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
      await request('/auth/login','POST',{username:'testowner',password:'Owner-pass-1'});
      await db.query('DELETE FROM attendance_records');
      await db.query("INSERT INTO attendance_records(employee_id,check_in,attendance_method) VALUES($1,'2026-10-22T05:30:00+07:00','Photo')",[person.emp]);
      const dash=await request('/dashboard');assert.equal(dash.stats.today_present,1);note('bangkok-dashboard-date');
      const yearEnd=RealDate.parse('2026-12-30T05:00:00Z');
      globalThis.Date=class extends RealDate {constructor(...a){super(...(a.length?a:[yearEnd]));}static now(){return yearEnd;}};
      await db.query("UPDATE \"Employees\" SET date_of_birth='2000-01-01' WHERE id=$1",[person.emp]);
      const newYear=await checkAndNotifyBirthdays();assert(newYear.count>0,JSON.stringify(newYear));note('new-year-birthday');
    }finally{globalThis.Date=RealDate;}
    assert.equal(results.length,29);
    setCookie(ownerCookie);
}
