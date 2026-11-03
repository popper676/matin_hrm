import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import express from 'express';
import {bkkMonthBounds,bkkDayBounds} from '../lib/dateUtils.js';
import {overtimeInput,overtimeDecision} from '../lib/overtimePolicy.js';
import {receiveHrFile} from '../lib/hrUploads.js';
import {emptyPolicy} from '../../shared/accessPolicy.js';
import {logoPng} from './brandingFixtures.js';
Object.assign(process.env,{SUPABASE_URL:'https://isolatedmedium.supabase.co',SUPABASE_SERVICE_KEY:'offline-only',EXPECTED_SUPABASE_PROJECT_REF:'isolatedmedium',HR_INSTANCE_ID:'00000000-0000-4000-8000-000000000001',JWT_SECRET:'isolated-medium-test-secret-'.repeat(3)});
const {overtimeHours,openAttendance}=await import('../modules/hrm/service/attendanceService.js');
const {decodeAttendancePhoto}=await import('../lib/attendancePhotos.js');
const {canOpenDocument}=await import('../lib/officialDocuments.js');
const {notificationVisible}=await import('../lib/notifications.js');
let db,serial=0;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function employee(){return (await q('INSERT INTO "Employees"(employee_id,"Full_name") VALUES($1,$2) RETURNING id',['MED-'+(++serial),'Medium test']))[0].id;}
async function account(emp=null,owner=false){return (await q("INSERT INTO sys_users(username,password_hash,role,employee_id,is_owner) VALUES($1,'hash','employee',$2,$3) RETURNING id",['med-'+(++serial),emp,owner]))[0].id;}
before(async()=>{
 db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const name of ['001_fresh_hr_schema','003_recruitment_openings','004_people_access_approvals','005_employee_information','006_leave_forms','007_expense_forms','008_probation_forms','009_warning_forms','010_hr_operations','011_branding_owner_setup','012_high_priority_integrity','013_medium_priority'])await db.exec(await readFile(new URL('../../supabase/'+name+'.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
const user=(changes={})=>({id:'actor',employee_id:'self',is_owner:false,role:'employee',access:{...emptyPolicy(),personal:['attendance','voting','documents'],...changes}});

test('Bangkok month bounds include the local first midnight and exclude the next month',()=>{
 assert.deepEqual(bkkMonthBounds('2026-10'),{start:'2026-09-30T17:00:00.000Z',end:'2026-10-31T17:00:00.000Z',startDay:'2026-10-01',endDay:'2026-10-31',nextDay:'2026-11-01'});
 assert.equal(bkkMonthBounds('2028-02').endDay,'2028-02-29');assert.equal(bkkMonthBounds('2026-12').nextDay,'2027-01-01');
 assert.equal(bkkDayBounds('2026-10-01').start,'2026-09-30T17:00:00.000Z');
 for(const value of ['2026-00','2026-13','bad'])assert.throws(()=>bkkMonthBounds(value));
 for(const value of ['2026-02-30','2026-99-99','bad'])assert.throws(()=>bkkDayBounds(value));
});
test('overtime submission ignores a forged origin and prevents cross-employee and self-assignment',()=>{
 const body={employee_id:'self',ot_date:'2026-10-20',start_time:'17:00',end_time:'19:00',requested_by:'hr_boss'};
 assert.equal(overtimeInput(user(),body,true).requested_by,'employee');
 assert.throws(()=>overtimeInput(user(),{...body,employee_id:'other'},true),/own/);
 assert.throws(()=>overtimeInput(user(),body,false),/Attendance Edit/);
 const manager=user({scope:'all',modules:{attendance:['view','edit','approve']}});
 assert.throws(()=>overtimeInput(manager,body,false),/independent/);
 assert.equal(overtimeInput(manager,{...body,employee_id:'other'},false).requested_by,'hr_boss');
 assert.throws(()=>overtimeInput(manager,{...body,employee_id:'other',start_time:'29:00'},false),/valid/);
});
test('only an independent approver or the assigned employee can make the terminal OT decision',()=>{
 const manager=user({scope:'all',modules:{attendance:['view','approve']}}),request={employee_id:'other',requested_by:'employee',status:'Pending_Boss_Approval'};
 assert.equal(overtimeDecision(manager,request,'Approved'),true);
 assert.throws(()=>overtimeDecision(manager,{...request,employee_id:'self'},'Approved'),/independent/);
 assert.throws(()=>overtimeDecision(user(),request,'Approved'),/Approve/);
 assert.throws(()=>overtimeDecision(manager,request,'Pending_Employee_Acceptance'),/pending/);
 assert.equal(overtimeDecision(user(),{employee_id:'self',requested_by:'hr_boss',status:'Pending_Employee_Acceptance'},'Approved'),true);
 assert.throws(()=>overtimeDecision(manager,{...request,requested_by:'hr_boss',status:'Pending_Employee_Acceptance'},'Approved'),/assigned employee/);
 assert.throws(()=>overtimeDecision(manager,{...request,status:'Rejected'},'Approved'),/no longer/);
 assert.equal(overtimeDecision(manager,{...request,status:'Approved'},'Approved'),false);
});
test('OT uses the check-in shift day, approved time window and actual checkout',()=>{
 const record={check_in:'2026-10-20T09:00:00+07:00'},shift={start_time:'09:00:00',end_time:'17:00:00'};
 const request={ot_date:'2026-10-20',start_time:'17:00',end_time:'19:00',requested_hours:2,status:'Approved'};
 assert.equal(overtimeHours(record,'2026-10-20T18:00:00+07:00',shift,[request]),1);
 assert.equal(overtimeHours(record,'2026-10-20T19:00:00+07:00',shift,[{...request,ot_date:'2026-10-19'}]),0);
 assert.equal(overtimeHours(record,'2026-10-20T18:00:00+07:00',shift,[{...request,start_time:'19:00',end_time:'21:00'}]),0);
 assert.equal(overtimeHours(record,'2026-10-20T19:00:00+07:00',shift,[request,request]),2);
 const night={check_in:'2026-10-20T22:00:00+07:00'};
 assert.equal(overtimeHours(night,'2026-10-21T08:00:00+07:00',{start_time:'22:00:00',end_time:'06:00:00'},[{...request,start_time:'06:00',end_time:'08:00'}]),2);
 assert.equal(openAttendance([{...night,id:'night',check_out:null}],'2026-10-21T08:00:00+07:00').id,'night');
 assert.throws(()=>openAttendance([{...record,check_out:null}],'2026-10-23T08:00:00+07:00'),/still open/);
});
test('attendance photos require real bounded PNG/JPEG content',()=>{
 assert.equal(decodeAttendancePhoto('data:image/png;base64,'+logoPng().toString('base64')).mime,'image/png');
 for(const value of ['fixture','data:image/png;base64,AAAA','data:image/jpeg;base64,'+logoPng().toString('base64'),'x'.repeat(2800001)])assert.throws(()=>decodeAttendancePhoto(value));
});
test('notification visibility follows current capabilities, employee scope and exact personal recipient',()=>{
 const manager=user({scope:'selected',employee_ids:['other'],modules:{attendance:['view']}});
 const notice={recipient_role:'hr_manager',employee_id:'other',link_url:'/attendance'};
 assert.equal(notificationVisible(manager,notice),true);
 assert.equal(notificationVisible(user(),notice),false);
 assert.equal(notificationVisible(manager,{...notice,employee_id:'outside'}),false);
 assert.equal(notificationVisible(manager,{...notice,employee_id:null}),false);
 assert.equal(notificationVisible(manager,{...notice,recipient_user_id:'another-user'}),false);
 assert.equal(notificationVisible({...manager,is_owner:true},{...notice,recipient_user_id:'another-user'}),false);
});
test('generated documents enforce scope, sensitive salary and employee issued-only visibility',()=>{
 const doc={employee_id:'other',status:'COMPLETED_AND_ISSUED',generated_snapshot:{new_salary:0}};
 const manager=user({scope:'selected',employee_ids:['other'],modules:{documents:['view']}});
 assert.equal(canOpenDocument(manager,doc),false);
 assert.equal(canOpenDocument(user({...manager.access,sensitive:{salary:true}}),doc),true);
 assert.equal(canOpenDocument(user(),{...doc,employee_id:'self'}),true);
 assert.equal(canOpenDocument(user(),{...doc,employee_id:'self',status:'PENDING_BOSS'}),false);
 assert.equal(canOpenDocument(user(),doc),false);
});
test('password change and disable revoke saved sessions; stale credentials cannot issue another session',async()=>{
 const id=await account(),a=crypto.randomUUID(),b=crypto.randomUUID();
 await q('SELECT hr_create_auth_session($1,$2,$3)',[id,'hash',a]);await q('SELECT hr_create_auth_session($1,$2,$3)',[id,'hash',b]);
 await q("UPDATE sys_users SET password_hash='new-hash' WHERE id=$1",[id]);
 assert.equal((await q('SELECT count(*)::int n FROM hr_auth_sessions WHERE user_id=$1 AND revoked_at IS NOT NULL',[id]))[0].n,2);
 await assert.rejects(q('SELECT hr_create_auth_session($1,$2,$3)',[id,'hash',crypto.randomUUID()]),/Credentials changed/);
 const c=crypto.randomUUID();await q('SELECT hr_create_auth_session($1,$2,$3)',[id,'new-hash',c]);
 await q('UPDATE sys_users SET is_active=false WHERE id=$1',[id]);assert((await q('SELECT revoked_at FROM hr_auth_sessions WHERE id=$1',[c]))[0].revoked_at);
 await assert.rejects(q('SELECT hr_create_auth_session($1,$2,$3)',[id,'new-hash',crypto.randomUUID()]),/Credentials changed/);
 const privileges=await q("SELECT has_table_privilege('anon','hr_auth_sessions','SELECT') a,has_table_privilege('authenticated','hr_notification_receipts','SELECT') b");assert.equal(privileges[0].a,false);assert.equal(privileges[0].b,false);
});
test('reading or dismissing a shared notification never changes another account receipt',async()=>{
 const a=await account(),b=await account(),id=(await q("INSERT INTO system_notifications(recipient_role,title) VALUES('All','Shared notice') RETURNING id"))[0].id;
 await q('SELECT hr_record_notification_receipt($1,$2,false)',[a,id]);await q('SELECT hr_record_notification_receipt($1,$2,true)',[a,id]);
 assert.equal((await q('SELECT count(*)::int n FROM hr_notification_receipts WHERE user_id=$1',[b]))[0].n,0);
 assert.equal((await q('SELECT is_read FROM system_notifications WHERE id=$1',[id]))[0].is_read,false);
 assert((await q('SELECT dismissed_at FROM hr_notification_receipts WHERE user_id=$1',[a]))[0].dismissed_at);
});
test('personal-only staff can vote for another active colleague, once per Bangkok month',async()=>{
 const own=await employee(),other=await employee(),id=await account(own);
 const policy={...emptyPolicy(),personal:['voting']};await q('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[id,JSON.stringify(policy)]);
 await q('SELECT * FROM hr_submit_peer_vote($1,$2,4,$3)',[id,other,'Useful feedback']);
 await assert.rejects(q('SELECT * FROM hr_submit_peer_vote($1,$2,4,NULL)',[id,other]),/already voted/);
 await assert.rejects(q('SELECT * FROM hr_submit_peer_vote($1,$2,4,NULL)',[id,own]),/another employee/);
 await q("UPDATE hr_access_policies SET policy=jsonb_set(policy,'{personal}','[]') WHERE user_id=$1",[id]);
 await assert.rejects(q('SELECT * FROM hr_submit_peer_vote($1,$2,4,NULL)',[id,other]),/permission/);
 const count=(await q('SELECT count(*)::int n FROM peer_voting_records'))[0].n;assert.equal(count,1);
 await db.exec(await readFile(new URL('../../supabase/013_medium_priority.sql',import.meta.url),'utf8'));
 assert.equal((await q('SELECT count(*)::int n FROM peer_voting_records'))[0].n,1);
});
test('bounded attachment middleware rejects oversized files and excess file counts with JSON errors',async()=>{
 const app=express();app.post('/',receiveHrFile('file',{maxBytes:1024}),(req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  const normal=new FormData();normal.append('file',new Blob(['proof']),'proof.txt');assert.equal((await fetch(url,{method:'POST',body:normal})).status,200);
  const large=new FormData();large.append('file',new Blob([new Uint8Array(1025)]),'proof.txt');const response=await fetch(url,{method:'POST',body:large});assert.equal(response.status,413);assert.match(response.headers.get('content-type'),/json/);
  const multiple=new FormData();multiple.append('file',new Blob(['one']),'one.txt');multiple.append('file',new Blob(['two']),'two.txt');assert.equal((await fetch(url,{method:'POST',body:multiple})).status,400);
 }finally{await new Promise(r=>server.close(r));}
});
