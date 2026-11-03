import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {nextBirthday} from '../../shared/birthday.js';
import {shiftForDay} from '../../shared/shiftPolicy.js';
import {publicAppUrl} from '../lib/publicAppUrl.js';
let db,owner,employee;
const rows=async(q,args=[])=>(await db.query(q,args)).rows;
before(async()=>{
 db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const name of (await readdir(new URL('../../supabase/',import.meta.url))).filter(n=>/^0(01|0[3-9]|1[0-5])_.*sql$/.test(n)).sort())await db.exec(await readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 owner=(await rows("INSERT INTO sys_users(username,password_hash,role,is_owner) VALUES('audit-owner','hash','boss',true) RETURNING id"))[0].id;
 employee=(await rows('INSERT INTO "Employees"(employee_id,"Full_name",salary) VALUES(\'SQL-AUDIT\',\'SQL audit employee\',30000) RETURNING id'))[0].id;
});
after(async()=>{await db?.close();});
test('015 preserves existing records on rerun and its functions and dedup table deny browser roles',async()=>{
 await db.exec(await readFile(new URL('../../supabase/015_audit_integrity.sql',import.meta.url),'utf8'));
 assert.equal((await rows('SELECT salary FROM "Employees" WHERE id=$1',[employee]))[0].salary,'30000');
 const functions=await rows("SELECT oid::regprocedure::text signature FROM pg_proc WHERE proname IN ('hr_decide_handover','hr_pay_legacy_payroll','hr_apply_payroll_workspace','hr_import_employee','hr_update_import_employee','hr_create_lifecycle','hr_scan_qr','hr_notify_birthday')");
 assert.equal(functions.length,8);
 for(const f of functions)for(const role of ['anon','authenticated'])assert.equal((await rows('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,f.signature]))[0].allowed,false,f.signature);
 assert.equal((await rows("SELECT has_table_privilege('authenticated','hr_birthday_deliveries','SELECT') allowed"))[0].allowed,false);
});
test('import account collisions roll back employee, salary changes and timeline together',async()=>{
 await rows("INSERT INTO sys_users(username,password_hash,role) VALUES('collision','hash','employee')");
 await assert.rejects(rows('SELECT hr_import_employee($1,$2,$3,$4,$5,$6,$7)',[owner,'COLLISION','No orphan',1000,null,null,'MUST_CHANGE:$2b$hash']),/unique/);
 assert.equal((await rows('SELECT count(*)::int n FROM "Employees" WHERE employee_id=\'COLLISION\''))[0].n,0);
 await rows("INSERT INTO sys_users(username,password_hash,role,employee_id) VALUES('sql-audit','hash','employee',$1)",[employee]);
 await assert.rejects(rows('SELECT hr_update_import_employee($1,$2,$3,$4,$5,$6,$7)',[owner,employee,'COLLISION','Changed',0,null,null]),/unique/);
 const old=(await rows('SELECT employee_id,salary FROM "Employees" WHERE id=$1',[employee]))[0];assert.equal(old.employee_id,'SQL-AUDIT');assert.equal(Number(old.salary),30000);
});
test('a lifecycle checklist failure rolls back the entire case and onboarding preserves zero-day deadlines',async()=>{
 const before=(await rows('SELECT count(*)::int n FROM corporate_offboarding'))[0].n;
 await assert.rejects(rows('SELECT hr_create_lifecycle($1,$2,$3,$4)',[owner,'offboarding',JSON.stringify({employee_id:employee,last_working_date:'2026-11-01'}),JSON.stringify([{category:'knowledge_transfer',owner_role:'outgoing',is_required:true,sort_order:1}])]),/null value/);
 assert.equal((await rows('SELECT count(*)::int n FROM corporate_offboarding'))[0].n,before);
 assert.equal((await rows('SELECT count(*)::int n FROM offboarding_case_tasks'))[0].n,0);assert.equal((await rows('SELECT count(*)::int n FROM employee_handovers'))[0].n,0);
 await rows("INSERT INTO onboarding_tasks(task_name,due_days_after_hire) VALUES('Start today',0)");
 const record=(await rows('SELECT hr_create_lifecycle($1,$2,$3) r',[owner,'onboarding',JSON.stringify({employee_id:employee,start_date:'2026-10-21'})]))[0].r;
 assert.equal((await rows('SELECT due_date::text d FROM onboarding_assignments WHERE onboarding_id=$1',[record.id]))[0].d,'2026-10-21');
});
test('workspace enforces Create for a new month, Edit for an existing month and detects stale writes',async()=>{
 const actor=(await rows("INSERT INTO sys_users(username,password_hash,role) VALUES('workspace-reviewer','hash','employee') RETURNING id"))[0].id;
 const policy={scope:'selected',employee_ids:[employee],modules:{payroll:['view','create']},personal:[],sensitive:{salary:true}};
 await rows('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[actor,JSON.stringify(policy)]);
 const input={basic_salary:1000,allowances:20,deductions:10,bonus:0,net_salary:1010,notes:'Reviewed',workspace_notes:'Reviewed'};
 const apply=async(expected=null)=>(await rows('SELECT hr_apply_payroll_workspace($1,$2,$3,$4,$5,$6) r',[actor,employee,'2026-09',expected,JSON.stringify(input),'{}']))[0].r;
 const created=await apply();assert.equal(created.action,'created');
 await assert.rejects(apply(created.payroll.updated_at),/Create.*Edit/);
 await rows("UPDATE hr_access_policies SET policy=jsonb_set(policy,'{modules,payroll}','[\"view\",\"edit\"]') WHERE user_id=$1",[actor]);
 const updated=await apply(created.payroll.updated_at);assert.equal(updated.action,'updated');
 await assert.rejects(apply('2000-01-01'),/changed/);
 await assert.rejects(rows('SELECT hr_pay_legacy_payroll($1,$2,$3)',[actor,created.payroll.id,updated.payroll.updated_at]),/Pay/);
 const paid=(await rows('SELECT hr_pay_legacy_payroll($1,$2,$3) r',[owner,created.payroll.id,updated.payroll.updated_at]))[0].r;
 assert.equal(paid.net_salary,1010);assert.equal(paid.allowances,20);assert.equal(paid.payment_status,'Paid');
 await assert.rejects(rows('SELECT hr_pay_legacy_payroll($1,$2,$3)',[owner,paid.id,paid.updated_at]),/paid/);
});
test('the JS attendance selector matches the SQL calendar for weekday, null date ranges, exceptions and off days',async()=>{
 const shift=(await rows("INSERT INTO shifts(shift_name,start_time,end_time) VALUES('Audit night','22:00','06:00') RETURNING id"))[0].id;
 await rows('UPDATE "Employees" SET default_shift_id=$1 WHERE id=$2',[shift,employee]);
 await rows('INSERT INTO employee_rosters(employee_id,day_of_week,shift_id,is_off_day) VALUES($1,1,$2,true)',[employee,shift]);
 await rows("INSERT INTO hr_leave_calendar_dates(work_date,is_working) VALUES('2026-10-20',false)");
 await rows("INSERT INTO employee_daily_schedules(employee_id,schedule_date,shift_id,is_off_day) VALUES($1,'2026-10-20',$2,false)",[employee,shift]);
 const data={schedules:(await rows('SELECT *,schedule_date::text AS schedule_date FROM employee_daily_schedules WHERE employee_id=$1',[employee])),rosters:await rows('SELECT * FROM employee_rosters WHERE employee_id=$1',[employee]),shifts:await rows('SELECT *,start_time::text start_time,end_time::text end_time FROM shifts'),dates:await rows('SELECT *,work_date::text work_date FROM hr_leave_calendar_dates')};
 for(const day of ['2026-10-19','2026-10-20','2026-10-21']){
  const sql=(await rows('SELECT hr_leave_workday($1,$2) r',[employee,day]))[0].r;
  const js=shiftForDay({id:employee,default_shift_id:shift},day,data);
  assert.equal(!!js,sql.working,day);if(js)assert.equal(js.id,shift);
 }
});
test('birthday recurrence crosses New Year and observes February 29 on February 28 in a common year',()=>{
 assert.deepEqual(nextBirthday('2000-01-01','2026-12-30'),{date:'2027-01-01',days:2});
 assert.deepEqual(nextBirthday('2000-02-29','2027-02-27'),{date:'2027-02-28',days:1});
 assert.deepEqual(nextBirthday('2000-02-29','2028-02-28'),{date:'2028-02-29',days:1});
});
test('caption links use the canonical public app URL and reject credentials or non-web URLs',()=>{
 const prior={...process.env};try{
  process.env.PUBLIC_APP_URL='https://hr.example.test/apps/';process.env.APP_URL='https://old.example.test';assert.equal(publicAppUrl(),'https://hr.example.test/apps');
  for(const invalid of ['javascript:alert(1)','https://user:password@example.test']){process.env.PUBLIC_APP_URL=invalid;assert.throws(()=>publicAppUrl());}
 }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);}
});
test('literal translation keys exist in both languages and the catalogs have matching structure',async()=>{
 const root=new URL('../../hrm-client/src/',import.meta.url),catalogs={};
 for(const lang of ['en','my']){catalogs[lang]={};for(const f of await readdir(new URL('locales/'+lang+'/',root)))if(f.endsWith('.json'))catalogs[lang][f.slice(0,-5)]=JSON.parse(await readFile(new URL('locales/'+lang+'/'+f,root),'utf8'));}
 const flatten=(obj,prefix='')=>Object.entries(obj).flatMap(([k,v])=>v&&typeof v==='object'?flatten(v,prefix+k+'.'):[prefix+k]);
 assert.deepEqual(flatten(catalogs.en).sort(),flatten(catalogs.my).sort());
 const walk=async url=>{for(const e of await readdir(url,{withFileTypes:true})){if(e.isDirectory())await walk(new URL(e.name+'/',url));else if(/\.jsx?$/.test(e.name)){const text=await readFile(new URL(e.name,url),'utf8');for(const m of text.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)){for(const lang of ['en','my'])assert.notEqual(m[1].split('.').reduce((v,k)=>v?.[k],catalogs[lang]),undefined,lang+':'+m[1]);}}}};
 await walk(root);
});

test('failed QR cooldown preserves the token, and successful checkout consumes it exactly once',async()=>{
 const actor=(await rows('SELECT id FROM sys_users WHERE employee_id=$1',[employee]))[0].id;
 const open=(await rows("INSERT INTO attendance_records(employee_id,check_in,attendance_method) VALUES($1,now(),'Photo') RETURNING id",[employee]))[0].id;
 await rows("INSERT INTO qr_attendance_tokens(employee_id,token,expires_at) VALUES($1,'audit-atomic-qr',now()+interval '5 minutes')",[employee]);
 const scan=()=>rows('SELECT hr_scan_qr($1,$2,$3,$4,$5) r',[actor,'audit-atomic-qr',open,false,0]);
 await assert.rejects(scan(),/2 minutes/);assert.equal((await rows("SELECT used FROM qr_attendance_tokens WHERE token='audit-atomic-qr'"))[0].used,false);
 await rows("UPDATE attendance_records SET check_in=now()-interval '8 hours' WHERE id=$1",[open]);
 const result=(await scan())[0].r;assert.equal(result.action,'check-out');assert.equal(result.record.id,open);assert(result.record.check_out);
 assert.equal((await rows("SELECT used FROM qr_attendance_tokens WHERE token='audit-atomic-qr'"))[0].used,true);await assert.rejects(scan(),/already used/);
});


test('AUD-008/009: legacy correction is Owner-only, year-scoped and atomic across annual balances',async()=>{
 await db.exec(await readFile(new URL('../../supabase/022_legacy_leave_correction.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated'])
  assert.equal((await rows("SELECT has_function_privilege($1,'public.hr_correct_legacy_leave(uuid,uuid,text,text)','EXECUTE') allowed",[role]))[0].allowed,false);
 const type=(await rows("INSERT INTO \"Leave_type\"(type_name,is_paid) VALUES('Historical audit paid leave',true) RETURNING id"))[0].id;
 const legacy=(await rows("INSERT INTO \"Leave_Request\"(employee_id,leave_type_id,start_date,end_date,status,form_version) VALUES($1,$2,'2026-12-31','2027-01-01','Approved',1) RETURNING id",[employee,type]))[0].id;
 await rows('INSERT INTO "Leave_balances"(employee_id,leave_type_id,year,entitled_days,used_days,remain_days) VALUES($1,$2,2026,10,1,9)',[employee,type]);
 const employeeAccount=(await rows("SELECT id FROM sys_users WHERE employee_id=$1",[employee]))[0].id;
 const correct=(actor,status)=>rows('SELECT hr_correct_legacy_leave($1,$2,$3,$4) r',[actor,legacy,status,'Owner history correction']);
 await assert.rejects(correct(employeeAccount,'Rejected'),/Only the active Owner/);
 await assert.rejects(correct(owner,'Approved'),/New legacy approvals are disabled/);
 // The first balance update must roll back if the next year's paid balance is absent.
 await assert.rejects(correct(owner,'Rejected'),/annual paid leave balance is missing/i);
 assert.equal((await rows('SELECT used_days::numeric used FROM "Leave_balances" WHERE employee_id=$1 AND leave_type_id=$2 AND year=2026',[employee,type]))[0].used,'1');
 assert.equal((await rows('SELECT status FROM "Leave_Request" WHERE id=$1',[legacy]))[0].status,'Approved');
 await rows('INSERT INTO "Leave_balances"(employee_id,leave_type_id,year,entitled_days,used_days,remain_days) VALUES($1,$2,2027,12,1,11)',[employee,type]);
 const corrected=(await correct(owner,'Rejected'))[0].r;
 assert.equal(corrected.status,'Rejected');
 const balances=await rows('SELECT year,used_days::text used,remain_days::text remain FROM "Leave_balances" WHERE employee_id=$1 AND leave_type_id=$2 ORDER BY year',[employee,type]);
 assert.deepEqual(balances.map(x=>[Number(x.year),Number(x.used),Number(x.remain)]),[[2026,0,10],[2027,0,12]]);
 assert.equal((await rows("SELECT count(*)::int n FROM sys_audit_logs WHERE action='CORRECT_LEGACY_LEAVE' AND user_id=$1",[owner]))[0].n,1);
 await assert.rejects(correct(owner,'Rejected'),/Only an existing Approved legacy leave/);
});
