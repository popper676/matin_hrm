import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {blankWarning,cleanWarning,cleanWarningResponse,warningToday} from '../../shared/warningForm.js';
import {warningView} from '../lib/warningForms.js';
const complete=()=>({...blankWarning(),level:'first',incident_date:warningToday(),location:'Office',description:'Documented incident reviewed by a human.',policy:'Attendance SOP section 2',categories:['attendance'],actions:['correct','policies'],target_date:warningToday()});
async function setup(){
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const f of ['001_fresh_hr_schema.sql','003_recruitment_openings.sql','004_people_access_approvals.sql','005_employee_information.sql','006_leave_forms.sql','007_expense_forms.sql','008_probation_forms.sql','009_warning_forms.sql'])await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
 const e=(await db.query('INSERT INTO "Employees"(employee_id,"Full_name",salary) VALUES($1,$2,1000) RETURNING id',['WARN-001','Synthetic Employee'])).rows[0].id;
 const owner=(await db.query("INSERT INTO sys_users(username,password_hash,full_name,role,is_owner) VALUES('owner','hash','Owner','boss',true) RETURNING id")).rows[0].id;
 const employee=(await db.query("INSERT INTO sys_users(username,password_hash,full_name,role,employee_id) VALUES('subject','hash','Employee','employee',$1) RETURNING id",[e])).rows[0].id;
 const reviewer=(await db.query("INSERT INTO sys_users(username,password_hash,full_name,role) VALUES('reviewer','hash','Reviewer','employee') RETURNING id")).rows[0].id;
 const policy={modules:{warnings:['view','create','edit','approve']},scope:'selected',employee_ids:[e],personal:[],sensitive:{}};
 await db.query('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2),($3,$4)',[reviewer,JSON.stringify(policy),employee,JSON.stringify({modules:{},scope:'own',personal:['warnings']})]);
 const stages=['supervisor','hr'].map((key,i)=>({key,label:key,action:'approve',assignee_id:i?reviewer:owner,alternate_id:i?owner:reviewer}));
 await db.query("INSERT INTO hr_workflow_settings(workflow_key,stages,enabled) VALUES('warning',$1,true)",[JSON.stringify(stages)]);
 const get=async id=>(await db.query('SELECT * FROM hr_warning_forms WHERE id=$1',[id])).rows[0];
 const route=async id=>(await db.query("SELECT * FROM hr_approval_requests WHERE resource_id=$1 AND workflow_key='warning'",[id])).rows[0];
 const save=async(d=complete(),id=crypto.randomUUID(),version=0,actor=owner)=>(await db.query('SELECT * FROM hr_save_warning($1,$2,$3,$4,$5)',[actor,id,e,JSON.stringify(d),version])).rows[0];
 const submit=async r=>(await db.query('SELECT * FROM hr_submit_warning($1,$2,$3)',[owner,r.id,r.version])).rows[0];
 const decide=async(id,actor,issue=null,hr=null,decision='approve',comment='Reviewed')=>{const a=await route(id);return (await db.query('SELECT * FROM hr_decide_warning($1,$2,$3,$4,$5,$6,$7)',[actor,a.id,decision,comment,a.version,issue&&JSON.stringify(issue),hr&&JSON.stringify(hr)])).rows[0];};
 const issue=()=>({informed_date:warningToday(),explanation_note:'Discussed facts, expectations and employee opportunity to respond.',opportunity_confirmed:true,delivery:'portal'});
 const hr=()=>({file_reference:'HR-WARN-001',review_date:warningToday(),notes:'Private HR follow-up entry'});
 return {db,e,owner,employee,reviewer,policy,stages,get,route,save,submit,decide,issue,hr};
}
test('warning validates human-selected facts, dates, categories, corrective actions and receipt without agreement',()=>{
 assert.equal(cleanWarning(complete(),true).level,'first');assert.throws(()=>cleanWarning({...complete(),level:''},true),/Complete/);
 assert.throws(()=>cleanWarning({...complete(),categories:['other']},true),/other category/);
 assert.throws(()=>cleanWarning({...complete(),previous_action:'written'},true),/previous action/);
 assert.throws(()=>cleanWarning({...complete(),actions:[]},true),/corrective/);
 assert.throws(()=>cleanWarning({...complete(),incident_date:'2099-01-01'},true),/Incident/);
 assert.throws(()=>cleanWarningResponse({acknowledged:true,signature:'Employee'}),/explanation/);
 assert.equal(cleanWarningResponse({comments:'I disagree with the facts.'}).acknowledged,false);
});
test('warning records two human reviews, private HR notes, employee disagreement and separate receipt, preserving records on rerun',async()=>{
 const t=await setup();const {db,owner,reviewer,employee,e}=t;try{
  let r=await t.save();assert.equal(warningView({id:employee,employee_id:e,access:{personal:['warnings']}},r,null),null);
  assert.equal(warningView({id:'other',access:{modules:{documents:['view']},scope:'all'}},r,null),null);
  r=await t.submit(r);assert.match(r.letter_number,/UYF-WARN-\d{4}-00001/);
  await assert.rejects(t.save(complete(),r.id,r.version),/cannot be edited/);
  await assert.rejects(t.decide(r.id,employee),/own warning/);await assert.rejects(t.decide(r.id,reviewer),/assigned/);
  await t.decide(r.id,owner);assert.equal((await t.get(r.id)).status,'pending');
  await assert.rejects(t.decide(r.id,reviewer,{...t.issue(),opportunity_confirmed:false},t.hr()),/opportunity/);
  await t.decide(r.id,reviewer,t.issue(),t.hr());r=await t.get(r.id);assert.equal(r.status,'issued');
  const a=await t.route(r.id);assert.equal(a.history.length,2);
  assert.equal(warningView({id:owner,is_owner:true},r,a).hr_records.length,1);
  assert.equal(warningView({id:reviewer,access:t.policy},r,a).hr_records.length,1);
  const subject={id:employee,employee_id:e,access:{personal:['warnings']}},copy=warningView(subject,r,a);assert(!('hr_records' in copy));
  await db.query('SELECT hr_respond_warning($1,$2,$3,$4)',[employee,r.id,JSON.stringify({comments:'I disagree and request that my explanation is retained.'}),r.version]);r=await t.get(r.id);assert(r.employee_comment);assert.equal(r.acknowledgment,null);
  await db.query('SELECT hr_respond_warning($1,$2,$3,$4)',[employee,r.id,JSON.stringify({acknowledged:true,explained:true,opportunity:true,signature:'Synthetic Employee'}),r.version]);r=await t.get(r.id);assert(r.acknowledgment);assert(r.employee_comment.comments.includes('disagree'));
  await assert.rejects(db.query('SELECT hr_respond_warning($1,$2,$3,$4)',[employee,r.id,JSON.stringify({comments:'replace'}),r.version]),/already recorded/);
  await db.query('SELECT hr_warning_hr_record($1,$2,$3,$4,$5)',[reviewer,r.id,'follow-up',JSON.stringify({...t.hr(),notes:'Review completed; improvement observed.'}),r.version]);r=await t.get(r.id);assert.equal(r.hr_records.length,2);
  await assert.rejects(db.query('UPDATE hr_warning_forms SET data=$1 WHERE id=$2',['{}',r.id]),/assigned warning/);
  await assert.rejects(db.query('DELETE FROM hr_approval_requests WHERE id=$1',[a.id]),/complete warning/);
  await db.exec(await readFile(new URL('../../supabase/009_warning_forms.sql',import.meta.url),'utf8'));assert.equal((await t.get(r.id)).hr_records.length,2);
  assert.equal((await db.query('SELECT salary,status FROM "Employees" WHERE id=$1',[e])).rows[0].status,'Active');
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','hr_decide_warning(uuid,uuid,text,text,integer,jsonb,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
test('warning blocks revoked permissions and legacy decisions, uses alternates and records outside receipt without impersonating employee',async()=>{
 const t=await setup();try{
  let r=await t.submit(await t.save());await t.decide(r.id,t.owner);const a=await t.route(r.id);
  await t.db.query('UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2',[JSON.stringify({...t.policy,modules:{warnings:['view'],documents:['view','approve']}}),t.reviewer]);
  await assert.rejects(t.decide(r.id,t.reviewer,t.issue(),t.hr()),/permission/);
  await assert.rejects(t.db.query('SELECT hr_decide_approval($1,$2,$3,$4,$5)',[t.reviewer,a.id,'approve','Legacy attempt',a.version]),/complete warning/);
  await t.db.query('UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2',[JSON.stringify(t.policy),t.reviewer]);
  await t.db.query('UPDATE sys_users SET is_active=false WHERE id=$1',[t.employee]);
  await assert.rejects(t.decide(r.id,t.reviewer,t.issue(),t.hr()),/Enable the employee/);
  await assert.rejects(t.decide(r.id,t.reviewer,{...t.issue(),delivery:'offline'},t.hr()),/outside delivery/);
  await t.decide(r.id,t.reviewer,{...t.issue(),delivery:'offline',delivered_on:warningToday(),delivery_reference:'Paper delivery DOC-001'},t.hr());r=await t.get(r.id);
  await t.db.query('SELECT hr_warning_hr_record($1,$2,$3,$4,$5)',[t.reviewer,r.id,'record-receipt',JSON.stringify({status:'refused',received_date:warningToday(),reference:'Witness record DOC-002',confirmed:true,comments:'Employee declined to sign.'}),r.version]);r=await t.get(r.id);
  assert.equal(r.acknowledgment,null);assert.equal(r.external_receipts[0].status,'refused');assert.equal(r.external_receipts[0].actor_id,t.reviewer);
  await assert.rejects(t.db.query('SELECT hr_warning_hr_record($1,$2,$3,$4,$5)',[t.reviewer,r.id,'follow-up',JSON.stringify({...t.hr(),notes:'Stale'}),1]),/changed/);
  // A subject assigned by Owner uses an independent alternate, never their own signature.
  await t.db.query('UPDATE sys_users SET is_active=true WHERE id=$1',[t.employee]);
  await t.db.query('UPDATE hr_workflow_settings SET stages=$1 WHERE workflow_key=$2',[JSON.stringify(t.stages.map(s=>({...s,assignee_id:t.employee,alternate_id:t.owner}))), 'warning']);
  const second=await t.submit(await t.save({...complete(),level:'second',previous_action:'written',previous_details:r.letter_number}));assert.equal((await t.route(second.id)).stages[0].assignee_id,t.owner);
  assert(second.letter_number.endsWith('00002'));assert.equal((await t.get(r.id)).data.level,'first');
 }finally{await t.db.close();}
});
test('warning returns with a reason, retains the original and never infers escalation or changes employment',async()=>{
 const t=await setup();try{
  const r=await t.submit(await t.save());await assert.rejects(t.decide(r.id,t.owner,null,null,'reject',''),/reason/);
  await t.decide(r.id,t.owner,null,null,'reject','Please verify the incident evidence.');assert.equal((await t.get(r.id)).status,'rejected');
  const corrected=await t.submit(await t.save());assert.equal(corrected.data.level,'first');assert.notEqual(corrected.letter_number,r.letter_number);
  await assert.rejects(t.save(complete(),crypto.randomUUID(),0,t.employee),/independent/);
  const row=(await t.db.query('SELECT salary,status FROM "Employees" WHERE id=$1',[t.e])).rows[0];assert.equal(Number(row.salary),1000);assert.equal(row.status,'Active');
 }finally{await t.db.close();}
});
