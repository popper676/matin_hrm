import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import * as XLSX from 'xlsx';
import {cleanManualHtml,cleanManualContent} from '../lib/manualHtml.js';
import {validateAiAction} from '../lib/aiActionPolicy.js';
let db,owner,serial=0;
const uuid=()=>crypto.randomUUID();
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function employee(){return (await query('INSERT INTO "Employees"(employee_id,"Full_name",salary) VALUES($1,$2,0) RETURNING *',['HP-'+(++serial),'Integrity Employee'] ))[0];}
async function account(policy={},isOwner=false,eid=null){return (await query("INSERT INTO sys_users(username,password_hash,role,is_owner,employee_id) VALUES($1,'test-hash','employee',$2,$3) RETURNING *",['hp-user-'+(++serial),isOwner,eid]))[0];}
async function delegate(module,actions,scope='all',ids=[]){const u=await account();await query('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[u.id,JSON.stringify({modules:{[module]:['view',...actions]},personal:[],scope,employee_ids:ids,sensitive:{salary:true}})]);return u;}
const convert=(actor,c,code='EMP-'+uuid())=>query('SELECT hr_convert_candidate($1,$2,$3,$4,NULL) AS result',[actor,c,code,'MUST_CHANGE:$2b$04$test']);
const sign=(actor,id,stage,action='APPROVE')=>query('SELECT * FROM hr_sign_document($1,$2,$3,$4,$5,$6)',[actor,id,stage,action,action==='APPROVE'?'signature-data':null,'Reviewed reason']);
async function candidate(){return (await query("INSERT INTO recruitment_candidates(full_name,status) VALUES('Candidate','Hired') RETURNING id"))[0].id;}
async function document(eid){return (await query("INSERT INTO doc_approval_requests(employee_id,title) VALUES($1,'Test letter') RETURNING id",[eid]))[0].id;}
async function proposal(session,kind,payload){return (await query('SELECT * FROM hr_propose_ai_action($1,$2,$3,$4)',[owner.id,session,kind,JSON.stringify(payload)]))[0];}
const decide=(actor,session,id,yes=true)=>query('SELECT hr_decide_ai_action($1,$2,$3,$4) AS result',[actor,session,id,yes]);
before(async()=>{
 db=new PGlite();await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 for(const file of ['001_fresh_hr_schema','003_recruitment_openings','004_people_access_approvals','005_employee_information','006_leave_forms','007_expense_forms','008_probation_forms','009_warning_forms','010_hr_operations','011_branding_owner_setup','012_high_priority_integrity'])
  await db.exec(await readFile(new URL('../../supabase/'+file+'.sql',import.meta.url),'utf8'));
 owner=await account({},true);
});
after(async()=>{await db?.close();});

test('paid payroll rejects every modification, status reversal and deletion',async()=>{
 const e=await employee(),p=(await query("INSERT INTO payrolls(employee_id,month,basic_salary,net_salary,payment_status) VALUES($1,'2026-10',100,100,'Paid') RETURNING id",[e.id]))[0];
 await assert.rejects(query('UPDATE payrolls SET net_salary=999 WHERE id=$1',[p.id]),/immutable/);
 await assert.rejects(query("UPDATE payrolls SET payment_status='Pending' WHERE id=$1",[p.id]),/immutable/);
 await assert.rejects(query('DELETE FROM payrolls WHERE id=$1',[p.id]),/immutable/);
 assert.equal(Number((await query('SELECT net_salary FROM payrolls WHERE id=$1',[p.id]))[0].net_salary),100);
});
test('a stale workspace write cannot overwrite a payment committed first',async()=>{
 const e=await employee(),p=(await query("INSERT INTO payrolls(employee_id,month,net_salary) VALUES($1,'2026-10',80) RETURNING id",[e.id]))[0];
 await query("UPDATE payrolls SET payment_status='Paid' WHERE id=$1",[p.id]);
 await assert.rejects(query("UPDATE payrolls SET payment_status='Pending',net_salary=90 WHERE id=$1",[p.id]),/immutable/);
 assert.equal((await query('SELECT payment_status FROM payrolls WHERE id=$1',[p.id]))[0].payment_status,'Paid');
});
test('delegated recruitment conversion is atomic and retry returns the same employee',async()=>{
 const recruiter=await delegate('recruitment',['create']),c=await candidate();
 const first=(await convert(recruiter.id,c))[0].result,again=(await convert(recruiter.id,c))[0].result;
 assert.equal(first.employee_id,again.employee_id);assert.equal(again.already_converted,true);
 assert.equal((await query('SELECT role FROM sys_users WHERE employee_id=$1',[first.employee_id]))[0].role,'employee');
 assert.equal((await query('SELECT count(*)::int n FROM sys_users WHERE employee_id=$1',[first.employee_id]))[0].n,1);
});
test('conversion refuses restricted scopes before creating any employee',async()=>{
 const c=await candidate(),before=(await query('SELECT count(*)::int n FROM "Employees"'))[0].n;
 for(const scope of ['own','selected']){const u=await delegate('recruitment',['create'],scope);await assert.rejects(convert(u.id,c),/All employees/);}
 assert.equal((await query('SELECT count(*)::int n FROM "Employees"'))[0].n,before);
});
test('account provisioning failure rolls back the employee and candidate status',async()=>{
 const c=await candidate(),code='EMP-'+uuid();
 await query("INSERT INTO sys_users(username,password_hash,role) VALUES($1,'hash','employee')",[code.toLowerCase()]);
 await assert.rejects(convert(owner.id,c,code),/unique/);
 assert.equal((await query('SELECT count(*)::int n FROM "Employees" WHERE employee_id=$1',[code]))[0].n,0);
 assert.equal((await query('SELECT status FROM recruitment_candidates WHERE id=$1',[c]))[0].status,'Hired');
});
test('HR cannot issue pending or rejected document requests',async()=>{
 const e=await employee(),id=await document(e.id);
 await assert.rejects(sign(owner.id,id,'hr'),/stage has changed/);
 await sign(owner.id,id,'boss','REJECT');
 await assert.rejects(sign(owner.id,id,'hr'),/stage has changed/);
 assert.equal((await query("SELECT count(*)::int n FROM employee_documents WHERE title='Test letter'"))[0].n,0);
});
test('valid Boss then HR signatures issue exactly one document across retries',async()=>{
 const e=await employee(),id=await document(e.id);await sign(owner.id,id,'boss');
 const first=(await sign(owner.id,id,'hr'))[0],again=(await sign(owner.id,id,'hr'))[0];
 assert.equal(first.issued_document_id,again.issued_document_id);
 assert.equal(again.approval_history.length,2);
 assert.equal((await query('SELECT count(*)::int n FROM employee_documents WHERE employee_id=$1',[e.id]))[0].n,1);
});
test('document approval always rechecks delegated employee scope',async()=>{
 const e=await employee(),other=await employee(),u=await delegate('documents',['approve'],'selected',[other.id]),id=await document(e.id);
 await assert.rejects(sign(u.id,id,'boss'),/approval access/);
});
test('hard delete preserves account and retained roster if any history exists',async()=>{
 const e=await employee(),u=await account({},false,e.id);
 await query('INSERT INTO employee_rosters(employee_id,day_of_week,is_off_day) VALUES($1,1,true)',[e.id]);
 await assert.rejects(query('SELECT hr_delete_pristine_employee($1,$2)',[owner.id,e.id]),/retained HR history/);
 assert.equal((await query('SELECT count(*)::int n FROM sys_users WHERE id=$1',[u.id]))[0].n,1);
 assert.equal((await query('SELECT count(*)::int n FROM employee_rosters WHERE employee_id=$1',[e.id]))[0].n,1);
});
test('hard delete removes only a pristine employee atomically and protects Owner',async()=>{
 const e=await employee(),u=await account({},false,e.id);
 await query('SELECT hr_delete_pristine_employee($1,$2)',[owner.id,e.id]);
 assert.equal((await query('SELECT count(*)::int n FROM sys_users WHERE id=$1',[u.id]))[0].n,0);
 const ownEmp=await employee();await query('UPDATE sys_users SET employee_id=$1 WHERE id=$2',[ownEmp.id,owner.id]);
 await assert.rejects(query('SELECT hr_delete_pristine_employee($1,$2)',[owner.id,ownEmp.id]),/owner employee/);
});
test('settlement cannot be released via a generic update or an edit-only account',async()=>{
 const e=await employee(),id=(await query("INSERT INTO corporate_offboarding(employee_id,handover_required) VALUES($1,false) RETURNING id",[e.id]))[0].id;
 await assert.rejects(query("UPDATE corporate_offboarding SET settlement_status='Released' WHERE id=$1",[id]),/release action/);
 const u=await delegate('offboarding',['edit']);
 await assert.rejects(query('SELECT hr_release_settlement($1,$2)',[u.id,id]),/approval access/);
 await assert.rejects(query('SELECT hr_release_settlement($1,$2)',[owner.id,id]),/Complete all/);
 await query("INSERT INTO offboarding_case_tasks(offboarding_id,task_name,status) VALUES($1,'Clearance','Completed')",[id]);
 await query('SELECT hr_release_settlement($1,$2)',[owner.id,id]);
 await assert.rejects(query("UPDATE offboarding_case_tasks SET status='Pending' WHERE offboarding_id=$1",[id]),/cannot be undone/);
});
test('settlement requires handover evidence when handover is required',async()=>{
 const e=await employee(),id=(await query('INSERT INTO corporate_offboarding(employee_id,handover_required) VALUES($1,true) RETURNING id',[e.id]))[0].id;
 await query("INSERT INTO offboarding_case_tasks(offboarding_id,task_name,status) VALUES($1,'Clearance','Completed')",[id]);
 await assert.rejects(query('SELECT hr_release_settlement($1,$2)',[owner.id,id]),/Handover must/);
});
test('AI draft creates no KPI task and explicit confirmation executes its stored payload once',async()=>{
 const e=await employee(),session=(await query("INSERT INTO boss_chat_sessions(user_id,title) VALUES($1,'AI test') RETURNING id",[owner.id]))[0].id;
 const p=await proposal(session,'create_kpi_task',{title:'Reviewed task',description:'Exact reviewed payload',employee_id:e.id});
 assert.equal((await query("SELECT count(*)::int n FROM boss_kpi_assignments WHERE title='Reviewed task'"))[0].n,0);
 const result=(await decide(owner.id,session,p.id))[0].result,retry=(await decide(owner.id,session,p.id))[0].result;
 assert.equal(result.executed_now,true);assert.equal(retry.executed_now,false);
 assert.equal((await query("SELECT count(*)::int n FROM boss_kpi_assignments WHERE title='Reviewed task'"))[0].n,1);
});
test('AI confirmation rejects another actor, another session, cancellation and expiry',async()=>{
 const session=(await query("INSERT INTO boss_chat_sessions(user_id,title) VALUES($1,'AI security') RETURNING id",[owner.id]))[0].id;
 const other=await account({},true),otherSession=(await query("INSERT INTO boss_chat_sessions(user_id,title) VALUES($1,'Other') RETURNING id",[other.id]))[0].id;
 const p=await proposal(session,'send_team_announcement',{title:'Never published',content:'Private draft',priority:'Normal'});
 await assert.rejects(decide(other.id,otherSession,p.id),/unavailable/);
 await assert.rejects(decide(owner.id,otherSession,p.id),/session required/);
 await decide(owner.id,session,p.id,false);await assert.rejects(decide(owner.id,session,p.id),/cancelled/);
 const expired=await proposal(session,'send_team_announcement',{title:'Expired',content:'Expired draft',priority:'Normal'});
 await query("UPDATE hr_ai_action_proposals SET expires_at=now()-interval '1 minute' WHERE id=$1",[expired.id]);
 await assert.rejects(decide(owner.id,session,expired.id),/expired/);
 assert.equal((await query("SELECT count(*)::int n FROM announcements WHERE title IN ('Never published','Expired')"))[0].n,0);
});
test('AI confirmation rechecks current Owner status and active employee before any side effect',async()=>{
 const session=(await query("INSERT INTO boss_chat_sessions(user_id,title) VALUES($1,'Current checks') RETURNING id",[owner.id]))[0].id;
 const p=await proposal(session,'create_kpi_task',{title:'Invalid target',employee_id:uuid()});
 await assert.rejects(decide(owner.id,session,p.id),/no longer active/);
 assert.equal((await query('SELECT status FROM hr_ai_action_proposals WHERE id=$1',[p.id]))[0].status,'pending');
 await query('UPDATE sys_users SET is_active=false WHERE id=$1',[owner.id]);
 await assert.rejects(decide(owner.id,session,p.id),/Owner session/);
 await query('UPDATE sys_users SET is_active=true WHERE id=$1',[owner.id]);
});
test('manual sanitizer strips executable HTML, unsafe URLs and embeds while preserving formatting',()=>{
 for(const payload of ['<img src=x onerror=alert(1)>','<svg><animate onbegin=alert(1)></animate></svg>','<iframe srcdoc="<script>alert(1)</script>"></iframe>','<a href="javascript:alert(1)">bad</a>','<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">']){
  const clean=cleanManualHtml(payload);assert(!/<(?:script|img|svg|math|iframe)\b|onerror\s*=|javascript:/i.test(clean),clean);
 }
 assert.equal(cleanManualHtml('<h2>HR</h2><p><b>Policy</b></p>'),'<h2>HR</h2><p><b>Policy</b></p>');
 const local=JSON.parse(cleanManualContent(JSON.stringify({en:'<p onclick="bad()">English</p>',my:'<b>မြန်မာ</b><script>bad()</script>'})));
 assert.equal(local.en,'<p>English</p>');assert.equal(local.my,'<b>မြန်မာ</b>');
});
test('AI proposal fields are validated and unexpected arguments do not enter stored payload',()=>{
 assert.throws(()=>validateAiAction('create_kpi_task',{title:'Task',employee_id:'invalid'}),/valid employee/);
 assert.throws(()=>validateAiAction('send_team_announcement',{title:'Hello',content:'Message',priority:'Unknown'}),/priority/);
 assert.deepEqual(validateAiAction('send_employee_warning',{employee_name:'Employee',reason:'Review',confirmed:true}),{employee_name:'Employee',reason:'Review'});
});
test('patched spreadsheet parser reads and exports HR data without prototype pollution',()=>{
 assert.equal(XLSX.version,'0.20.3');
 const sheet=XLSX.utils.json_to_sheet([{employee_id:'TEST-001',Full_name:'ဝန်ထမ်း',salary:0}]),book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,sheet,'Employees');
 const bytes=XLSX.write(book,{bookType:'xlsx',type:'buffer'}),parsed=XLSX.read(bytes,{type:'buffer'});
 assert.deepEqual(XLSX.utils.sheet_to_json(parsed.Sheets.Employees),[{employee_id:'TEST-001',Full_name:'ဝန်ထမ်း',salary:0}]);
 assert.equal(Object.prototype.polluted,undefined);
});

test('legacy vault approval requests retain their document and follow the same signature stages',async()=>{
 const e=await employee(),old=(await query("INSERT INTO employee_documents(employee_id,title,status) VALUES($1,'Legacy approval','PENDING_BOSS') RETURNING id",[e.id]))[0];
 await db.exec(await readFile(new URL('../../supabase/012_high_priority_integrity.sql',import.meta.url),'utf8'));
 await assert.rejects(sign(owner.id,old.id,'hr'),/stage has changed/);
 await sign(owner.id,old.id,'boss');await sign(owner.id,old.id,'hr');await sign(owner.id,old.id,'hr');
 const docs=await query("SELECT id,status FROM employee_documents WHERE title='Legacy approval'");
 assert.equal(docs.length,1);assert.equal(docs[0].id,old.id);assert.equal(docs[0].status,'COMPLETED_AND_ISSUED');
});
test('unlinked approval history also prevents permanent employee deletion',async()=>{
 const e=await employee(),u=await account({},false,e.id);
 await query("INSERT INTO hr_approval_requests(workflow_key,requester_id,employee_id,title,stages) VALUES('leave',$1,$2,'Retained history','[]')",[owner.id,e.id]);
 await assert.rejects(query('SELECT hr_delete_pristine_employee($1,$2)',[owner.id,e.id]),/retained approval history/);
 assert.equal((await query('SELECT count(*)::int n FROM sys_users WHERE id=$1',[u.id]))[0].n,1);
});

test('integrity migration is rerunnable and does not grant browser execution',async()=>{
 const before=(await query('SELECT count(*)::int n FROM "Employees"'))[0].n;
 await db.exec(await readFile(new URL('../../supabase/012_high_priority_integrity.sql',import.meta.url),'utf8'));
 assert.equal((await query('SELECT count(*)::int n FROM "Employees"'))[0].n,before);
 const permitted=(await query("SELECT has_function_privilege('authenticated','hr_convert_candidate(uuid,uuid,text,text,uuid)','EXECUTE') ok"))[0].ok;
 assert.equal(permitted,false);
});
