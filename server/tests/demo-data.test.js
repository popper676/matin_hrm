import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import {buildDemoPayload,demoDate} from '../lib/demoPayload.js';
import {prepareDemoFiles,removeDemoFiles} from '../lib/demoFiles.js';
import {WORKFLOWS} from '../../shared/accessPolicy.js';
let db,owner,otherOwner,outsider,instance,batch,retained,oldSettings;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const install=async(actor=owner,instanceId=instance,data=batch.payload,id=batch.runId)=>(await q('SELECT hr_install_client_demo($1,$2,$3,$4) result',[actor,instanceId,id,JSON.stringify(data)]))[0].result;
const clear=async(apply=false)=>(await q('SELECT hr_clear_client_demo($1,$2,$3,$4) result',[owner,instance,batch.runId,apply]))[0].result;
before(async()=>{
 db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA storage;CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);');
 for(const f of (await readdir(new URL('../../supabase/',import.meta.url))).filter(n=>/^0(01|0[3-9]|1[0-8])_.*sql$/.test(n)).sort())await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
 owner=(await q("INSERT INTO sys_users(username,password_hash,role,is_owner) VALUES('real-owner','OWNER-UNCHANGED','boss',true) RETURNING id"))[0].id;
 otherOwner=(await q("INSERT INTO sys_users(username,password_hash,role,is_owner) VALUES('second-owner','SECOND-UNCHANGED','boss',true) RETURNING id"))[0].id;
 outsider=(await q("INSERT INTO sys_users(username,password_hash,role) VALUES('retained-account','REAL-HASH','employee') RETURNING id"))[0].id;
 instance=(await q('SELECT id FROM hr_instance'))[0].id;batch=await buildDemoPayload({ownerId:owner});
 retained=(await q('INSERT INTO "Employees"(employee_id,"Full_name") VALUES(\'REAL-001\',\'Retained employee\') RETURNING id'))[0].id;
 await q("INSERT INTO payrolls(employee_id,month,payment_status,net_salary) VALUES($1,'2025-01','Paid',100)",[retained]);
 await q("INSERT INTO recruitment_candidates(full_name,email) VALUES('Retained applicant','retained@example.invalid')");
 await q("INSERT INTO employee_documents(employee_id,title,status) VALUES($1,'Retained issued document','COMPLETED_AND_ISSUED')",[retained]);
 await q("INSERT INTO hr_leave_calendar_dates(work_date,is_working,label) VALUES($1,false,'Original special holiday')",[demoDate(batch.payload.day,16)]);
 for(const [key,def] of Object.entries(WORKFLOWS))await q('SELECT hr_save_workflow($1,$2,$3,true,0)',[owner,key,JSON.stringify(def.stages.map(([key,label,action])=>({key,label,action,assignee_id:owner,alternate_id:otherOwner})))]);
 oldSettings={workflows:await q('SELECT workflow_key,enabled,stages FROM hr_workflow_settings ORDER BY workflow_key'),expense:(await q('SELECT mode,limits,stages FROM hr_expense_routing'))[0],calendar:(await q('SELECT settings FROM hr_leave_calendar'))[0],dates:await q('SELECT * FROM hr_leave_calendar_dates')};
});
after(async()=>{await db?.close();});
test('017 installs empty private tooling; browser roles cannot run installers or cleanup',async()=>{
 assert.equal((await q('SELECT count(*)::int n FROM hr_demo_runs'))[0].n,0);
 for(const role of ['anon','authenticated'])assert.equal((await q("SELECT has_function_privilege($1,'hr_clear_client_demo(uuid,uuid,uuid,boolean)','EXECUTE') allowed",[role]))[0].allowed,false);
 assert.equal((await q("SELECT has_function_privilege('service_role','hr_install_client_demo(uuid,uuid,uuid,jsonb)','EXECUTE') allowed"))[0].allowed,true);
});
test('installed demo RPCs constrain every delete for Supabase safe-update compatibility',async()=>{
 for(const signature of ['hr_install_client_demo(uuid,uuid,uuid,jsonb)','hr_clear_client_demo(uuid,uuid,uuid,boolean)','hr_save_leave_calendar(uuid,integer,jsonb,jsonb)']){
  const body=(await q('SELECT pg_get_functiondef($1::regprocedure) body',[signature]))[0].body;
  const statements=[...body.matchAll(/\bDELETE\s+FROM\b[^;]+;/gi)].map(match=>match[0]);
  assert(statements.length>0);
  for(const statement of statements)assert.match(statement,/\bWHERE\b/i,`${signature} must not issue an unqualified delete`);
 }
});
test('Owner can replace special calendar dates and the version, without removing safety checks',async()=>{
 await db.exec('BEGIN');try{
  const original=(await q('SELECT * FROM hr_leave_calendar WHERE id'))[0];
  const date=demoDate(batch.payload.day,40);
  await q('SELECT hr_save_leave_calendar($1,$2,$3,$4)',[owner,original.version,JSON.stringify(original.settings),JSON.stringify([{date,is_working:true,label:'Replacement date'}])]);
  const dates=await q('SELECT work_date::text AS work_date,is_working,label FROM hr_leave_calendar_dates');
  assert.equal(dates.length,1);assert.equal(dates[0].work_date,date);assert.equal(dates[0].is_working,true);
  assert.equal((await q('SELECT version FROM hr_leave_calendar'))[0].version,original.version+1);
 }finally{await db.exec('ROLLBACK');}
 assert.deepEqual(await q('SELECT * FROM hr_leave_calendar_dates'),oldSettings.dates);
});
test('generated accounts are unique, fictional and have random bcrypt passwords; dates roll across years',async()=>{
 assert.equal(new Set(batch.accounts.map(a=>a.username)).size,12);assert.equal(new Set(batch.accounts.map(a=>a.password)).size,12);
 const users=batch.payload.records.filter(r=>r.table==='sys_users');for(let i=0;i<12;i++){assert.equal(users[i].data.is_owner,false);assert(await bcrypt.compare(batch.accounts[i].password,users[i].data.password_hash));}
 assert.equal(demoDate('2026-12-31',1),'2027-01-01');assert.equal(demoDate('2028-02-28',1),'2028-02-29');
 for(const e of batch.people)assert(e.employee.email.endsWith('@demo.invalid'));
});
test('incorrect Owner, instance, date or malformed payload rolls back every inserted row',async()=>{
 await assert.rejects(install(outsider),/Owner/);await assert.rejects(install(owner,crypto.randomUUID()),/instance/);
 await assert.rejects(install(owner,instance,{...batch.payload,day:'2000-01-01'}),/date changed/);
 await assert.rejects(install(owner,instance,{...batch.payload,records:[...batch.payload.records,{table:'Employees',data:{invalid_field:1}}]}),/Unknown demo field/);
 await assert.rejects(install(owner,instance,{...batch.payload,files:[{bucket:'resumes',path:'outside-this-demo/resume.pdf'}]}),/attachment namespace/);
 assert.deepEqual(await q('SELECT * FROM hr_leave_calendar_dates'),oldSettings.dates,'a failure after calendar changes must restore the original dates');
 assert.equal((await q('SELECT count(*)::int n FROM hr_demo_runs'))[0].n,0);assert.equal((await q("SELECT count(*)::int n FROM sys_users WHERE username LIKE 'demo.%'"))[0].n,0);
});
test('one transaction creates coherent payroll, balances, native approvals and recruitment pipeline',async()=>{
 const result=await install();assert.equal(result.accounts,12);assert.equal(result.counts.Employees,12);assert.equal(result.counts.Leave_Request,4);assert.equal(result.counts.rewards_and_claims,9);assert.equal(result.counts.hr_probation_forms,3);assert.equal(result.counts.hr_warning_forms,2);assert.equal(result.counts.employee_documents,1);
 assert.equal((await q('SELECT count(*)::int n FROM payrolls WHERE salary_template IS NOT NULL'))[0].n,result.counts.payrolls);
 const states=await q("SELECT status FROM hr_approval_requests WHERE workflow_key='expense'");assert(states.some(s=>s.status==='paid'));assert(states.some(s=>s.status==='rejected'));
 assert.equal((await q("SELECT count(*)::int n FROM rewards_and_claims WHERE form_snapshot->'routing'->>'ceo_required'='true'"))[0].n,1);
 assert.equal((await q('SELECT count(*)::int n FROM "Leave_balances" WHERE used_days>0'))[0].n,2);
 assert.equal((await q("SELECT count(*)::int n FROM recruitment_candidates WHERE email LIKE '%@demo.invalid'"))[0].n,7);
 assert.equal((await q('SELECT count(*)::int n FROM hr_leave_calendar_dates'))[0].n,0);
 assert.equal((await q('SELECT count(*)::int n FROM corporate_offboarding WHERE handover_id IS NOT NULL'))[0].n,1);
 assert.equal((await q("SELECT count(*)::int n FROM handover_items WHERE status='done'"))[0].n,1);
});
test('018 can be reapplied to an active demo without changing rows, credentials or saved settings',async()=>{
 const run=(await q('SELECT * FROM hr_demo_runs WHERE id=$1',[batch.runId]))[0];
 const users=await q('SELECT id,password_hash FROM sys_users ORDER BY id');
 await db.exec(await readFile(new URL('../../supabase/018_demo_safe_updates.sql',import.meta.url),'utf8'));
 assert.deepEqual((await q('SELECT * FROM hr_demo_runs WHERE id=$1',[batch.runId]))[0],run);
 assert.deepEqual(await q('SELECT id,password_hash FROM sys_users ORDER BY id'),users);
 assert.equal((await q('SELECT count(*)::int n FROM "Employees"'))[0].n,13);
});
test('repeat seed is idempotent; a different active batch is refused without duplicates',async()=>{
 assert.deepEqual(await install(),(await q('SELECT summary FROM hr_demo_runs WHERE id=$1',[batch.runId]))[0].summary);
 await assert.rejects(install(owner,instance,batch.payload,crypto.randomUUID()),/already active/);
 assert.equal((await q("SELECT count(*)::int n FROM sys_users WHERE username LIKE 'demo.%'"))[0].n,12);
});
test('normal immutable history remains protected while demo is active',async()=>{
 await assert.rejects(q("DELETE FROM payrolls WHERE payment_status='Paid'"),/immutable/);
 await assert.rejects(q("DELETE FROM employee_documents WHERE status='COMPLETED_AND_ISSUED'"),/Retain/);
 await assert.rejects(q('DELETE FROM hr_warning_forms'),/retained/);
});
test('all newly created ordinary HR data is tracked; every Owner account is exempt',async()=>{
 await q("INSERT INTO announcements(title) VALUES('DEMO: added during client walkthrough')");
 const u=(await q("INSERT INTO sys_users(username,password_hash,role,is_owner) VALUES('additional-owner','NEW-OWNER-HASH','boss',true) RETURNING id"))[0].id;
 assert.equal((await q("SELECT count(*)::int n FROM hr_demo_rows WHERE table_name='sys_users' AND row_key=$1",[JSON.stringify({id:u})]))[0].n,0);
 assert.equal((await q("SELECT count(*)::int n FROM hr_demo_rows WHERE table_name='announcements'"))[0].n,4);
 await q("INSERT INTO storage.objects(bucket_id,name) VALUES('resumes','new-demo-upload.pdf'),('brand_assets','keep-logo.png')");
 assert.equal((await q("SELECT count(*)::int n FROM hr_demo_files WHERE path='new-demo-upload.pdf'"))[0].n,1);
 assert.equal((await q("SELECT count(*)::int n FROM hr_demo_files WHERE path='keep-logo.png'"))[0].n,0);
 const preview=await clear();assert.equal(preview.apply,false);assert.equal(preview.state,'active');assert.equal((await q('SELECT count(*)::int n FROM "Employees"'))[0].n,13);
});
test('cleanup refuses a promoted demo Owner and rolls back all settings and records',async()=>{
 const id=batch.people[0].user.id;await q('UPDATE sys_users SET is_owner=true WHERE id=$1',[id]);
 await assert.rejects(clear(true),/made an Owner/);assert.equal((await q('SELECT state FROM hr_demo_runs'))[0].state,'active');
 await q('UPDATE sys_users SET is_owner=false WHERE id=$1',[id]);
});
test('cleanup refuses loose employee and file references from retained records',async()=>{
 await q("UPDATE recruitment_candidates SET converted_employee_id=$1 WHERE full_name='Retained applicant'",[batch.people[0].employee.id]);
 await assert.rejects(clear(true),/Retained records/);assert.equal((await q('SELECT state FROM hr_demo_runs'))[0].state,'active');
 await q("UPDATE recruitment_candidates SET converted_employee_id=NULL,resume_url='/api/hr-files/resumes?path=new-demo-upload.pdf' WHERE full_name='Retained applicant'");
 await assert.rejects(clear(true),/Retained records/);
 await q("UPDATE recruitment_candidates SET resume_url=NULL WHERE full_name='Retained applicant'");
});
test('explicit cleanup removes paid/issued demo history and restores settings while preserving Owners and real data',async()=>{
 await q('UPDATE sys_users SET employee_id=NULL WHERE id=$1',[batch.people[4].user.id]);
 await q('UPDATE sys_users SET employee_id=$1 WHERE id=$2',[batch.people[4].employee.id,owner]);
 await q('UPDATE sys_users SET is_active=false WHERE id=$1',[otherOwner]);
 const result=await clear(true);assert.equal(result.state,'cleared');assert.equal(result.files.length,batch.files.length+1);
 assert.deepEqual(await q('SELECT workflow_key,enabled,stages FROM hr_workflow_settings ORDER BY workflow_key'),oldSettings.workflows);
 assert.deepEqual((await q('SELECT mode,limits,stages FROM hr_expense_routing'))[0],oldSettings.expense);
 assert.deepEqual((await q('SELECT settings FROM hr_leave_calendar'))[0],oldSettings.calendar);
 assert.deepEqual(await q('SELECT * FROM hr_leave_calendar_dates'),oldSettings.dates);
 assert.deepEqual(await q('SELECT employee_id,"Full_name" FROM "Employees"'),[{employee_id:'REAL-001',Full_name:'Retained employee'}]);
 const users=await q('SELECT username,password_hash,employee_id FROM sys_users ORDER BY username');assert.equal(users.length,4);assert.equal(users.find(u=>u.username==='real-owner').password_hash,'OWNER-UNCHANGED');assert.equal(users.find(u=>u.username==='real-owner').employee_id,null);assert(users.some(u=>u.username==='second-owner'));assert(users.some(u=>u.username==='additional-owner'));
 assert.equal((await q('SELECT count(*)::int n FROM employee_documents'))[0].n,1);assert.equal((await q('SELECT count(*)::int n FROM payrolls'))[0].n,1);await assert.rejects(q('DELETE FROM payrolls'),/immutable/);
});
test('cleared runs are retryable, new live records are untracked, migration reruns retain data',async()=>{
 assert.equal((await clear(true)).apply,false);
 const id=(await q("INSERT INTO announcements(title) VALUES('Real announcement after demo') RETURNING id"))[0].id;
 assert.equal((await q("SELECT count(*)::int n FROM hr_demo_rows WHERE table_name='announcements' AND row_key=$1",[JSON.stringify({id})]))[0].n,0);
 await db.exec(await readFile(new URL('../../supabase/017_client_demo.sql',import.meta.url),'utf8'));
 assert.equal((await q('SELECT state FROM hr_demo_runs'))[0].state,'cleared');
 const nextRun=crypto.randomUUID();await install(owner,instance,batch.payload,nextRun).catch(e=>{assert.match(e.message,/attachment namespace/);});
 assert.equal((await q("SELECT count(*)::int n FROM hr_demo_runs WHERE state='active'"))[0].n,0);
});
test('demo CVs and handover PDFs are real files; failed storage cleanup stays retryable',async()=>{
 const files=await prepareDemoFiles(batch.files);assert.equal(files.length,9);
 for(const f of files.filter(f=>f.mime==='application/pdf')){assert.equal(f.content.subarray(0,4).toString(),'%PDF');assert(f.content.length>500);}
 let fails=true,marked=[];
 const fake={storage:{from:()=>({remove:async()=>({error:fails?{message:'offline'}:null})})},from:()=>({update:()=>({eq:()=>({eq:()=>({eq:async()=>{marked.push(1);return{error:null};}})})})})};
 assert.equal((await removeDemoFiles(fake,batch.runId,batch.payload.files)).length,9);assert.equal(marked.length,0);fails=false;assert.equal((await removeDemoFiles(fake,batch.runId,batch.payload.files)).length,0);assert.equal(marked.length,9);
 await assert.rejects(removeDemoFiles(fake,batch.runId,[{bucket:'resumes',path:'real/resume.pdf'}]),/outside/);
});
