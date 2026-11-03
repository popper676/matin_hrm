import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import XLSX from 'xlsx';
import {calculateSalaryTemplate,SALARY_INPUTS,SALARY_COLUMNS,salaryPeriod,salaryStatement} from '../../shared/salaryTemplate.js';
import {createSalaryWorkbook} from '../../hrm-client/src/utils/salaryExport.js';
const input={basic_salary:30000,fixed_allowance:3000,ot_hours:10,special_allowance:1500,scarcity_allowance:500,ssb_employee:875,ssb_employer:875,income_tax:1000,staff_loan:2000,unpaid_leave_days:.5,other_deduction:200};
let db,actor,employee;
before(async()=>{
 db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
 for(const name of ['001_fresh_hr_schema','003_recruitment_openings','004_people_access_approvals','005_employee_information','006_leave_forms','007_expense_forms','008_probation_forms','009_warning_forms','010_hr_operations','011_branding_owner_setup','012_high_priority_integrity','013_medium_priority','014_salary_template'])await db.exec(await readFile(new URL('../../supabase/'+name+'.sql',import.meta.url),'utf8'));
 employee=(await db.query('INSERT INTO "Employees"(employee_id,"Full_name",salary) VALUES(\'SAL-001\',\'Salary fixture\',30000) RETURNING id')).rows[0].id;
 actor=(await db.query("INSERT INTO sys_users(username,password_hash,role,is_owner) VALUES('salary-owner','hash','boss',true) RETURNING id")).rows[0].id;
});
after(async()=>{await db?.close();});
const save=async(month,version=0,values=input,user=actor,emp=employee)=>(await db.query('SELECT hr_save_salary_template($1,$2,$3,$4,$5,$6) AS record',[user,emp,month,version,JSON.stringify(values),'Synthetic salary test'])).rows[0].record;

