import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import {calculateSalaryTemplate} from '../../shared/salaryTemplate.js';
export function installSalaryFixtures(app,{getCurrent,employee}) {
 const rows=[],person={id:employee.employee_id,employee_id:'DEMO-001',Full_name:'Demo Reviewer',department:'Operations',salary:30000,hire_date:'2026-01-01',status:'Active'};
 app.get('/api/payroll/salary-template',(req,res)=>res.json({employees:[person],payrolls:rows.filter(r=>r.month===req.query.month)}));
 app.post('/api/payroll/salary-template',(req,res)=>{
  const {input,month,version}=req.body,old=rows.find(r=>r.month===month&&r.employee_id===person.id);
  if(old&&(old.payment_status==='Paid'||old.salary_template.version!==version))return res.sendStatus(409);
  const snapshot={...calculateSalaryTemplate(month,input),version:version+1,employee_code:person.employee_id,employee_name:person.Full_name,department:person.department,hire_date:person.hire_date};
  const record={id:'00000000-0000-4000-8000-000000009901',employee_id:person.id,month,basic_salary:snapshot.basic_salary,net_salary:snapshot.net_salary,salary_template:snapshot,payment_status:'Pending',notes:req.body.notes||''};
  if(old)rows.splice(rows.indexOf(old),1,record);else rows.push(record);res.json({success:true,payroll:record});
 });
 app.post('/api/payroll/salary-template/:id/pay',(req,res)=>{const r=rows.find(r=>r.id===req.params.id);if(!r||r.payment_status==='Paid'||r.salary_template.version!==req.body.version)return res.sendStatus(409);r.payment_status='Paid';res.json({success:true,payroll:r});});
 return {rows,personal:()=>rows.filter(r=>r.employee_id===getCurrent().employee_id)};
}
export async function exerciseSalaryBrowser({page,base,root,check,fits,textButton,owner,employee,setCurrent,fixture}) {
 setCurrent(owner);
 await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});
 await page.setViewport({width:1440,height:1000});await page.goto(base+'/dashboard');await page.waitForSelector('.app-grid');
 await page.click('a.app-link[href="/payroll"]');await page.waitForSelector('.salary-create');
 await page.click('.uyf-back-button');await page.waitForFunction(()=>location.pathname==='/dashboard');check(true,'Back returns from Payroll to the previous Apps Home');
 await page.goto(base+'/payroll');await page.waitForSelector('.salary-create');await page.select('[aria-label="Salary employee"]',employee.employee_id);await textButton('Prepare salary');await page.waitForSelector('.salary-editor');
 const field=async(label,value)=>{const el=await page.$(`input[aria-label="${label}"]`);assert(el,label);await el.click({clickCount:3});await el.press('Backspace');await el.type(String(value));};
 for(const [key,value]of [['Fixed Allowance',3000],['OT Hours',10],['Special Allowance',1500],['Scarcity Allowance',500],['SSB Employee',875],['SSB Employer',875],['Income Tax',1000],['Staff Loan',2000],['Unpaid Leave Day',.5],['Other Deduction',200]])await field(key,value);
 check(await page.$eval('.salary-preview',e=>e.textContent.includes('33,259.62')),'Salary form previews OT, half-day unpaid leave and the reconciled net amount');
 await textButton('Save pending salary');await page.waitForFunction(()=>!document.querySelector('.salary-editor'));await page.waitForSelector('.salary-table tbody tr');
 check(await page.$$eval('.salary-table thead th',els=>els.length===24),'Salary table preserves all 23 source columns plus actions');
 check(fixture.rows[0].salary_template.net_salary===33259.62,'Saving preserves the reviewed salary inputs and totals');
 await textButton('Edit');await page.waitForSelector('.salary-editor');await page.type('.salary-editor textarea','Reviewed input',{delay:4});check(await page.$eval('.salary-editor textarea',e=>e.value==='Reviewed input'&&document.activeElement===e),'Opening a salary dialog does not steal focus from a field already being edited');await textButton('Save pending salary');await page.waitForFunction(()=>!document.querySelector('.salary-editor'));
 check(fixture.rows[0].salary_template.version===2,'Editing submits the current saved salary version');
 const session=await page.createCDPSession();await session.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(root,'access-browser-artifacts')});
 await textButton('Export salary Excel');const file=path.join(root,'access-browser-artifacts','Salary_'+fixture.rows[0].month+'.xlsx');
 let bytes;for(let i=0;i<50;i++){try{bytes=await readFile(file);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert(bytes,'Salary Excel download');const sheet=XLSX.read(bytes,{type:'buffer'}).Sheets.Salary;
 check(sheet.W4.v===33259.62&&sheet.T4.f==='ROUND(G4/30*S4,2)','Browser Excel download contains saved values and corrected formulas');
 await textButton('Record paid');await textButton('Confirm paid');await page.waitForFunction(()=>document.querySelector('.salary-row-actions')?.textContent.includes('Paid'));
 check(!(await page.$eval('.salary-row-actions',e=>e.textContent)).includes('Edit'),'Paid salary has no edit action');
 await page.click('.uyf-back-button');await page.waitForFunction(()=>location.pathname==='/dashboard');check(true,'A directly opened salary page falls back to Apps Home');
 await page.evaluate(()=>{localStorage.setItem('lm_hr_language','my');localStorage.setItem('uyf-theme','dark');});await page.setViewport({width:390,height:900});await page.goto(base+'/payroll');await page.waitForSelector('.salary-table');await fits();
 check(await page.$eval('.salary-table-scroll',e=>e.scrollWidth>e.clientWidth),'The full salary schedule scrolls within its mobile container');
 check(await page.$eval('.uyf-back-button',e=>e.textContent.includes('နောက်သို့')),'Back is localized in Myanmar');
 await page.screenshot({path:path.join(root,'access-browser-artifacts/salary-template-myanmar-mobile.png'),fullPage:false});
 setCurrent({...employee,access:{...employee.access,modules:{},personal:['payslips','profile']}});
 await page.goto(base+'/portal');await page.waitForSelector('.app-grid');await page.click('a.app-link[href="/portal/payslips"]');await page.waitForSelector('.salary-payslip');await fits();
 check(await page.$eval('.salary-payslip',e=>e.textContent.includes('33,259.62')&&e.textContent.includes('SSB Employer')),'Employee payslip displays the saved full breakdown and employer contribution');
 check(!(await page.$eval('.salary-payslip',e=>e.textContent)).includes('$'),'Employee payslip uses THB instead of a dollar symbol');
 await page.screenshot({path:path.join(root,'access-browser-artifacts/salary-payslip-myanmar-mobile.png'),fullPage:false});
 await page.click('.uyf-back-button');await page.waitForFunction(()=>location.pathname==='/portal');check(true,'Employee Back returns to the previous personal Apps Home');
 await page.goto(base+'/portal/payslips');await page.waitForSelector('.salary-payslip');await page.click('.uyf-back-button');await page.waitForFunction(()=>location.pathname==='/portal');check(true,'A directly opened employee page falls back to the personal Apps Home');
 setCurrent(owner);
}
