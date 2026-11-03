import express from 'express';
import {can,employeeScope} from '../../shared/accessPolicy.js';
import {SALARY_INPUTS,calculateSalaryTemplate,salaryPeriod} from '../../shared/salaryTemplate.js';
import {systemDb,dbFetch} from '../lib/supabase.js';
import {integrityRpc} from '../lib/integrityRpc.js';
import {canReadPayroll,canReadPayslip,salaryPdf} from '../lib/salaryTemplate.js';
const router=express.Router();
const fail=(res,error)=>res.status(error.code==='PGRST202'?503:error.status||400).json({error:error.code==='PGRST202'?'Apply supabase/014_salary_template.sql in the existing HR project.':error.message});
router.get('/salary-template',async(req,res)=>{
 try{
  salaryPeriod(req.query.month);
  if(!req.user.is_owner&&(!can(req.user,'payroll','view')||!req.user.access?.sensitive?.salary))return res.status(403).json({error:'Payroll and Salary access are required.'});
  const scope=employeeScope(req.user);let query=systemDb.from('Employees').select('id,Full_name,employee_id,hire_date,salary,Dept_id,status').is('deleted_at',null).order('Full_name');
  if(scope!==null){if(!scope.length)return res.json({employees:[],payrolls:[]});query=query.in('id',scope);}
  const [{data:employees,error},{data:departments,error:departmentError},payrolls]=await Promise.all([query,systemDb.from('Departments').select('id,Department_name'),dbFetch('payrolls','*',{month:req.query.month})]);
  if(error||departmentError)throw error||departmentError;
  const names=Object.fromEntries((departments||[]).map(d=>[d.id,d.Department_name]));
  res.json({employees:(employees||[]).map(e=>({...e,department:names[e.Dept_id]||''})),payrolls});
 }catch(error){fail(res,error);}
});
router.post('/salary-template',async(req,res)=>{
 try{
  const {employee_id,month,version,input,notes=''}=req.body;
  if(Object.keys(req.body).some(k=>!['employee_id','month','version','input','notes'].includes(k))||!Number.isInteger(version)||version<0||!input||Object.keys(input).some(k=>!SALARY_INPUTS.includes(k))||typeof notes!=='string'||notes.length>4000)throw new Error('Invalid salary form.');
  if(!canReadPayroll(req.user,employee_id))return res.status(403).json({error:'Payroll, Salary and employee scope are required.'});
  const preview=calculateSalaryTemplate(month,input);
  const amounts=Object.fromEntries(SALARY_INPUTS.map(k=>[k,preview[k]]));
  const payroll=await integrityRpc('hr_save_salary_template',{p_actor:req.user.id,p_employee:employee_id,p_month:month,p_version:version,p_input:amounts,p_notes:notes});
  res.json({success:true,payroll});
 }catch(error){fail(res,error);}
});
router.post('/salary-template/:id/pay',async(req,res)=>{
 try{
  if(Object.keys(req.body).some(k=>k!=='version')||!Number.isInteger(req.body.version))throw new Error('A saved salary version is required.');
  const payroll=await integrityRpc('hr_pay_salary_template',{p_actor:req.user.id,p_payroll:req.params.id,p_version:req.body.version});
  res.json({success:true,payroll});
 }catch(error){fail(res,error);}
});
router.get('/:id/payslip',async(req,res)=>{
 try{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(404).json({error:'Payslip unavailable.'});
  const {data:record,error}=await systemDb.from('payrolls').select('*').eq('id',req.params.id).maybeSingle();
  if(error)throw error;
  if(!record||!canReadPayslip(req.user,record.employee_id))return res.status(403).json({error:'Payslip unavailable.'});
  const {data:employee,error:employeeError}=await systemDb.from('Employees').select('id,Full_name,employee_id').eq('id',record.employee_id).maybeSingle();
  if(employeeError)throw employeeError;
  const pdf=await salaryPdf(record,employee||{});
  res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Payslip_${record.month}.pdf"`,'Cache-Control':'private, no-store'}).send(pdf);
 }catch(error){fail(res,error);}
});
export default router;
