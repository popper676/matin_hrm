import {pdfBranding} from '../lib/branding.js';
import express from 'express';
import {systemDb} from '../shared/db/index.js';
import {UUID,can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
import {cleanWarning,cleanWarningResponse,warningDate} from '../../shared/warningForm.js';
import {warningView,warningScoped,warningHR} from '../lib/warningForms.js';
import {warningPdf} from '../lib/warningPdf.js';
const router=express.Router();
const check=r=>{if(r.error)throw r.error;return r.data;},first=d=>Array.isArray(d)?d[0]:d;
const fail=(res,e)=>res.status(e.status||(e.code==='23505'||/changed|already|cannot be edited/.test(e.message)?409:/permission|independent|assigned|outside|own letter|own warning/i.test(e.message)?403:400)).json({error:e.message});
async function raw(id){
 if(!UUID.test(id||''))throw new Error('Invalid warning reference');
 const row=check(await systemDb.from('hr_warning_forms').select('*').eq('id',id).maybeSingle());if(!row)throw Object.assign(new Error('Warning not found'),{status:404});
 const approval=check(await systemDb.from('hr_approval_requests').select('*').eq('workflow_key','warning').eq('resource_id',id).maybeSingle());return {row,approval};
}
async function formFor(req){
 const {row,approval}=await raw(req.params.id),record=warningView(req.user,row,approval);if(!record)throw Object.assign(new Error('Warning outside your access'),{status:403});
 const own=req.user.employee_id===row.employee_id,stage=approval?.stages[approval.current_stage];
 return {record,approval,actions:{edit:!own&&row.status==='draft'&&warningScoped(req.user,row.employee_id,'edit'),respond:own&&row.status==='issued'&&(!row.employee_comment||!row.acknowledgment),decide:!own&&approval?.status==='pending'&&stage?.assignee_id===req.user.id&&can(req.user,'warnings','approve'),hr:row.status==='issued'&&warningHR(req.user,row,approval)}};
}
async function rpc(fn,args){return first(check(await systemDb.rpc(fn,args)));}
function textBody(body,fields){const out={};for(const k of fields){if(typeof(body?.[k]??'')!=='string'||(body?.[k]||'').length>(['notes','comments','explanation_note'].includes(k)?6000:1000))throw new Error('Invalid warning record');out[k]=(body?.[k]||'').trim();}return out;}
function dates(body,fields){for(const k of fields)if(body[k]&&!warningDate(body[k]))throw new Error('Enter valid dates');return body;}
router.get('/meta',async(req,res)=>{try{
 if(!can(req.user,'warnings'))return res.sendStatus(403);const scope=employeeScope(req.user);let q=systemDb.from('Employees').select('id,employee_id,Full_name').is('deleted_at',null).order('Full_name');if(scope!==null)q=q.in('id',scope.length?scope:['00000000-0000-0000-0000-000000000000']);res.json({employees:check(await q).filter(e=>e.id!==req.user.employee_id),can_create:can(req.user,'warnings','create')});
}catch(e){fail(res,e);}});
router.get('/',async(req,res)=>{try{
 const personal=req.query.personal==='1';if(personal&&!personalCan(req.user,'warnings'))return res.sendStatus(403);
 let q=systemDb.from('hr_warning_forms').select('*').order('created_at',{ascending:false}).limit(1000);if(personal)q=q.eq('employee_id',req.user.employee_id||'00000000-0000-0000-0000-000000000000');
 const rows=check(await q),approvals=check(await systemDb.from('hr_approval_requests').select('*').eq('workflow_key','warning'));
 res.set('Cache-Control','no-store').json({records:rows.map(r=>warningView(req.user,r,approvals.find(a=>a.resource_id===r.id))).filter(Boolean).map(r=>({id:r.id,employee_id:r.employee_id,employee_snapshot:r.employee_snapshot,status:r.status,letter_number:r.letter_number,level:r.data.level,letter_date:r.data.letter_date,target_date:r.data.target_date,acknowledgment:r.acknowledgment,issued_at:r.issued_at}))});
}catch(e){fail(res,e);}});
router.put('/:id',async(req,res)=>{try{
 if(!UUID.test(req.params.id)||!UUID.test(req.body.employee_id||'')||!Number.isInteger(req.body.version))throw new Error('Choose the employee and current version');
 const r=await rpc('hr_save_warning',{p_actor:req.user.id,p_id:req.params.id,p_employee:req.body.employee_id,p_data:cleanWarning(req.body.data),p_version:req.body.version});res.json({id:r.id});
}catch(e){fail(res,e);}});
router.get('/:id',async(req,res)=>{try{res.set('Cache-Control','no-store').json(await formFor(req));}catch(e){fail(res,e);}});
router.post('/:id/submit',async(req,res)=>{try{
 const f=await formFor(req);if(!f.actions.edit)return res.sendStatus(403);cleanWarning(f.record.data,true);if(!Number.isInteger(req.body.version))throw new Error('Reload the letter');await rpc('hr_submit_warning',{p_actor:req.user.id,p_id:req.params.id,p_version:req.body.version});res.json({success:true});
}catch(e){fail(res,e);}});
router.post('/:id/decision',async(req,res)=>{try{
 const {row,approval}=await raw(req.params.id);if(!warningView(req.user,row,approval))return res.sendStatus(403);
 if(!['approve','reject'].includes(req.body.decision)||typeof req.body.comment!=='string'||req.body.comment.length>5000||!Number.isInteger(req.body.version))throw new Error('Invalid decision');
 const issue=dates(textBody(req.body.issue,['informed_date','explanation_note','delivery','delivered_on','delivery_reference']),['informed_date','delivered_on']);issue.opportunity_confirmed=req.body.issue?.opportunity_confirmed===true;
 const hr=dates(textBody(req.body.hr,['file_reference','review_date','notes']),['review_date']);
 const r=await rpc('hr_decide_warning',{p_actor:req.user.id,p_id:approval?.id,p_decision:req.body.decision,p_comment:req.body.comment,p_version:req.body.version,p_issue:issue,p_hr:hr});res.json({request:r});
}catch(e){fail(res,e);}});
router.post('/:id/respond',async(req,res)=>{try{
 await formFor(req);if(!Number.isInteger(req.body.version))throw new Error('Reload the letter');await rpc('hr_respond_warning',{p_actor:req.user.id,p_id:req.params.id,p_body:cleanWarningResponse(req.body),p_version:req.body.version});res.json({success:true});
}catch(e){fail(res,e);}});
router.post('/:id/:action',async(req,res)=>{try{
 if(!['follow-up','record-receipt'].includes(req.params.action))return res.sendStatus(404);const f=await formFor(req);if(!f.actions.hr)return res.sendStatus(403);if(!Number.isInteger(req.body.version))throw new Error('Reload the letter');
 const body=req.params.action==='follow-up'?dates(textBody(req.body,['file_reference','review_date','notes']),['review_date']):dates(textBody(req.body,['status','received_date','reference','signature','comments']),['received_date']);body.review_completed=req.body.review_completed===true;body.confirmed=req.body.confirmed===true;if(req.params.action==='record-receipt'&&body.status!=='signed')body.signature='';
 await rpc('hr_warning_hr_record',{p_actor:req.user.id,p_id:req.params.id,p_action:req.params.action,p_body:body,p_version:req.body.version});res.json({success:true});
}catch(e){fail(res,e);}});
router.get('/:id/pdf',async(req,res)=>{try{
 const f=await formFor(req),bytes=await warningPdf(f.record,f.approval,await pdfBranding());res.set({'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':`attachment; filename="${f.record.letter_number||'UYF-Warning-Draft-'+req.params.id.slice(0,8)}.pdf"`}).send(bytes);
}catch(e){fail(res,e);}});
export default router;
