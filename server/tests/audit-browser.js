import assert from 'node:assert/strict';
import path from 'node:path';
import {getBkkDateString} from '../lib/dateUtils.js';
export function installAuditFixtures(app,{employee}) {
 const today=getBkkDateString(new Date()),yesterday=getBkkDateString(new Date(Date.now()-86400000)),tomorrow=getBkkDateString(new Date(Date.now()+86400000));
 const sops=[{id:'audit-today-1',employee_id:employee.employee_id,assigned_date:today,created_at:'2020-01-01T00:00:00Z',content:'First current task',is_completed:false},{id:'audit-today-2',employee_id:employee.employee_id,assigned_date:today,created_at:'2020-01-01T00:00:00Z',content:'Second current task',is_completed:false},{id:'audit-overdue',employee_id:employee.employee_id,assigned_date:yesterday,created_at:'2020-01-01T00:00:00Z',content:'Retained overdue task',is_completed:false},{id:'audit-future',employee_id:employee.employee_id,assigned_date:tomorrow,created_at:'2020-01-01T00:00:00Z',content:'Future hidden task',is_completed:false}];
 let sopReads=0,completed=0;
 app.get('/api/sops',(req,res)=>{sopReads++;res.json({sops});});
 app.post('/api/sops/:id/complete',(req,res)=>{const row=sops.find(s=>s.id===req.params.id);if(!row)return res.sendStatus(404);row.is_completed=true;completed++;res.json({success:true});});
 const handover={id:'audit-review-only',outgoing_employee_id:employee.employee_id,outgoing_name:'Demo Reviewer',status:'pending_review',handover_kind:'exit',trigger_type:'exit',completion_pct:100,version:1};
 app.get('/api/handover',(req,res)=>res.json({handovers:[handover],employees:[],stats:{}}));
 app.get('/api/handover/:id',(req,res)=>res.json({handover,items:[{id:'audit-complete-item',title:'Reviewed work',is_required:true,status:'done',successor_acknowledged:true}],employees:[]}));
 app.get('/api/finance/dashboard',(req,res)=>res.json({currency:'THB',stats:{headcount:1,base_salary_total:30000,department_count:1,approved_leaves:0,latest_month:'2026-10',current_month_payroll:12350,previous_month_payroll:10000,variance:'23.50'},recent_payrolls:[{id:'finance-audit',employee_name:'Demo Reviewer',month:'2026-10',net_salary:12350,payment_status:'Pending'}]}));
 const settings={target_bonus_percentage:15,auto_weights:{attendance:0,punctuality:0,sops:60,peer_voting:0},manual_metrics:[{name:'Manager review',weight:40}]};
 app.get('/api/payroll',(req,res)=>res.json({payrolls:[],kpis:[],employees:[{id:employee.employee_id,Full_name:'Demo Reviewer',employee_id:'DEMO-001'}],total_paid:0}));
 app.get('/api/payroll-engine/settings',(req,res)=>res.json(settings));
 app.get('/api/payroll-policy',(req,res)=>res.json({policy:{salary_divisor:26,weekly_holidays:['SUNDAY'],timezone:'Asia/Bangkok',approved_leave_counts_as_punctual:true,peer_score_max_stars:5,default_sop_score:100,default_peer_score:100}}));
 app.get('/api/payroll-engine/calculate/:employee/:month',(req,res)=>res.json({base_salary:30000,auto_kpi_contribution:60,target_bonus_percentage:15,auto_weights:settings.auto_weights,manual_metrics:settings.manual_metrics,unpaid_leave_days:0,unpaid_leave_deduction:0,attendance_score:100,sop_score:100,peer_score:100}));
 return {get reads(){return sopReads;},get completed(){return completed;}};
}
export async function exerciseAuditBrowser({page,base,root,check,fits,textButton,owner,employee,setCurrent,fixture}){
 setCurrent(owner);await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});await page.setViewport({width:1440,height:1000});
 await page.goto(base+'/finance');await page.waitForSelector('tbody tr');
 check(await page.$eval('tbody',e=>e.textContent.includes('Demo Reviewer')&&e.textContent.includes('12,350 THB')&&e.textContent.includes('Pending')&&!e.textContent.includes('MMK')),'Finance shows the saved THB net and real pending status');await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/audit-finance-desktop.png')});
 await page.evaluate(()=>localStorage.setItem('lm_hr_language','my'));await page.setViewport({width:390,height:900});await page.goto(base+'/finance');await page.waitForSelector('tbody tr');await fits();check(await page.$eval('tbody',e=>e.textContent.includes('စောင့်ဆိုင်းဆဲ')),'Finance status is translated in Myanmar');await page.screenshot({path:path.join(root,'access-browser-artifacts/audit-finance-myanmar-mobile.png')});
 await page.evaluate(()=>localStorage.setItem('lm_hr_language','en'));await page.setViewport({width:1440,height:1000});await page.goto(base+'/payroll/records');await page.waitForSelector('.payroll-section');
 await page.click('button.payroll-btn-primary');await page.waitForSelector('#payslip-form');await page.select('#emp_select',employee.employee_id);await textButton('Auto Calculate');await page.waitForSelector('.manual-kpi-input');
 await page.waitForFunction(()=>document.querySelector('input[name="net_salary"]').value==='34500.00');
 check(await page.$eval('input[name="bonus"]',e=>e.readOnly&&e.value==='4500.00'),'Legacy first preview includes mounted manual metrics and uses the canonical bonus');
 const manual=await page.$('.manual-kpi-input');await manual.click();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await manual.press('Backspace');await manual.type('0');await manual.press('Tab');try{await page.waitForFunction(()=>document.querySelector('input[name="net_salary"]').value==='32700.00');}catch(e){console.log('Payroll browser values',await page.$$eval('#payslip-form input',els=>els.map(el=>({name:el.name,value:el.value}))));await page.screenshot({path:path.join(root,'access-browser-artifacts/audit-legacy-failure.png')});throw e;}check(true,'Changing the manual score updates the canonical preview');await page.screenshot({path:path.join(root,'access-browser-artifacts/audit-legacy-payroll-preview.png')});
 setCurrent({...employee,access:{...employee.access,modules:{},personal:['sops','overview']}});await page.goto(base+'/portal/sops');await page.waitForSelector('input[type="checkbox"]');
 check(await page.$$eval('input[type="checkbox"]',e=>e.length===3),'All due assignments are visible, including two for today and an overdue task');
 check(await page.evaluate(()=>!document.body.innerText.includes('Future hidden task')),'Assigned date hides future tasks even when their creation date is old');
 const reads=fixture.reads;await page.click('input[type="checkbox"]');await textButton('Complete');await page.waitForFunction(()=>document.body.innerText.includes('✓ Done'));
 check(fixture.completed===1&&fixture.reads>reads,'Completing a SOP invalidates and refetches the React Query v5 cache');
 await page.setViewport({width:390,height:900});await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/audit-sops-mobile.png')});
 assert(fixture.completed===1);
 setCurrent({...employee,access:{...employee.access,scope:'all',personal:[],modules:{handovers:['view']}}});await page.setViewport({width:1440,height:1000});await page.goto(base+'/handovers');await page.waitForSelector('.ho-btn-view');await page.click('.ho-btn-view');await page.waitForSelector('.handover-panel-card');
 check(!await page.$('.handover-panel-btn-approve')&&!await page.$('.handover-panel-btn-waive')&&!await page.$('.handover-panel-btn-primary'),'A View-only handover reader sees the checklist without approval or edit controls');await page.screenshot({path:path.join(root,'access-browser-artifacts/audit-handover-view-only.png')});setCurrent(owner);
}
