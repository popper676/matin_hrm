import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import {systemDb} from '../shared/db/index.js';
import {can,hasManagement,personalCan,UUID} from '../../shared/accessPolicy.js';
import {cleanBusiness,cleanOperationsSettings,todayBangkok,validMonth} from '../../shared/operations.js';
import {allRows,checked,loadOperationsData,operationsSettings,scoped} from '../lib/operationsData.js';
import {buildOperationsTasks} from '../lib/operationsTasks.js';
import {monthlyReview} from '../lib/monthlyReview.js';
import {employee360} from '../lib/employee360.js';
import {runOperationsReminders} from '../lib/operationsReminders.js';
import {expenseVisible,EXPENSE_BUCKET} from '../lib/expenseForms.js';
import {validateInformationFile} from '../lib/employeeInformation.js';
const router=express.Router(),first=d=>Array.isArray(d)?d[0]:d;
const fail=(res,e)=>res.status(e.status||(/changed|already|retained|23505/.test(e.message)?409:/permission|outside|Owner|Salary/.test(e.message)?403:400)).json({error:/does not exist|schema cache/.test(e.message)?'Apply migration 010 in the existing HR project before using this feature.':e.message});
const owner=req=>{if(!req.user.is_owner)throw Object.assign(new Error('Owner permission required'),{status:403});};
const uuid=id=>{if(!UUID.test(id||''))throw new Error('Invalid record reference');return id;};
const monthFor=req=>{const m=req.query.month||todayBangkok().slice(0,7);if(!validMonth(m))throw new Error('Choose a valid month');return m;};
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/businesses',async(req,res)=>{try{if(!hasManagement(req.user)&&!personalCan(req.user,'profile'))return res.sendStatus(403);res.json({businesses:await allRows('hr_business_units'),can_edit:!!req.user.is_owner});}catch(e){fail(res,e);}});
router.put('/businesses/:key',async(req,res)=>{try{owner(req);if(!Number.isInteger(req.body.version))throw new Error('Reload business settings');const data=cleanBusiness({...req.body,key:req.params.key});const record=first(checked(await systemDb.rpc('hr_save_business_unit',{p_actor:req.user.id,p_data:data,p_version:req.body.version})));res.json({business:record});}catch(e){fail(res,e);}});
router.get('/settings',async(req,res)=>{try{owner(req);res.json({setting:await operationsSettings(),runs:checked(await systemDb.from('hr_reminder_runs').select('*').order('created_at',{ascending:false}).limit(20))});}catch(e){fail(res,e);}});
router.put('/settings',async(req,res)=>{try{owner(req);if(!Number.isInteger(req.body.version))throw new Error('Reload reminder settings');res.json({setting:first(checked(await systemDb.rpc('hr_save_operations_settings',{p_actor:req.user.id,p_settings:cleanOperationsSettings(req.body.settings),p_version:req.body.version})))});}catch(e){fail(res,e);}});
router.get('/reminders/preview',async(req,res)=>{try{owner(req);res.json(await runOperationsReminders({preview:true}));}catch(e){fail(res,e);}});
router.post('/reminders/run',async(req,res)=>{try{owner(req);res.json(await runOperationsReminders({actor:req.user.id}));}catch(e){fail(res,e);}});
router.get('/today',async(req,res)=>{try{
 if(!can(req.user,'today'))return res.sendStatus(403);const data=await loadOperationsData(),setting=await operationsSettings(),business=req.query.business||'';if(business&&!data.businesses.some(b=>b.key===business))throw new Error('Choose a valid business');
 const tasks=buildOperationsTasks(req.user,data,setting.settings,todayBangkok(),{business});res.json({date:todayBangkok(),tasks,businesses:data.businesses,reminders_enabled:setting.settings.enabled,summary:{total:tasks.length,overdue:tasks.filter(t=>t.state==='overdue').length,today:tasks.filter(t=>t.state==='today').length,upcoming:tasks.filter(t=>t.state==='upcoming').length}});
}catch(e){fail(res,e);}});
router.get('/monthly',async(req,res)=>{try{if(!can(req.user,'monthly-review'))return res.sendStatus(403);const data=await loadOperationsData('monthly'),business=req.query.business||'';if(business&&!data.businesses.some(b=>b.key===business))throw new Error('Choose a valid business');res.json(monthlyReview(req.user,data,monthFor(req),business));}catch(e){fail(res,e);}});
router.get('/employees/:id',async(req,res)=>{try{const id=uuid(req.params.id),personal=req.query.personal==='1';if(!(personal?req.user.employee_id===id&&personalCan(req.user,'profile'):scoped(req.user,'employees',id)))return res.sendStatus(403);const data=await loadOperationsData('employee'),record=employee360(req.user,data,id,monthFor(req),personal);if(!record)return res.sendStatus(404);res.json(record);}catch(e){fail(res,e);}});
// Employee-to-business assignment is retired; historical data is preserved read-only.
router.post('/employees/:id/businesses',(req,res)=>res.status(410).json({error:'Employee business assignments are retired. Expense business tags remain available on employee expense requests.'}));
async function expenseFor(req){
 const row=checked(await systemDb.from('rewards_and_claims').select('*').eq('id',uuid(req.params.id)).maybeSingle());if(!row||row.form_version!==2)throw Object.assign(new Error('Expense form not found'),{status:404});
 const approval=checked(await systemDb.from('hr_approval_requests').select('*').eq('workflow_key','expense').eq('resource_id',row.id).maybeSingle());if(!expenseVisible(req.user,row,approval))throw Object.assign(new Error('Expense outside your access'),{status:403});
 const can_record=req.user.is_owner||scoped(req.user,'rewards',row.employee_id,'edit')||scoped(req.user,'rewards',row.employee_id,'pay')||approval?.stages?.some(stage=>stage.key==='finance'&&stage.action==='pay'&&stage.assignee_id===req.user.id)&&can(req.user,'rewards','pay');return {row,approval,can_record};
}
router.get('/expenses/:id',async(req,res)=>{try{const f=await expenseFor(req),rows=checked(await systemDb.from('hr_expense_receipts').select('*').eq('expense_id',f.row.id).order('created_at'));res.json({can_record:f.can_record,documents:f.row.form_snapshot.documents||[],receipts:rows.map(r=>({...r,documents:r.documents.map(d=>({...d,url:`/api/hr-operations/expenses/${f.row.id}/receipts/${r.id}/${d.id}`}))}))});}catch(e){fail(res,e);}});
const receive=multer({storage:multer.memoryStorage(),limits:{files:5,fileSize:10485760,fields:8,fieldSize:6000}}).array('attachments',5);
router.post('/expenses/:id/receipts',(req,res,next)=>receive(req,res,e=>e?res.status(400).json({error:'Attach up to five PDF/JPEG/PNG receipt files, each at most 10 MB'}):next()),async(req,res)=>{
 const uploaded=[];try{
  const {row,can_record}=await expenseFor(req);if(!can_record)return res.sendStatus(403);const id=uuid(req.body.id),reference=String(req.body.reference||'').trim(),notes=String(req.body.notes||'').trim(),existing=JSON.parse(req.body.existing_document_ids||'[]');
  if(req.body.confirmed!=='true'||reference.length>1000||notes.length>4000||!Array.isArray(existing)||existing.length>5||existing.some(v=>!UUID.test(v)))throw new Error('Confirm the receipt evidence and enter valid references');
  const documents=[],files=(req.files||[]).map(file=>({...validateInformationFile(file,'other'),file}));
  for(const {file,mime,ext}of files){const docid=crypto.randomUUID(),path=`${row.employee_id}/receipts/${row.id}/${id}/${docid}.${ext}`;checked(await systemDb.storage.from(EXPENSE_BUCKET).upload(path,file.buffer,{contentType:mime,upsert:false}));uploaded.push(path);documents.push({id:docid,ext,mime,size:file.size,name:Buffer.from(file.originalname,'latin1').toString('utf8').replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,250)});}
  const record=first(checked(await systemDb.rpc('hr_record_expense_receipt',{p_actor:req.user.id,p_id:id,p_expense:row.id,p_reference:reference,p_notes:notes,p_existing:existing,p_documents:documents}))),kept=new Set(record.documents.map(d=>d.id)),unused=uploaded.filter(p=>!kept.has(p.split('/').pop().split('.')[0]));uploaded.length=0;if(unused.length)await systemDb.storage.from(EXPENSE_BUCKET).remove(unused);res.json({receipt:record});
 }catch(e){if(uploaded.length)try{await systemDb.storage.from(EXPENSE_BUCKET).remove(uploaded);}catch{/* cleanup can be retried by storage maintenance */}fail(res,e);}
});
router.get('/expenses/:id/receipts/:receipt/:document',async(req,res)=>{try{const {row}=await expenseFor(req),r=checked(await systemDb.from('hr_expense_receipts').select('*').eq('id',uuid(req.params.receipt)).eq('expense_id',row.id).maybeSingle()),d=r?.documents.find(d=>d.id===req.params.document);if(!d)return res.sendStatus(404);const signed=checked(await systemDb.storage.from(EXPENSE_BUCKET).createSignedUrl(`${row.employee_id}/receipts/${row.id}/${r.id}/${d.id}.${d.ext}`,60,{download:d.name}));res.redirect(signed.signedUrl);}catch(e){fail(res,e);}});
export default router;
