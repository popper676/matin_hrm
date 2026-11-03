import {pdfBranding} from '../lib/branding.js';
import express from 'express';
import {systemDb} from '../shared/db/index.js';
import {UUID,can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
import {cleanProbation,cleanSelf,validDate} from '../../shared/probationForm.js';
import {probationView,probationScoped,cleanFinal} from '../lib/probationForms.js';
import {probationPdf} from '../lib/probationPdf.js';
const router=express.Router();
const check=r=>{if(r.error)throw r.error;return r.data;},first=d=>Array.isArray(d)?d[0]:d;
const fail=(res,e)=>res.status(e.status||(e.code==='23505'||/changed|already|cannot be edited/.test(e.message)?409:/permission|independent|assigned|outside|own evaluation/i.test(e.message)?403:400)).json({error:e.code==='23505'?'This employee already has an open probation evaluation. Open the existing draft or request.':e.message});
async function raw(id){
 if(!UUID.test(id||''))throw new Error('Invalid evaluation reference');
 const row=check(await systemDb.from('hr_probation_forms').select('*').eq('id',id).maybeSingle());
 if(!row)throw Object.assign(new Error('Evaluation not found'),{status:404});
 const approval=check(await systemDb.from('hr_approval_requests').select('*').eq('workflow_key','probation').eq('resource_id',id).maybeSingle());return {row,approval};
}
async function formFor(req){const {row,approval}=await raw(req.params.id),record=probationView(req.user,row,approval);if(!record)throw Object.assign(new Error('Evaluation outside your access'),{status:403});
 const own=req.user.employee_id===row.employee_id,stage=approval?.stages[approval.current_stage];
 return {record,approval:record.personal&&row.status!=='decided'?null:approval,actions:{
  edit:!own&&row.status==='draft'&&probationScoped(req.user,row.employee_id,'edit'),
  respond:own&&row.self_invited_at&&!row.self_response&&['draft','pending'].includes(row.status),
  decide:!own&&approval?.status==='pending'&&stage?.assignee_id===req.user.id&&can(req.user,'probation','approve'),
  reply:!own&&row.appeal&&!row.appeal_response&&(req.user.is_owner||(approval?.stages[2]?.assignee_id===req.user.id&&can(req.user,'probation','approve'))),
  receive_appeal:!own&&row.status==='decided'&&!row.appeal&&(req.user.is_owner||(approval?.stages[2]?.assignee_id===req.user.id&&can(req.user,'probation','approve'))),
  salary:req.user.is_owner||req.user.access?.sensitive?.salary===true,
 }};
}
async function rpc(fn,args){return first(check(await systemDb.rpc(fn,args)));}
router.get('/meta',async(req,res)=>{try{
 if(!can(req.user,'probation'))return res.sendStatus(403);
 const scope=employeeScope(req.user);let q=systemDb.from('Employees').select('id,employee_id,Full_name,hire_date').is('deleted_at',null).order('Full_name');if(scope!==null)q=q.in('id',scope.length?scope:['00000000-0000-0000-0000-000000000000']);
 res.json({employees:check(await q).filter(e=>e.id!==req.user.employee_id),can_create:can(req.user,'probation','create')});
}catch(e){fail(res,e);}});
router.get('/',async(req,res)=>{try{
 const personal=req.query.personal==='1';if(personal&&!personalCan(req.user,'probation'))return res.sendStatus(403);
 let q=systemDb.from('hr_probation_forms').select('*').order('created_at',{ascending:false}).limit(1000);
 if(personal)q=q.eq('employee_id',req.user.employee_id||'00000000-0000-0000-0000-000000000000');
 const rows=check(await q),approvals=check(await systemDb.from('hr_approval_requests').select('*').eq('workflow_key','probation'));
 res.set('Cache-Control','no-store').json({records:rows.map(r=>probationView(req.user,r,approvals.find(a=>a.resource_id===r.id))).filter(Boolean).map(r=>({id:r.id,employee_id:r.employee_id,employee_snapshot:r.employee_snapshot,anchor:r.anchor,status:r.status,version:r.version,self_invited_at:r.self_invited_at,self_due_date:r.self_due_date,decision_at:r.decision_at,final_outcome:r.final_decision?.outcome,appeal_due:r.appeal_due,has_appeal:!!r.appeal,acknowledged_at:r.acknowledged_at}))});
}catch(e){fail(res,e);}});
router.put('/:id',async(req,res)=>{try{
 if(!UUID.test(req.params.id)||!UUID.test(req.body.employee_id||'')||!Number.isInteger(req.body.version))throw new Error('Choose the employee and evaluation version');
 const input=cleanProbation(req.body.data);
 const record=await rpc('hr_save_probation',{p_actor:req.user.id,p_id:req.params.id,p_employee:req.body.employee_id,p_data:input,p_version:req.body.version});
 res.json({id:record.id});
}catch(e){fail(res,e);}});
router.get('/:id',async(req,res)=>{try{res.set('Cache-Control','no-store').json(await formFor(req));}catch(e){fail(res,e);}});
router.post('/:id/invite',async(req,res)=>{try{
 if(!validDate(req.body.due_date)||!Number.isInteger(req.body.version))throw new Error('Choose a valid response deadline');
 await formFor(req);await rpc('hr_invite_probation',{p_actor:req.user.id,p_id:req.params.id,p_due:req.body.due_date,p_version:req.body.version});res.json({success:true});
}catch(e){fail(res,e);}});
router.post('/:id/respond',async(req,res)=>{try{
 await formFor(req);const body=cleanSelf(req.body.response);if(!Number.isInteger(req.body.version))throw new Error('Reload the evaluation');
 await rpc('hr_respond_probation',{p_actor:req.user.id,p_id:req.params.id,p_response:body,p_version:req.body.version});res.json({success:true});
}catch(e){fail(res,e);}});
router.post('/:id/submit',async(req,res)=>{try{
 const f=await formFor(req);if(!f.actions.edit)return res.status(403).json({error:'Scoped Probation edit permission is required'});cleanProbation(f.record.data,true);if(!Number.isInteger(req.body.version))throw new Error('Reload the evaluation');
 await rpc('hr_submit_probation',{p_actor:req.user.id,p_id:req.params.id,p_version:req.body.version});res.json({success:true});
}catch(e){fail(res,e);}});
router.post('/:id/decision',async(req,res)=>{try{
 const {row,approval}=await raw(req.params.id);if(!probationView(req.user,row,approval))return res.sendStatus(403);
 if(!['approve','reject'].includes(req.body.decision)||typeof req.body.comment!=='string'||req.body.comment.length>5000||!Number.isInteger(req.body.version))throw new Error('Invalid decision');
 const legal={};for(const k of ['reviewer','date','reference']){if(typeof(req.body.legal?.[k]||'')!=='string'||(req.body.legal?.[k]||'').length>1000)throw new Error('Invalid legal review');legal[k]=(req.body.legal?.[k]||'').trim();}legal.confirmed=req.body.legal?.confirmed===true;if(legal.date&&!validDate(legal.date))throw new Error('Enter a valid completed legal review date');
 const salary={kind:req.body.salary?.kind||'no_change'};if(salary.kind==='adjusted'){salary.amount=String(req.body.salary.amount??'');salary.currency=String(req.body.salary.currency||'').toUpperCase();}
 const result=await rpc('hr_decide_probation',{p_actor:req.user.id,p_id:approval?.id,p_decision:req.body.decision,p_comment:req.body.comment,p_version:req.body.version,p_final:cleanFinal(req.body.final||{},approval?.stages[approval.current_stage]?.key==='hr'&&req.body.decision==='approve'),p_legal:legal,p_salary:salary});res.json({request:result});
}catch(e){fail(res,e);}});
router.post('/:id/:action',async(req,res)=>{try{
 if(!['acknowledge','appeal','appeal-response','record-appeal'].includes(req.params.action))return res.sendStatus(404);
 await formFor(req);if(!Number.isInteger(req.body.version))throw new Error('Reload the evaluation');
 if(req.params.action==='record-appeal'){
  const body={confirmed:req.body.confirmed===true};for(const k of ['statement','signature','reference','received_date']){if(typeof req.body[k]!=='string'||req.body[k].length>(k==='statement'?8000:1000))throw new Error('Complete the received written appeal');body[k]=req.body[k].trim();}if(!validDate(body.received_date))throw new Error('Enter the actual received date');
  await rpc('hr_record_probation_appeal',{p_actor:req.user.id,p_id:req.params.id,p_body:body,p_version:req.body.version});
 }else if(req.params.action==='appeal-response'){
  if(typeof req.body.statement!=='string'||req.body.statement.length>8000)throw new Error('Write the HR response');
  await rpc('hr_reply_probation_appeal',{p_actor:req.user.id,p_id:req.params.id,p_response:req.body.statement,p_version:req.body.version});
 }else{
  const body={confirmed:req.body.confirmed===true};for(const k of ['statement','signature']){if(typeof(req.body[k]||'')!=='string'||(req.body[k]||'').length>(k==='signature'?250:8000))throw new Error('Invalid written response');body[k]=(req.body[k]||'').trim();}
  await rpc('hr_probation_employee_action',{p_actor:req.user.id,p_id:req.params.id,p_action:req.params.action,p_body:body,p_version:req.body.version});
 }res.json({success:true});
}catch(e){fail(res,e);}});
router.get('/:id/pdf',async(req,res)=>{try{
 const f=await formFor(req);if(f.record.personal&&f.record.status!=='decided')return res.status(403).json({error:'The final form copy is released after HR review'});
 const bytes=await probationPdf(f.record,f.approval,await pdfBranding());
 res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':`attachment; filename="UYF-Probation-${req.params.id.slice(0,8)}.pdf"`}).send(bytes);
}catch(e){fail(res,e);}});
export default router;
