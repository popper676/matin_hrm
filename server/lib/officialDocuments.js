import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import {systemDb} from './supabase.js';
import {pdfBranding} from './branding.js';
import {drawBrandHeader} from './brandPresentation.js';
import {can,personalCan,employeeScope} from '../../shared/accessPolicy.js';

export function canOpenDocument(user,doc,source=doc) {
 if(user.is_owner)return true;
 const scope=employeeScope(user),own=doc.employee_id===user.employee_id;
 const management=can(user,'documents')&&(doc.employee_id==null||scope===null||scope.includes(doc.employee_id));
 const personal=personalCan(user,'documents')&&(own||doc.employee_id==null)&&['ACTIVE','COMPLETED_AND_ISSUED'].includes(doc.status);
 if(!management&&!personal)return false;
 if(source.generated_snapshot?.new_salary!=null&&!user.access.sensitive.salary&&!(personal&&own))return false;
 return true;
}
export async function findDocument(id,requestOnly=false) {
 if(!/^[0-9a-f-]{36}$/i.test(id))return null;
 const tables=requestOnly?['doc_approval_requests']:['employee_documents','doc_approval_requests'];
 for(const table of tables){
  const {data,error}=await systemDb.from(table).select('*').eq('id',id).maybeSingle();
  if(error)throw error;
  if(data)return data;
 }
 return null;
}
export async function officialDocumentPdf(record) {
 const brand=await pdfBranding(),snapshot=record.generated_snapshot||{},doc=new PDFDocument({size:'A4',margin:46,info:{Title:record.title,Author:brand.name}}),chunks=[];
 const result=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.font(fileURLToPath(new URL('../fonts/Padauk-Regular.ttf',import.meta.url)));
 const line=(label,value)=>{doc.fontSize(10).fillColor('#243247').text(label+': '+(value??'—'),{lineGap:3}).moveDown(.6);};
 drawBrandHeader(doc,brand,14);
 doc.moveDown().fontSize(22).fillColor('#15263a').text(record.title).moveDown(.5);
 line('Document type',record.doc_type||record.category||'Official letter');
 line('Reference',record.id);
 line('Status',record.status);
 line('Effective date',record.effective_date);
 line('Employee',snapshot.employee_name||'General template');
 if(snapshot.employee_code)line('Employee code',snapshot.employee_code);
 if(record.description)line('Details',record.description);
 if(snapshot.new_position)line('Position',snapshot.new_position);
 if(snapshot.new_department)line('Department',snapshot.new_department);
 if(snapshot.new_salary!=null)line('New salary',`${snapshot.salary_currency||'THB'} ${Number(snapshot.new_salary).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} / month`);
 for(const stage of ['boss','hr']){
  const signature=record[stage+'_signature'],at=record[stage+'_signed_at'];
  const label=stage==='boss'?'Executive approval':'HR issue';
  line(label,signature&&at?'Signed at '+new Date(at).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false})+' (Bangkok)':'Not signed');
  if(signature)line('Recorded signature',String(signature).startsWith('data:')?'Electronic signature recorded':String(signature).slice(0,2000));
 }
 if(record.rejection_reason)line('Review reason',record.rejection_reason);
 doc.moveDown().fontSize(8).fillColor('#68788b').text('Confidential · '+brand.name+' · Generated from the saved approval record');
 doc.end();return result;
}
