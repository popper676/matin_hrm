import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {normalizeExpenseRouting,expenseRoutePolicy,EXPENSE_ROUTE_STAGES} from '../../shared/expenseRouting.js';
let db,owner,employee,agm,ceo,finance,config;
const sql=async(q,p=[])=>(await db.query(q,p)).rows;
const input=amount=>({business_unit:'UYF',category:'Office/Admin',description:'Reviewed operating expense',purpose:'Business operation',vendor:'Example vendor',expense_date:'2026-10-21',required_payment_date:'2026-10-21',urgency:'Normal',payment_method:'Cash',currency:'THB',requested_amount:String(amount)});
const save=async(value=config,actor=owner)=>{const version=(await sql('SELECT version FROM hr_expense_routing'))[0].version;return(await sql('SELECT * FROM hr_save_expense_routing($1,$2,$3)',[actor,JSON.stringify(value),version]))[0];};
const route=async(amount,currency='THB',requester=employee.user)=>(await sql('SELECT hr_expense_route($1,$2,$3) r',[requester,currency,amount]))[0].r;
const submit=async(amount,key=crypto.randomUUID())=>(await sql('SELECT * FROM hr_submit_expense_form($1,$2,$3) ',[employee.user,key,JSON.stringify(input(amount))]))[0];
const approval=async(row)=>(await sql('SELECT * FROM hr_approval_requests WHERE resource_id=$1',[row.id]))[0];
const decide=async(row,actor,decision,amount=null,payment=null)=>{
 const a=await approval(row);return(await sql('SELECT * FROM hr_decide_expense_form($1,$2,$3,$4,$5,$6,$7,$8)',[actor,a.id,decision,'Reviewed',a.version,amount,'',payment&&JSON.stringify(payment)]))[0];
};
before(async()=>{
 db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const name of (await readdir(new URL('../../supabase/',import.meta.url))).filter(n=>/^0(01|0[3-9]|1[0-6])_.*sql$/.test(n)).sort())await db.exec(await readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/019_smart_expense_form.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/020_expense_evidence_access.sql',import.meta.url),'utf8'));
 owner=(await sql("INSERT INTO sys_users(username,password_hash,role,is_owner) VALUES('completion-owner','hash','boss',true) RETURNING id"))[0].id;
 const account=async(name,actions=[])=>{const emp=(await sql('INSERT INTO "Employees"(employee_id,"Full_name",salary) VALUES($1,$1,1000) RETURNING id',[name]))[0].id;const user=(await sql("INSERT INTO sys_users(username,password_hash,role,employee_id) VALUES($1,'hash','employee',$2) RETURNING id",[name,emp]))[0].id;if(actions.length)await sql('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[user,JSON.stringify({modules:{rewards:actions},personal:['rewards'],scope:'all',sensitive:{}})]);return {emp,user};};
 employee=await account('completion-employee');agm=await account('completion-agm',['view','approve']);ceo=await account('completion-ceo',['view','approve']);finance=await account('completion-finance',['view','pay']);
 config={mode:'amount',limits:{THB:'5000.00',USD:'100.00'},stages:EXPENSE_ROUTE_STAGES.map(([key,label,action],i)=>({key,label,action,assignee_id:[agm.user,ceo.user,finance.user][i],alternate_id:owner}))};
});
after(async()=>{await db?.close();});
test('only Owner can activate amount routing; stale versions and malformed limits are rejected',async()=>{
 await assert.rejects(save(config,agm.user),/Owner/);
 for(const bad of [{...config,limits:{THB:-1}},{...config,limits:{THB:'NaN'}},{...config,limits:{THB:'5000.001'}},{...config,limits:{thb:5000}}]){assert.throws(()=>normalizeExpenseRouting(bad));await assert.rejects(save(bad),/limit/);}
 assert.throws(()=>normalizeExpenseRouting({...config,stages:config.stages.map((s,i)=>i===1?{...s,assignee_id:agm.user}:s)}),/different CEO/);
 const saved=await save();assert.equal(saved.mode,'amount');assert.equal(saved.version,2);
 await assert.rejects(sql('SELECT * FROM hr_save_expense_routing($1,$2,1)',[owner,JSON.stringify(config)]),/changed/);
});
test('threshold boundary, per-currency limits and unconfigured currency match the shared policy',async()=>{
 for(const [amount,currency,expected] of [[4999.99,'THB',false],[5000,'THB',false],[5000.01,'THB',true],[100,'USD',false],[100.01,'USD',true],[1,'MMK',true]]){
  const actual=await route(amount,currency);assert.equal(actual.policy.ceo_required,expected);assert.equal(actual.stages.some(s=>s.key==='ceo'),expected);assert.equal(actual.policy.ceo_required,expenseRoutePolicy(config,currency,amount).ceo_required);
 }
 await save({...config,limits:{THB:'0.00'}});assert.equal((await route(.01)).policy.ceo_required,true);await save();
});
test('within-limit AGM approval advances directly to payment; payment remains an independent authorized action',async()=>{
 const row=await submit(5000);assert.deepEqual((await approval(row)).stages.map(s=>s.key),['agm','finance']);
 await decide(row,agm.user,'approve',4500);assert.equal((await sql('SELECT status FROM rewards_and_claims WHERE id=$1',[row.id]))[0].status,'APPROVED');
 await assert.rejects(decide(row,agm.user,'pay',null,{amount:'4500',currency:'THB',date:'2026-10-21',method:'Cash',reference:'Ref'}),/assigned/);
 await decide(row,finance.user,'pay',null,{amount:'4500',currency:'THB',date:'2026-10-21',method:'Cash',reference:'Recorded settlement'});
 assert.equal((await approval(row)).status,'paid');assert.equal((await sql('SELECT paid_amount FROM rewards_and_claims WHERE id=$1',[row.id]))[0].paid_amount,'4500');
});
test('a reduction by AGM cannot skip the CEO route selected from the original amount',async()=>{
 const row=await submit(8000);await decide(row,agm.user,'approve',100);const a=await approval(row);assert.equal(a.stages[a.current_stage].key,'ceo');assert.equal((await sql('SELECT status FROM rewards_and_claims WHERE id=$1',[row.id]))[0].status,'PENDING');
 await decide(row,ceo.user,'approve',100);assert.equal((await sql('SELECT status FROM rewards_and_claims WHERE id=$1',[row.id]))[0].status,'APPROVED');
});
test('settings changes retain submitted routes, original thresholds and idempotent request numbering',async()=>{
 const key=crypto.randomUUID(),row=await submit(8000,key),prior=await approval(row);await save({...config,limits:{THB:'20000.00'}});
 const replay=await submit(8000,key);assert.equal(replay.id,row.id);assert.equal(replay.request_number,row.request_number);const old=(await sql('SELECT form_snapshot FROM rewards_and_claims WHERE id=$1',[row.id]))[0].form_snapshot;
 assert.equal(Number(old.routing.agm_limit),5000);assert.deepEqual((await approval(row)).stages,prior.stages);assert.equal((await route(8000)).policy.ceo_required,false);await save();
});
test('own requests use an independent alternate and revoked reviewers cannot decide',async()=>{
 const own=await route(8000,'THB',agm.user);assert.equal(own.stages[0].assignee_id,owner);
 const row=await submit(8000);await sql('UPDATE sys_users SET is_active=false WHERE id=$1',[agm.user]);await assert.rejects(decide(row,agm.user,'approve',8000),/disabled/);await sql('UPDATE sys_users SET is_active=true WHERE id=$1',[agm.user]);
 const missing={...config,stages:config.stages.map((s,i)=>i===0?{...s,alternate_id:null}:s)};await save(missing);await assert.rejects(route(8000,'THB',agm.user),/independent/);await save();
});
test('the original four-stage workflow remains selectable and every form retains its own route',async()=>{
 const stages=[['department','Department'],['agm','AGM'],['coo','COO'],['finance','Finance']].map(([key,label],i)=>({key,label,action:i===3?'pay':'approve',assignee_id:i===3?finance.user:owner,alternate_id:null}));
 await sql("INSERT INTO hr_workflow_settings(workflow_key,enabled,stages) VALUES('expense',true,$1) ON CONFLICT(workflow_key) DO UPDATE SET enabled=true,stages=excluded.stages",[JSON.stringify(stages)]);
 await save({mode:'standard',limits:{},stages:[]});const row=await submit(8000);assert.deepEqual((await approval(row)).stages.map(s=>s.key),['department','agm','coo','finance']);
 for(let i=0;i<3;i++)await decide(row,owner,'approve',8000);assert.equal((await sql('SELECT status FROM rewards_and_claims WHERE id=$1',[row.id]))[0].status,'APPROVED');await save();
});
test('MOD-004 expense requests do not need budgets or attachments and database enforces smart fields',async()=>{
 const request={business_unit:'UYF',category:'Office/Admin',description:'Quick demo purchase',expense_date:'2026-10-22',urgency:'Normal',currency:'THB',requested_amount:'120'};
 const send=async(i)=>sql('SELECT * FROM hr_submit_expense_form($1,$2,$3)',[employee.user,crypto.randomUUID(),JSON.stringify(i)]);
 const saved=(await send(request))[0];
 assert.equal(saved.form_snapshot.budget_remaining,undefined);
 assert.equal(saved.form_snapshot.documents.length,0);
 assert.equal(saved.form_snapshot.input.requested_amount,'120');
 await assert.rejects(send({...request,category:'Travel & Transportation'}),/Travel requires/);
 await assert.rejects(send({...request,urgency:'Urgent'}),/Urgent requests require/);
 const trip=(await send({...request,category:'Travel & Transportation',destination:'Chiang Mai',travel_date:'2026-10-23'}))[0];
 assert.equal(trip.form_snapshot.input.destination,'Chiang Mai');
 const legacy=(await sql("SELECT count(*)::int n FROM rewards_and_claims WHERE form_snapshot ? 'budget_remaining'"))[0].n;
 assert(legacy>=0);
});
test('016 reruns preserve requests and routing settings; browser roles cannot alter or execute policy helpers',async()=>{
 const prior=(await sql('SELECT version FROM hr_expense_routing'))[0].version,number=(await sql('SELECT count(*)::int n FROM rewards_and_claims'))[0].n;
 await db.exec(await readFile(new URL('../../supabase/016_hr_completion.sql',import.meta.url),'utf8'));assert.equal((await sql('SELECT version FROM hr_expense_routing'))[0].version,prior);assert.equal((await sql('SELECT count(*)::int n FROM rewards_and_claims'))[0].n,number);
 for(const role of ['anon','authenticated']){
  assert.equal((await sql("SELECT has_table_privilege($1,'hr_expense_routing','UPDATE') allowed",[role]))[0].allowed,false);
  assert.equal((await sql("SELECT has_function_privilege($1,'hr_save_expense_routing(uuid,jsonb,integer)','EXECUTE') allowed",[role]))[0].allowed,false);
  assert.equal((await sql("SELECT has_function_privilege($1,'hr_expense_route(uuid,text,numeric,jsonb)','EXECUTE') allowed",[role]))[0].allowed,false);
 }
});
test('built-in guides have matching language coverage, valid app links and synchronized downloads',async()=>{
 const {default:guides}=await import('../../shared/systemGuides.json',{with:{type:'json'}});
 const app=await readFile(new URL('../../hrm-client/src/App.jsx',import.meta.url),'utf8'),paths=new Set([...app.matchAll(/path="([^"]+)"/g)].map(m=>m[1]));
 for(const [audience,topics]of Object.entries(guides)){
  assert(topics.length>=10);assert.equal(new Set(topics.map(t=>t.id)).size,topics.length);
  for(const topic of topics){assert(paths.has(topic.href),topic.href);assert(topic.title.en&&topic.title.my);assert.equal(topic.steps.en.length,topic.steps.my.length);}
  for(const language of ['en','my']){
   const file=audience.toUpperCase()+'_GUIDE_'+language.toUpperCase()+'.md';
   const doc=await readFile(new URL('../../docs/guides/'+file,import.meta.url),'utf8'),download=await readFile(new URL('../../hrm-client/public/guides/'+file,import.meta.url),'utf8');
   assert.equal(doc,download);for(const topic of topics)for(const step of topic.steps[language])assert(doc.includes(step),'Guide includes the current implemented steps');
  }
 }
});
