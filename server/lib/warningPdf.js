import {DEFAULT_BRANDING} from '../../shared/branding.js';
import {drawBrandHeader} from './brandPresentation.js';
import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import {WARNING_LEVELS,WARNING_CATEGORIES,WARNING_ACTIONS,WARNING_PREVIOUS,WARNING_NOTICE,WARNING_ACK} from '../../shared/warningForm.js';
export function warningPdf(r,a, branding=DEFAULT_BRANDING){
 const doc=new PDFDocument({size:'A4',margin:46,bufferPages:true,info:{Title:r.letter_number||'Draft warning letter',Author:branding.name}}),chunks=[];
 const result=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.font(fileURLToPath(new URL('../fonts/Padauk-Regular.ttf',import.meta.url)));
 const reference=r.letter_number||'DRAFT - '+r.id.slice(0,8),d=r.data,e=r.employee_snapshot;
 const brand=title=>{drawBrandHeader(doc,branding,10);doc.fontSize(23).fillColor('#15263a').text(title);doc.fontSize(8).fillColor('#68788b').text(reference+' | '+r.status.toUpperCase()).moveDown();};
 const page=title=>{doc.addPage();brand(title);};
 const room=h=>{if(doc.y+h>765){doc.addPage();brand('Warning letter - continued');}};
 const heading=title=>{room(55);doc.moveDown(.6).fontSize(13).fillColor('#294d66').text(title).moveDown(.3);};
 const line=(label,value)=>{doc.fontSize(10).fillColor('#243247');const s=label+': '+(value||'-');room(doc.heightOfString(s,{width:500})+14);doc.text(s,{width:500,lineGap:3}).moveDown(.35);};
 const label=(options,key)=>options.find(v=>v[0]===key)?.[1]||'-';
 const stamp=v=>v?new Date(v).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false})+' (Bangkok)':'-';
 brand('Official employee written warning');line('Letter date',d.letter_date);line('Warning level',label(WARNING_LEVELS,d.level));line('Issued',stamp(r.issued_at));
 heading('1. Employee information');for(const [title,key]of [['Employee name','name'],['Employee ID','employee_number'],['Position / Job title','position'],['Department','department'],['Supervisor / Manager','manager']])line(title,e[key]);line('Date of incident',d.incident_date);line('Date employee was informed',r.issuance?.informed_date);
 heading('2. Reason for warning');for(const k of d.categories)line('Category',label(WARNING_CATEGORIES,k));if(d.other_category)line('Other',d.other_category);
 heading('3. Description of incident / violation');line('Date / time / location',[d.incident_date,d.incident_time,d.location].filter(Boolean).join(' | '));line('Description',d.description);line('Policy / rule / SOP violated',d.policy);
 page('Corrective action & employee response');
 heading('4. Previous counseling / warning');line('Previous action',label(WARNING_PREVIOUS,d.previous_action));if(d.previous_details)line('Details / date',d.previous_details);
 heading('5. Required corrective action');for(const k of d.actions)line('Required',label(WARNING_ACTIONS,k));if(d.corrective_other)line('Other / specific expectations',d.corrective_other);line('Target / review date',d.target_date);
 heading('6. Consequences of further violation');line('Important notice',WARNING_NOTICE);
 heading('7. Employee comments / response');line('Authenticated employee comments',r.employee_comment?.comments||'No comments recorded');if(r.employee_comment)line('Comments recorded',stamp(r.employee_comment.at));
 heading('8. Acknowledgment & signatures');line('Acknowledgment',WARNING_ACK);
 line('Employee receipt signature',r.acknowledgment?`${r.acknowledgment.signature} | ${stamp(r.acknowledgment.at)}`:'No employee portal receipt signature recorded');
 for(const s of a?.stages||[]){const h=a.history.find(v=>v.stage===s.key);line(s.label,h?`${h.actor_name} | ${h.decision} | ${stamp(h.at)}`:`${s.assignee_name} | Not completed`);if(h?.comment)line('Review comment',h.comment);}
 if(r.issuance){line('Explanation / opportunity record',r.issuance.explanation_note);line('Delivery method',r.issuance.delivery);if(r.issuance.delivery==='offline'){line('Actual delivery date',r.issuance.delivered_on);line('Delivery reference',r.issuance.delivery_reference);}}
 if(r.external_receipts?.length){heading('HR-recorded outside receipts');for(const v of r.external_receipts){line('Actual status / date',`${v.status} | ${v.received_date}`);if(v.signature)line('Signed name on paper',v.signature);line('Evidence reference',v.reference);if(v.comments)line('Transcribed comments / notes',v.comments);line('HR recorder',`${v.actor_name} | ${stamp(v.at)}`);}line('Provenance','Outside records are HR attestations, not authenticated employee portal signatures. Refusal or unavailability does not confirm receipt or agreement.');}
 if(r.hr_records){page('9. Confidential HR record');line('Visibility','Owner and assigned HR reviewer only');if(!r.hr_records.length)line('HR file','No HR entries recorded');for(const [i,v]of r.hr_records.entries()){heading('HR entry '+(i+1));line('HR file reference',v.file_reference);line('Follow-up / review date',v.review_date);line('HR notes',v.notes);line('Recorded by',`${v.actor_name} | ${stamp(v.at)}`);}}
 const pages=doc.bufferedPageRange();for(let n=pages.start;n<pages.start+pages.count;n++){doc.switchToPage(n);doc.page.margins.bottom=0;doc.fontSize(8).fillColor('#68788b').text(`Confidential personnel record | ${reference} | ${n+1} / ${pages.count}`,46,795,{width:500,lineBreak:false});}
 doc.end();return result;
}
