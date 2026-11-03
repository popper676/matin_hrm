import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {blankProbation,cleanProbation,cleanSelf,COMPETENCIES} from '../../shared/probationForm.js';
import {probationView} from '../lib/probationForms.js';
const today=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
function complete(period='6'){
 const d=blankProbation();Object.assign(d,{period,attendance:{working:100,present:96,absent:4,late:2,early:1,unexcused:1},attendance_rating:4,performance_rating:4,cultural_fit:4,growth:'High',strengths:'Clear communication',improvements:'Improve documentation',summary:'Human reviewer assessment',recommendation:'confirmed',late_reason:'Synthetic historical evaluation entered for policy tests'});
 d.competencies=Object.fromEntries(COMPETENCIES.map(([k])=>[k,{rating:4,comment:'Observed by evaluator'}]));return d;
}
async function setup(){
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const f of ['001_fresh_hr_schema.sql','003_recruitment_openings.sql','004_people_access_approvals.sql','005_employee_information.sql','006_leave_forms.sql','007_expense_forms.sql','008_probation_forms.sql'])await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
 await db.query("UPDATE hr_leave_calendar SET settings=$1 WHERE id",[JSON.stringify({weekly_holidays:[0],default_start:'09:00',default_end:'18:00'})]);
 const e=(await db.query('INSERT INTO "Employees"(employee_id,"Full_name",hire_date,salary) VALUES($1,$2,$3,1000) RETURNING id',['PROB-001','Synthetic Employee','2026-01-01'])).rows[0].id;
 const owner=(await db.query("INSERT INTO sys_users(username,password_hash,full_name,role,is_owner) VALUES('owner','hash','Owner','boss',true) RETURNING id")).rows[0].id;
 const employee=(await db.query("INSERT INTO sys_users(username,password_hash,full_name,role,employee_id) VALUES('subject','hash','Employee','employee',$1) RETURNING id",[e])).rows[0].id;
 const reviewer=(await db.query("INSERT INTO sys_users(username,password_hash,full_name,role) VALUES('reviewer','hash','Reviewer','employee') RETURNING id")).rows[0].id;
 const policy={modules:{probation:['view','create','edit','approve']},scope:'selected',employee_ids:[e],personal:[],sensitive:{salary:false}};
 await db.query('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2),($3,$4)',[reviewer,JSON.stringify(policy),employee,JSON.stringify({modules:{},scope:'own',personal:['probation'],sensitive:{salary:false}})]);
 const stages=['manager','department_head','hr'].map((key,i)=>({key,label:key,action:'approve',assignee_id:i===1?reviewer:owner,alternate_id:reviewer}));
 await db.query("INSERT INTO hr_workflow_settings(workflow_key,stages,enabled) VALUES('probation',$1,true)",[JSON.stringify(stages)]);
 const get=async id=>(await db.query('SELECT * FROM hr_probation_forms WHERE id=$1',[id])).rows[0];
 const route=async id=>(await db.query("SELECT * FROM hr_approval_requests WHERE resource_id=$1 AND workflow_key='probation'",[id])).rows[0];
 const save=async(d=complete(),id=crypto.randomUUID(),version=0)=>(await db.query('SELECT * FROM hr_save_probation($1,$2,$3,$4,$5)',[owner,id,e,JSON.stringify(d),version])).rows[0];
 const invite=async r=>(await db.query('SELECT * FROM hr_invite_probation($1,$2,$3,$4)',[owner,r.id,new Date(Date.now()+2*86400000).toISOString().slice(0,10),r.version])).rows[0];
 const respond=async r=>(await db.query('SELECT * FROM hr_respond_probation($1,$2,$3,$4)',[employee,r.id,JSON.stringify({status:'submitted',performance:'I completed my goals',challenges:'Time management',support:'More training',signature:'Synthetic Employee'}),r.version])).rows[0];
 const submit=async r=>(await db.query('SELECT * FROM hr_submit_probation($1,$2,$3)',[owner,r.id,r.version])).rows[0];
 const decide=async(id,actor,final=null,legal=null,salary=null,decision='approve',comment='Reviewed')=>{const a=await route(id);return (await db.query('SELECT * FROM hr_decide_probation($1,$2,$3,$4,$5,$6,$7,$8)',[actor,a.id,decision,comment,a.version,final&&JSON.stringify(final),legal&&JSON.stringify(legal),salary&&JSON.stringify(salary)])).rows[0];};
 return {db,e,owner,employee,reviewer,policy,stages,get,route,save,invite,respond,submit,decide};
}
const final=()=>({outcome:'confirmed',effective_date:today(),benefits_date:today(),late_reason:'Documenting the historical review',employment_status_updated:false});
test('probation validates all ten human ratings, reconciles attendance and preserves the choice to decline',()=>{
 assert.equal(cleanProbation(complete(),true).competencies.quality.rating,4);
 assert.throws(()=>cleanProbation({...complete(),competencies:{}},true),/every competency/);
 assert.throws(()=>cleanProbation({...complete(),attendance:{working:10,present:10,absent:1,late:0,early:0,unexcused:0}},true),/reconcile/);
 assert.throws(()=>cleanSelf({status:'submitted',signature:'Employee',confirmed:true}),/comments/);
 const declined=cleanSelf({status:'declined',signature:'Employee',confirmed:true,performance:'Do not share this draft'});assert.equal(declined.status,'declined');assert.equal(declined.performance,'');
});
test('probation records independent human reviews, private salary fields, immediate copies, receipt and written appeal',async()=>{
 const t=await setup();const {db,owner,employee,reviewer,e}=t;try{
  let r=await t.save();assert.equal(probationView({id:'other',access:{modules:{performance:['view']},scope:'all'}},r,null),null);assert.equal(r.anchor.original_end,'2026-06-30');assert.equal(r.anchor.max_extension_end,'2026-09-30');
  assert.equal(probationView({id:employee,employee_id:e,access:{personal:['probation']}},r,null),null);
  r=await t.invite(r);const restricted=probationView({id:employee,employee_id:e,access:{personal:['probation']}},r,null);assert(!('data' in restricted));assert(!('legal_review' in restricted));
  await assert.rejects(t.save(complete(),r.id,1),/changed/);r=await t.respond(r);r=await t.submit(r);
  const a=await t.route(r.id);await assert.rejects(db.query('SELECT hr_decide_approval($1,$2,$3,$4,$5)',[owner,a.id,'approve','',1]),/own request/);
  await assert.rejects(t.decide(r.id,employee),/own evaluation/);await assert.rejects(t.decide(r.id,reviewer),/assigned/);
  await t.decide(r.id,owner);
  await db.query('UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2',[JSON.stringify({...t.policy,modules:{...t.policy.modules,performance:['view','approve']}}),reviewer]);
  await assert.rejects(db.query('SELECT hr_decide_approval($1,$2,$3,$4,$5)',[reviewer,a.id,'approve','',2]),/complete probation/);
  await db.query('UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2',[JSON.stringify(t.policy),reviewer]);
  await t.decide(r.id,reviewer);
  await assert.rejects(t.decide(r.id,owner,{...final(),benefits_date:'2027-01-01'}),/benefits/);
  await t.decide(r.id,owner,final(),null,{kind:'adjusted',amount:2500,currency:'THB'});r=await t.get(r.id);
  assert.equal(r.status,'decided');assert(r.shared_at);assert(r.appeal_due>r.share_due);assert.equal((await t.route(r.id)).history.length,3);
  const snapshot=(await db.query('SELECT salary,status FROM "Employees" WHERE id=$1',[e])).rows[0];assert.equal(Number(snapshot.salary),1000);assert.equal(snapshot.status,'Active','The form records a human decision without mutating employment');
  const employeeCopy=probationView({id:employee,employee_id:e,access:{personal:['probation'],sensitive:{salary:false}}},r,await t.route(r.id));assert(employeeCopy.data);assert(!('salary_adjustment' in employeeCopy));
  const reviewerCopy=probationView({id:reviewer,access:t.policy},r,await t.route(r.id));assert(!('salary_adjustment' in reviewerCopy));
  await db.query('SELECT hr_probation_employee_action($1,$2,$3,$4,$5)',[employee,r.id,'acknowledge','{"confirmed":true}',r.version]);r=await t.get(r.id);
  await db.query('SELECT hr_probation_employee_action($1,$2,$3,$4,$5)',[employee,r.id,'appeal',JSON.stringify({statement:'Please reconsider the assessment evidence',signature:'Synthetic Employee'}),r.version]);r=await t.get(r.id);assert(r.appeal);
  await db.query('SELECT hr_reply_probation_appeal($1,$2,$3,$4)',[owner,r.id,'HR reviewed the written appeal and retained the decision.',r.version]);r=await t.get(r.id);assert(r.appeal_response);assert.equal(r.final_decision.outcome,'confirmed');
  await assert.rejects(db.query('UPDATE hr_probation_forms SET data=$1 WHERE id=$2',['{}',r.id]),/assigned probation/);
  await db.exec(await readFile(new URL('../../supabase/008_probation_forms.sql',import.meta.url),'utf8'));assert((await t.get(r.id)).appeal_response);
  await assert.rejects(t.save(),/already has a final/);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','hr_decide_probation(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
test('probation extension cap remains anchored across subsequent reviews and revoked reviewers cannot act',async()=>{
 const t=await setup();try{
  const d={...complete(),recommendation:'extended',reason:'Additional training needed',new_goals:'Complete training and review evidence',new_end:'2026-10-01'};
  let r=await t.save(d);r=await t.invite(r);r=await t.respond(r);await assert.rejects(t.submit(r),/half the original/);
  r=await t.save({...d,new_end:'2026-09-30'},r.id,r.version);r=await t.submit(r);await t.decide(r.id,t.owner);
  await t.db.query('UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2',[JSON.stringify({...t.policy,modules:{probation:['view']}}),t.reviewer]);await assert.rejects(t.decide(r.id,t.reviewer),/permission/);
  await t.db.query('UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2',[JSON.stringify(t.policy),t.reviewer]);await t.decide(r.id,t.reviewer);
  await assert.rejects(t.decide(r.id,t.owner,{...final(),outcome:'extended',reason:'Training',new_end:'2026-10-01',new_goals:'Training'}),/original cap/);
  await t.decide(r.id,t.owner,{...final(),outcome:'extended',reason:'Training',new_end:'2026-09-30',new_goals:'Training'});
  const next=await t.save({...d,new_end:'2026-10-01'});assert.equal(next.anchor.current_end,'2026-09-30');assert.equal(next.anchor.max_extension_end,'2026-09-30');
 }finally{await t.db.close();}
});
test('probation HR waits for the employee opportunity and requires completed legal review before termination release',async()=>{
 const t=await setup();try{
  let r=await t.save({...complete(),recommendation:'terminated',reason:'Human review of documented evidence'});r=await t.invite(r);r=await t.submit(r);await t.decide(r.id,t.owner);await t.decide(r.id,t.reviewer);
  const f={...final(),outcome:'terminated',reason:'Authorized human decision',opportunity_confirmed:true,no_response_note:'Employee invited'};
  await assert.rejects(t.decide(r.id,t.owner,f),/Allow the employee/);
  r=await t.get(r.id);await t.respond(r);
  await assert.rejects(t.decide(r.id,t.owner,f),/legal review/);
  await assert.rejects(t.decide(r.id,t.owner,f,{confirmed:true,reviewer:'Legal reviewer',reference:'SYN-LEGAL-001',date:'2099-01-01'}),/legal review/);
  await t.decide(r.id,t.owner,f,{confirmed:true,reviewer:'Legal reviewer',reference:'SYN-LEGAL-001',date:today()});r=await t.get(r.id);assert.equal(r.final_decision.outcome,'terminated');
  const own=probationView({id:t.employee,employee_id:t.e,access:{personal:['probation']}},r,await t.route(r.id));assert(!('legal_review' in own));assert(own.shared_at);
  await t.db.query('UPDATE sys_users SET is_active=false WHERE id=$1',[t.employee]);
  await t.db.query('SELECT hr_record_probation_appeal($1,$2,$3,$4)',[t.owner,r.id,JSON.stringify({statement:'Written appeal received by HR',signature:'Synthetic Employee',reference:'SYN-LETTER-001',received_date:today(),confirmed:true}),r.version]);r=await t.get(r.id);assert.equal(r.appeal.recorded_by,t.owner);
  await t.db.query('SELECT hr_reply_probation_appeal($1,$2,$3,$4)',[t.owner,r.id,'HR documented its response to the signed letter.',r.version]);
 }finally{await t.db.close();}
});
