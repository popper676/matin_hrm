import {can} from '../../shared/accessPolicy.js';
import {cents,moneyValue,monthEnd,previousMonth} from '../../shared/operations.js';
import {scoped,hasSalary} from './operationsAccess.js';
export function monthlyReview(user,data,month,business=''){
 const end=monthEnd(month),previous=previousMonth(month),employees=new Map(data.employees.filter(e=>!e.deleted_at).map(e=>[e.id,e]));
 const base={month,previous_month:previous,business_key:business,businesses:data.businesses,payroll:null,expenses:null};
 if(can(user,'payroll')&&hasSalary(user)){
  const permitted=data.payrolls.filter(p=>scoped(user,'payroll',p.employee_id)),current=permitted.filter(p=>p.month===month),prior=permitted.filter(p=>p.month===previous);
  const rows=current.map(p=>{const old=permitted.find(v=>v.employee_id===p.employee_id&&v.month===previous),changes=['basic_salary','allowances','deductions','bonus','net_salary'].filter(k=>old&&cents(old[k])!==cents(p[k])),net=cents(p.net_salary);
   return {id:p.id,employee_id:p.employee_id,employee_name:employees.get(p.employee_id)?.Full_name||p.employee_id,month,payment_status:p.payment_status,net_salary:moneyValue(net),previous_net:old?moneyValue(cents(old.net_salary)):null,delta:old?moneyValue(net-cents(old.net_salary)):null,changes,new_payroll:!old,explanation:p.workspace_notes||p.notes||'',needs_explanation:!!changes.length&&!String(p.workspace_notes||p.notes||'').trim(),components:Object.fromEntries(['basic_salary','allowances','deductions','bonus'].map(k=>[k,moneyValue(cents(p[k]))]))};});
  const currentTotal=current.reduce((s,p)=>s+cents(p.net_salary),0),priorTotal=prior.reduce((s,p)=>s+cents(p.net_salary),0),missing=[...employees.values()].filter(e=>scoped(user,'payroll',e.id)&&e.status==='Active'&&(!e.employment_status||e.employment_status==='Active')&&(!e.hire_date||e.hire_date<=end)&&!current.some(p=>p.employee_id===e.id)).map(e=>({employee_id:e.id,employee_name:e.Full_name}));
  base.payroll={currency:'THB',current_total:moneyValue(currentTotal),previous_total:moneyValue(priorTotal),total_delta:moneyValue(currentTotal-priorTotal),paid_total:moneyValue(current.filter(p=>p.payment_status==='Paid').reduce((s,p)=>s+cents(p.net_salary),0)),pending_total:moneyValue(current.filter(p=>p.payment_status!=='Paid').reduce((s,p)=>s+cents(p.net_salary),0)),rows:rows.sort((a,b)=>a.employee_name.localeCompare(b.employee_name)),missing};
 }
 if(can(user,'rewards')){
  const allowed=data.expenses.filter(r=>r.claim_type==='Expense Claim'&&scoped(user,'rewards',r.employee_id)&&(!business||r.form_snapshot?.input?.business_unit===business));
  const requestDate=r=>r.form_snapshot?.input?.expense_date||r.created_at?.slice(0,10)||'',groups=new Map();
  const group=c=>{if(!groups.has(c))groups.set(c,{currency:c,requested:0,paid:0,approved_unpaid:0});return groups.get(c);};
  const rows=allowed.filter(r=>requestDate(r).slice(0,7)===month||r.payment_date?.slice(0,7)===month||r.status==='APPROVED'&&requestDate(r)<=end).map(r=>{
   const cur=r.currency||'UNSPECIFIED',g=group(cur),evidence=data.receipts.filter(v=>v.expense_id===r.id),input=r.form_snapshot?.input||{},count=r.form_snapshot?.documents?.length||0;
   if(requestDate(r).slice(0,7)===month)g.requested+=cents(r.requested_amount);if(r.status==='PAID'&&r.payment_date?.slice(0,7)===month)g.paid+=cents(r.paid_amount??r.approved_amount??r.requested_amount);if(r.status==='APPROVED'&&requestDate(r)<=end)g.approved_unpaid+=cents(r.approved_amount??r.requested_amount);
   return {id:r.id,employee_id:r.employee_id,employee_name:employees.get(r.employee_id)?.Full_name||r.employee_id,request_number:r.request_number||r.id.slice(0,8),business_key:input.business_unit||'',business_name:r.form_snapshot?.business_name||'',date:requestDate(r),required_payment_date:input.required_payment_date||null,status:r.status,currency:cur,requested_amount:moneyValue(cents(r.requested_amount)),approved_amount:r.approved_amount==null?null:moneyValue(cents(r.approved_amount)),paid_amount:r.paid_amount==null?null:moneyValue(cents(r.paid_amount)),payment_date:r.payment_date||null,payment_reference:r.payment_reference||'',document_count:count,receipt_state:evidence.length?'recorded':count?'needs_review':'missing',receipt_count:evidence.length,form_version:r.form_version,href:r.form_version===2?'/hr-operations/expense/'+r.id:'/payroll/rewards'};
  });
  base.expenses={totals:[...groups.values()].map(g=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k,k==='currency'?v:moneyValue(v)]))),rows:rows.sort((a,b)=>(b.date||'').localeCompare(a.date||'')),basis:'Requests use expense date; payments use actual payment date. Approved unpaid items include earlier expenses through month end. Currencies are kept separate. An attachment is not automatically classified as a receipt.'};
 }
 return base;
}