test('the 23-column template calculates OT and unpaid leave once, excluding employer SSB from employee deductions',()=>{
 const result=calculateSalaryTemplate('2026-10',input);
 assert.equal(SALARY_COLUMNS.length,23);assert.equal(result.total_salary,33000);assert.equal(result.attendance_days,30.5);
 assert.equal(result.salary_after_attendance,29516.13);assert.equal(result.ot_amount,2884.62);assert.equal(result.gross_salary,37884.62);
 assert.equal(result.unpaid_leave,550);assert.equal(result.total_deduction,4625);assert.equal(result.net_salary,33259.62);
 assert.equal(calculateSalaryTemplate('2026-10',{...input,ssb_employer:5000}).net_salary,result.net_salary);
 assert.equal(salaryPeriod('2028-02').days,29);assert.equal(salaryPeriod('2027-02').days,28);
 for(const invalid of [NaN,Infinity,-1,'','   ',true,1.001,[],[1],{}])assert.throws(()=>calculateSalaryTemplate('2026-10',{...input,staff_loan:invalid}));
 assert.throws(()=>calculateSalaryTemplate('2026-10',{...input,unpaid_leave_days:.25}));
 assert.throws(()=>calculateSalaryTemplate('2026-02',{...input,unpaid_leave_days:29}));
});
test('salary snapshots are calculated by PostgreSQL, versioned, scoped and protected from legacy writes',async()=>{
 const first=await save('2026-10');
 const expected=calculateSalaryTemplate('2026-10',input);
 for(const key of [...SALARY_INPUTS,'total_salary','attendance_days','salary_after_attendance','ot_amount','unpaid_leave','gross_salary','total_deduction','net_salary'])assert.equal(Number(first.salary_template[key]),expected[key],key);
 assert.equal(Number(first.allowances),7884.62);assert.equal(Number(first.net_salary),33259.62);assert.equal(first.bonus,0);
 assert.equal((await db.query('SELECT salary FROM "Employees" WHERE id=$1',[employee])).rows[0].salary,'30000');
 await assert.rejects(save('2026-10',0),/changed/);
 const edited=await save('2026-10',1,{...input,other_deduction:0});assert.equal(edited.salary_template.version,2);
 await assert.rejects(db.query('UPDATE payrolls SET net_salary=1 WHERE id=$1',[first.id]),/Salary Template/);
 await assert.rejects(save('2026-12',0,{...input,net_salary:999999}),/Unexpected salary input/);
 await assert.rejects(save('2026-12',0,{...input,staff_loan:100000000}),/Deductions exceed/);
 await db.exec(await readFile(new URL('../../supabase/014_salary_template.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('SELECT count(*)::int n FROM payrolls')).rows[0].n,1);
});
test('a current saved version can be marked paid once; stale payment, edits and deletion are refused',async()=>{
 const first=await save('2026-11');
 await assert.rejects(db.query('SELECT hr_pay_salary_template($1,$2,0)',[actor,first.id]),/changed/);
 const paid=(await db.query('SELECT hr_pay_salary_template($1,$2,1) AS record',[actor,first.id])).rows[0].record;
 assert.equal(paid.payment_status,'Paid');assert.equal(paid.salary_template.net_salary,33259.62);
 await assert.rejects(db.query('SELECT hr_pay_salary_template($1,$2,1)',[actor,first.id]),/already paid/);
 await assert.rejects(save('2026-11',1),/paid/);
 await assert.rejects(db.query('DELETE FROM payrolls WHERE id=$1',[first.id]),/immutable/);
});
test('delegated payroll access requires Salary, employee scope and the specific create/edit/pay action',async()=>{
 const delegate=(await db.query("INSERT INTO sys_users(username,password_hash,role) VALUES('salary-delegate','hash','employee') RETURNING id")).rows[0].id;
 const policy={modules:{payroll:['view','create']},personal:[],scope:'selected',employee_ids:[employee],sensitive:{salary:true}};
 await db.query('INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)',[delegate,JSON.stringify(policy)]);
 const created=await save('2027-01',0,input,delegate);
 await assert.rejects(save('2027-01',1,input,delegate),/Edit/);
 await assert.rejects(db.query('SELECT hr_pay_salary_template($1,$2,1)',[delegate,created.id]),/payment access/);
 await db.query("UPDATE hr_access_policies SET policy=jsonb_set(policy,'{sensitive,salary}','false') WHERE user_id=$1",[delegate]);
 await assert.rejects(save('2027-02',0,input,delegate),/Salary/);
 await db.query('UPDATE hr_access_policies SET policy=$2 WHERE user_id=$1',[delegate,JSON.stringify({...policy,employee_ids:[]})]);
 await assert.rejects(save('2027-02',0,input,delegate),/scope/);
 await db.exec('SET ROLE authenticated');
 try{await assert.rejects(save('2027-03'),/permission denied/);}finally{await db.exec('RESET ROLE');}
});
test('historical payroll keeps its saved totals and cannot be overwritten as a new template',async()=>{
 await db.query("INSERT INTO payrolls(employee_id,month,basic_salary,allowances,bonus,deductions,net_salary) VALUES($1,'2025-12',1000,100,50,75,1075)",[employee]);
 await assert.rejects(save('2025-12'),/legacy/);
 const view=salaryStatement({basic_salary:'1000',allowances:'100',bonus:'50',deductions:'75',net_salary:'1075'});
 assert.equal(view.basic_salary,1000);assert.equal(view.allowances,100);assert.equal(view.bonus,50);assert.equal(view.net_salary,1075);
 assert.equal(salaryStatement({basic_salary:0,base_salary:500,net_salary:0,net_pay:900}).net_salary,0);
});
test('Excel preserves the supplied column order, correct references, numeric cells and saved totals for every employee',()=>{
 const row={...calculateSalaryTemplate('2026-10',input),employee_code:'SAL-001',employee_name:'Fixture employee',department:'Operations',hire_date:'2026-01-02'};
 const workbook=createSalaryWorkbook([row,{...row,employee_code:'SAL-002'}],'2026-10','Test Brand');
 const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),sheet=XLSX.read(bytes,{type:'buffer'}).Sheets.Salary;
 assert.deepEqual(XLSX.utils.sheet_to_json(sheet,{header:1})[2],SALARY_COLUMNS.map(([,label])=>label));
 assert.equal(sheet.H4.f,'$I$2-S4');assert.equal(sheet.H5.f,'$I$2-S5');assert.equal(sheet.T4.f,'ROUND(G4/30*S4,2)');
 assert.equal(sheet.K5.f,'ROUND(E5*12/(52*48)*J5*2,2)');assert.equal(sheet.W4.v,33259.62);assert.equal(sheet.W6.v,66519.24);
 assert.equal(sheet.P4.v,875);assert.equal(sheet.V4.v,4625);assert.equal(sheet.W5.t,'n');assert.equal(sheet['!autofilter'].ref,'A3:W5');
});
