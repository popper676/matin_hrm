import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {cleanAssignments,allocateCents,assignmentAt,probationEnd,todayBangkok,OPERATIONS_DEFAULTS} from '../../shared/operations.js';
import {monthlyReview} from '../lib/monthlyReview.js';
import {buildOperationsTasks} from '../lib/operationsTasks.js';
import {employee360} from '../lib/employee360.js';
const uid=()=>crypto.randomUUID();
function fixture(){
 const e=uid(),other=uid(),owner={id:uid(),is_owner:true,access:{modules:{},personal:[],scope:'all',sensitive:{}}},viewer={id:uid(),employee_id:null,is_owner:false,access:{modules:{today:['view'],employees:['view'],probation:['view'],warnings:['view'],payroll:['view'],'monthly-review':['view'],rewards:['view']},personal:[],scope:'selected',employee_ids:[e],sensitive:{salary:true,identity:false}}};
 const data=Object.fromEntries(['employees','departments','positions','approvals','information','profiles','attendance','leaves','payrolls','expenses','probations','warnings','handovers','onboarding','offboarding','sops','career','businesses','assignments','receipts'].map(k=>[k,[]]));
 data.businesses=[{key:'UYF',name:'UYF',is_active:true},{key:'AI_AUTONO',name:'AI Autono',is_active:true}];
 data.employees=[{id:e,employee_id:'OPS-001',Full_name:'Shared Employee',status:'Active',employment_status:'Active',hire_date:'2026-01-01',probation_period:'6 months',salary:3000,created_at:'2026-01-01T00:00:00Z'},{id:other,Full_name:'HIDDEN PERSON',status:'Active',hire_date:'2026-01-01',probation_period:'6 months',salary:999999,created_at:'2026-01-01T00:00:00Z'}];
 data.profiles=[{employee_id:e,data:{visa_expiry_date:'2026-10-25',bank_account_no:'PRIVATE BANK'}},{employee_id:other,data:{visa_expiry_date:'2026-10-25'}}];
 data.assignments=[{id:uid(),employee_id:e,effective_from:'2026-01-01',version:1,items:[{business_key:'UYF',role:'Shared',allocation_percent:60},{business_key:'AI_AUTONO',role:'Shared',allocation_percent:40}],note:''}];
 data.payrolls=[{id:uid(),employee_id:e,month:'2026-09',basic_salary:3000,allowances:0,deductions:0,bonus:0,net_salary:3000,payment_status:'Paid'},{id:uid(),employee_id:e,month:'2026-10',basic_salary:3000,allowances:100,deductions:0,bonus:0,net_salary:3100,payment_status:'Pending'},{id:uid(),employee_id:other,month:'2026-10',net_salary:999999,payment_status:'Pending'}];
 const expense=(id,currency,docs=[])=>({id,employee_id:e,claim_type:'Expense Claim',status:'APPROVED',form_version:2,requested_amount:100,approved_amount:90,paid_amount:null,currency,created_at:'2026-10-01T00:00:00Z',form_snapshot:{input:{business_unit:'UYF',expense_date:'2026-10-01',required_payment_date:'2026-10-10'},documents:docs}});
 data.expenses=[expense(uid(),'THB'),expense(uid(),'USD',[{id:uid(),name:'quotation.pdf'}])];
 data.probations=[{id:uid(),employee_id:e,creator_id:owner.id,status:'pending',anchor:{hire_date:'2026-01-01',current_end:'2026-10-30'},employee_snapshot:{name:'Shared Employee'},self_invited_at:'2026-10-01',self_due_date:'2026-10-25',self_response:null,created_at:'2026-10-01T00:00:00Z'}];
 data.warnings=[{id:uid(),employee_id:e,status:'issued',data:{target_date:'2026-10-18',level:'first'},hr_records:[{review_date:'2026-10-18',notes:'PRIVATE HR NOTES'}],external_receipts:[],issued_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z'}];
 return {e,other,owner,viewer,data};
}
async function setup(){
 const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const f of ['001_fresh_hr_schema.sql','003_recruitment_openings.sql','004_people_access_approvals.sql','005_employee_information.sql','006_leave_forms.sql','007_expense_forms.sql','008_probation_forms.sql','009_warning_forms.sql','010_hr_operations.sql'])await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
 const owner=(await db.query("INSERT INTO sys_users(username,password_hash,role,is_owner,is_active) VALUES('owner','hash','boss',true,true) RETURNING id")).rows[0].id,e=(await db.query('INSERT INTO "Employees"(employee_id,"Full_name",salary) VALUES($1,$2,3000) RETURNING id',['OPS-001','Shared Employee'])).rows[0].id,viewer=(await db.query("INSERT INTO sys_users(username,password_hash,role,is_active) VALUES('viewer','hash','employee',true) RETURNING id")).rows[0].id;
 const policy={modules:{employees:['view','edit']},personal:[],scope:'selected',employee_ids:[e],sensitive:{salary:false}};await db.query('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[viewer,JSON.stringify(policy)]);
 return {db,owner,e,viewer,policy};
}
test('historical business shares stay intact while payroll is consolidated and only expenses use business tags',()=>{
 assert.equal(probationEnd('2026-01-31','3 months'),'2026-04-29');assert.equal(probationEnd('2024-02-29','6 months'),'2024-08-28');assert.equal(probationEnd('2026-01-01','unknown'),null);
 assert.throws(()=>cleanAssignments({effective_from:'2026-10-20',items:[{business_key:'UYF',allocation_percent:50}],version:0}),/100%/);
 const items=[{business_key:'UYF',allocation_percent:33.33},{business_key:'AI_AUTONO',allocation_percent:33.33},{business_key:'WISE_INVEST',allocation_percent:33.34}];
 for(const cents of [1,2,101,310001,99999999999999,-101])assert.equal(allocateCents(cents,items).reduce((s,r)=>s+r.cents,0),cents);
 assert.deepEqual(allocateCents(310000,[{business_key:'UYF',allocation_percent:null}]),[{business_key:'UNALLOCATED',cents:310000}]);
 const {e,viewer,data}=fixture(),r=monthlyReview(viewer,data,'2026-10','UYF');assert.equal(r.payroll.rows.length,1);assert.equal(r.payroll.current_total,3100);assert.equal(r.payroll.total_delta,100);assert.equal(r.payroll.rows[0].needs_explanation,true);assert.equal('costs' in r.payroll,false,'do not allocate salaries among expense business tags');
 assert.equal(monthlyReview(viewer,data,'2026-10','AI_AUTONO').payroll.current_total,3100,'business choice cannot change employee salary');
 assert.equal(monthlyReview(viewer,data,'2026-10','AI_AUTONO').expenses.rows.length,0,'expense view alone uses business tags');
 assert.equal(r.expenses.totals.length,2);assert.equal(r.expenses.totals.find(g=>g.currency==='THB').requested,100);assert.equal(r.expenses.rows.find(r=>r.currency==='USD').receipt_state,'needs_review');
 data.assignments.push({employee_id:e,effective_from:'2026-11-01',version:2,items:[]});assert.equal(assignmentAt(data.assignments,e,'2026-10-31').version,1);assert.equal(monthlyReview(viewer,data,'2026-10','UYF').payroll.current_total,3100);
});
test('Today, Employee 360 and monthly reports respect source scope, salary/identity fields and private warning records',()=>{
 const {viewer,data,e,owner}=fixture();const today='2026-10-20';let tasks=buildOperationsTasks(viewer,data,OPERATIONS_DEFAULTS,today);let serialized=JSON.stringify(tasks);assert(!serialized.includes('HIDDEN PERSON'));assert(!serialized.includes('PRIVATE BANK'));assert(!tasks.some(t=>t.kind==='visa_expiry_date'));assert(!tasks.some(t=>t.kind==='warning-followup'));
 const copy=employee360(viewer,data,e,'2026-10');assert(copy.sections.payroll);assert(!('expiry' in copy.sections));assert(!JSON.stringify(copy).includes('PRIVATE HR NOTES'));assert(!JSON.stringify(copy).includes('PRIVATE BANK'));
 const limited={...viewer,access:{...viewer.access,sensitive:{salary:false},modules:{...viewer.access.modules,payroll:['view']}}};assert.equal(monthlyReview(limited,data,'2026-10').payroll,null);assert(!('payroll' in employee360(limited,data,e,'2026-10').sections));assert(!('salary' in employee360(limited,data,e,'2026-10').employee));assert(!buildOperationsTasks(limited,data,OPERATIONS_DEFAULTS,today).some(t=>t.group==='payroll'));
 tasks=buildOperationsTasks(owner,data,OPERATIONS_DEFAULTS,today);assert(tasks.some(t=>t.kind==='visa_expiry_date'));assert(tasks.some(t=>t.kind==='warning-followup'));
 data.warnings[0].hr_records.push({review_date:'2026-10-20',review_completed:true});assert(!buildOperationsTasks(owner,data,OPERATIONS_DEFAULTS,today).some(t=>t.kind==='warning-followup'));
 const own={...viewer,employee_id:e,access:{modules:{},personal:['profile','probation','warnings'],scope:'own',sensitive:{}}};const self=employee360(own,data,e,'2026-10',true);assert(self.sections.probation);assert.equal(self.sections.warnings.length,1);assert(!('payroll' in self.sections));assert(!('salary' in self.employee));assert(!JSON.stringify(self).includes('PRIVATE HR NOTES'));
 data.warnings[0].status='pending';assert.equal(employee360(own,data,e,'2026-10',true).sections.warnings.length,0);
});
test('business catalog and immutable assignment history enforce Owner, scope, Salary, backdate and stale-version rules',async()=>{
 const {db,owner,e,viewer}=await setup();try{
  const day=todayBangkok(),data={key:'NEW_BRAND',name:'New brand',name_my:'',color:'#123456',is_active:true};await assert.rejects(db.query('SELECT * FROM hr_save_business_unit($1,$2,$3)',[viewer,JSON.stringify(data),0]),/Owner/);await db.query('SELECT * FROM hr_save_business_unit($1,$2,$3)',[owner,JSON.stringify(data),0]);
  const items=[{business_key:'UYF',role:'Shared',allocation_percent:60},{business_key:'NEW_BRAND',role:'Shared',allocation_percent:40}];await assert.rejects(db.query('SELECT * FROM hr_save_business_assignments($1,$2,$3,$4,$5,$6)',[viewer,e,day,JSON.stringify(items),'',0]),/Salary/);
  await db.query('SELECT * FROM hr_save_business_assignments($1,$2,$3,$4,$5,$6)',[owner,e,day,JSON.stringify(items),'Initial shares',0]);
  await assert.rejects(db.query('SELECT * FROM hr_save_business_assignments($1,$2,$3,$4,$5,$6)',[owner,e,day,'[]','stale',0]),/changed/);
  await assert.rejects(db.query('SELECT * FROM hr_save_business_assignments($1,$2,$3,$4,$5,$6)',[viewer,e,day,'[]','clear shares',1]),/Salary/);
  await assert.rejects(db.query('SELECT * FROM hr_save_business_assignments($1,$2,$3,$4,$5,$6)',[owner,e,'2026-01-01','[]','',1]),/backdate/);
  await db.query('SELECT * FROM hr_save_business_assignments($1,$2,$3,$4,$5,$6)',[owner,e,'2026-01-01','[]','Owner documented historical correction',1]);
  await assert.rejects(db.query('UPDATE hr_employee_business_sets SET items=$1 WHERE employee_id=$2',['[]',e]),/history is retained/);
  assert.equal(Number((await db.query('SELECT salary FROM "Employees" WHERE id=$1',[e])).rows[0].salary),3000);assert.equal((await db.query('SELECT count(*)::int n FROM payrolls')).rows[0].n,0);
  await db.query('SELECT * FROM hr_save_business_unit($1,$2,$3)',[owner,JSON.stringify({...data,is_active:false}),1]);await db.exec(await readFile(new URL('../../supabase/010_hr_operations.sql',import.meta.url),'utf8'));assert.equal((await db.query('SELECT is_active FROM hr_business_units WHERE key=$1',['NEW_BRAND'])).rows[0].is_active,false);assert.equal((await db.query('SELECT count(*)::int n FROM hr_employee_business_sets')).rows[0].n,2);
 }finally{await db.close();}
});
test('reminder delivery is disabled by default, deduplicated transactionally, and rejects revoked account versions',async()=>{
 const {db,owner,viewer}=await setup();try{
  const args=[viewer,1,'profile:test:2026-10-20',todayBangkok(),'HR reminder','Review your tasks','/today','{}'];let result=await db.query('SELECT hr_deliver_operations_reminder($1,$2,$3,$4,$5,$6,$7,$8)',args);assert.equal(result.rows[0].hr_deliver_operations_reminder,false);
  await db.query('SELECT * FROM hr_save_operations_settings($1,$2,$3)',[owner,JSON.stringify({...OPERATIONS_DEFAULTS,enabled:true}),1]);
  const attempts=await Promise.all([1,2].map(()=>db.query('SELECT hr_deliver_operations_reminder($1,$2,$3,$4,$5,$6,$7,$8)',args)));assert.deepEqual(attempts.map(r=>r.rows[0].hr_deliver_operations_reminder).sort(),[false,true]);
  await db.query('UPDATE hr_access_policies SET version=version+1 WHERE user_id=$1',[viewer]);result=await db.query('SELECT hr_deliver_operations_reminder($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,2),'another',...args.slice(3)]);assert.equal(result.rows[0].hr_deliver_operations_reminder,false);
  assert.equal((await db.query('SELECT count(*)::int n FROM system_notifications')).rows[0].n,1);
  await db.query('DELETE FROM system_notifications WHERE recipient_user_id=$1',[viewer]);assert.equal((await db.query('SELECT count(*)::int n FROM hr_reminder_deliveries')).rows[0].n,1);await db.query('UPDATE hr_access_policies SET version=1 WHERE user_id=$1',[viewer]);assert.equal((await db.query('SELECT hr_deliver_operations_reminder($1,$2,$3,$4,$5,$6,$7,$8)',args)).rows[0].hr_deliver_operations_reminder,false,'dismissing a notification must retain the deduplication record');
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','hr_deliver_operations_reminder(uuid,integer,text,date,text,text,text,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
