import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import {extractText,getDocumentProxy} from 'unpdf';
import {logoPng} from './brandingFixtures.js';
import {emptyPolicy} from '../../shared/accessPolicy.js';
import {getBkkDateString} from '../lib/dateUtils.js';
export async function exerciseMedium({db,request,rejected,realFetch,base,getCookie,setCookie,ownerCookie,makeAccount,mockAi,getAiContents}){
 const sql=async(text,args=[])=>(await db.query(text,args)).rows;
 const photo='data:image/png;base64,'+logoPng().toString('base64');
 setCookie(ownerCookie);
 const staff=await makeAccount('MED-STAFF','Medium employee'),reviewer=await makeAccount('MED-REVIEW','Medium reviewer');
 await request('/access/people/'+staff.id,'PUT',{policy:{...emptyPolicy(),personal:['attendance','checkin','documents','voting']},version:0});
 await request('/access/people/'+reviewer.id,'PUT',{policy:{...emptyPolicy(),scope:'selected',employee_ids:[staff.emp],modules:{attendance:['view','approve'],documents:['view','create','approve'],employees:['view','edit']},sensitive:{salary:true}},version:0});
 const assigned=await request('/overtime/request','POST',{employee_id:staff.emp,ot_date:'2026-10-20',start_time:'17:00',end_time:'19:00',reason:'Assigned shift',requested_by:'hr_boss'});
 await request('/auth/login','POST',{username:staff.username,password:'Test-pass-1'});const staffCookie=getCookie();
 await request('/overtime/'+assigned.id+'/status','PUT',{status:'Approved'},{'X-HR-Portal':'employee'});
 const ownRequest=await request('/overtime/request','POST',{employee_id:staff.emp,ot_date:'2026-10-21',start_time:'17:00',end_time:'19:00',requested_by:'hr_boss'},{'X-HR-Portal':'employee'});
 assert.equal(ownRequest.requested_by,'employee');assert.equal(ownRequest.status,'Pending_Boss_Approval');
 await rejected('/overtime/'+ownRequest.id+'/status','PUT',{status:'Approved'},403);
 const peers=await request('/peer-voting/colleagues');assert(peers.employees.some(e=>e.id===reviewer.emp));assert(peers.employees.every(e=>Object.keys(e).every(k=>['id','Full_name','employee_id'].includes(k))));
 await request('/peer-voting/submit','POST',{nominee_id:reviewer.emp,attendance:4,punctuality:4,sops:4,peer:4,initiative:4,comment:'Specific feedback'});
 await rejected('/peer-voting/submit','POST',{nominee_id:reviewer.emp,attendance:4,punctuality:4,sops:4,peer:4,initiative:4},409);
 await rejected('/attendance/photo-checkin','POST',{employee_id:staff.emp,photo_base64:'bad photo'},400);
 const yesterday=getBkkDateString(new Date(Date.now()-86400000));
 const shift=(await sql("INSERT INTO shifts(shift_name,start_time,end_time) VALUES('Medium night','22:00','06:00') RETURNING id"))[0].id;
 const night=(await sql('INSERT INTO attendance_records(employee_id,check_in,claimed_shift_id,attendance_method) VALUES($1,$2,$3,$4) RETURNING id',[staff.emp,yesterday+'T22:00:00+07:00',shift,'Photo']))[0].id;
 const checkout=await request('/attendance/photo-checkin','POST',{employee_id:staff.emp,photo_base64:photo});assert.match(checkout.message,/Check-out/);
 const record=(await sql('SELECT * FROM attendance_records WHERE id=$1',[night]))[0];assert(record.check_out);assert(record.check_out_photo_url);
 assert.equal((await sql('SELECT count(*)::int n FROM attendance_records WHERE employee_id=$1',[staff.emp]))[0].n,1);
 const photoPath=record.check_out_photo_url.replace(/^\/api/,'');
 assert.equal((await realFetch(base+photoPath,{headers:{Cookie:getCookie()},redirect:'manual'})).status,302);
 await request('/auth/login','POST',{username:reviewer.username,password:'Test-pass-1'});const reviewerCookie=getCookie();
 await request('/overtime/'+ownRequest.id+'/status','PUT',{status:'Approved'});
 await rejected('/overtime/'+ownRequest.id+'/status','PUT',{status:'Rejected'},409);
 await request('/employees/'+staff.emp+'/timeline','POST',{event_type:'COMMENDATION',title:'Medium verified milestone',description:'Reviewed contribution',effective_date:'2026-10-21'});
 await sql("INSERT INTO employee_documents(employee_id,title,file_url) VALUES($1,'Private source','company_documents/outside-scope.pdf')",[reviewer.emp]);
 await rejected('/documents/request-approval','POST',{employee_id:staff.emp,title:'Cannot attach a guessed private source',file_url:'company_documents/outside-scope.pdf'},403);
 await rejected('/employees/'+staff.emp+'/timeline','POST',{event_type:'WARNING',title:'Not an official warning'},400);
 const alert=(await sql("INSERT INTO system_notifications(recipient_role,employee_id,title,link_url) VALUES('hr_manager',$1,'Capability notice','/attendance') RETURNING id",[staff.emp]))[0].id;
 assert((await request('/notifications')).notifications.some(n=>n.id===alert));
 await request('/notifications/'+alert+'/read','POST',{});assert.equal((await request('/notifications')).notifications.find(n=>n.id===alert).is_read,true);
 setCookie(ownerCookie);assert.equal((await request('/notifications')).notifications.find(n=>n.id===alert).is_read,false);
 const foreign=(await sql("INSERT INTO system_notifications(recipient_user_id,title,link_url) VALUES($1,'Private notice','/portal') RETURNING id",[staff.id]))[0].id;
 await rejected('/notifications/'+foreign+'/read','POST',{},404);
 const letter=(await request('/documents/request-approval','POST',{employee_id:staff.emp,title:'Medium salary letter',category:'Contract',doc_type:'Contract',description:'Saved details မြန်မာ',new_salary:0,effective_date:'2026-10-21'})).request;
 const readPdf=async cookie=>{
  const response=await realFetch(base+'/documents/download/'+letter.id,{headers:{Cookie:cookie}});assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),'%PDF-');
  return (await extractText(await getDocumentProxy(bytes),{mergePages:true})).text;
 };
 let text=await readPdf(reviewerCookie);assert(text.includes('PENDING_BOSS'));assert(text.includes('THB 0.00'));assert(!text.includes('USD / Month'));
 setCookie(staffCookie);await rejected('/documents/download/'+letter.id,'GET',undefined,403);
 setCookie(reviewerCookie);await request('/documents/boss-sign/'+letter.id,'POST',{action:'APPROVE',boss_signature:'Reviewed executive signature'});await request('/documents/hr-sign/'+letter.id,'POST',{hr_signature:'Reviewed HR signature'});
 text=await readPdf(staffCookie);assert(text.includes('COMPLETED_AND_ISSUED'));assert(text.includes('Reviewed HR signature'));assert(!text.includes('Not signed'));
 setCookie(ownerCookie);await rejected('/documents/request/'+letter.id,'DELETE',{},409);
 // SMTP is mocked; the failed attempt must preserve Applied, while acceptance precedes Interview.
 const candidate=(await request('/recruitment','POST',{candidate_name:'Medium candidate',email:'candidate@example.test'})).candidate;
 const originalTransport=nodemailer.createTransport,oldUser=process.env.EMAIL_USER,oldPass=process.env.EMAIL_PASS;
 process.env.EMAIL_USER='hr@example.test';process.env.EMAIL_PASS='offline-only';
 try{
  nodemailer.createTransport=()=>({sendMail:async()=>{throw new Error('Synthetic SMTP failure');}});
  await rejected('/recruitment/'+candidate.id+'/send-interview','POST',{date:'2026-10-22',time:'10:00',link:'Office'},502);
  assert.equal((await sql('SELECT status FROM recruitment_candidates WHERE id=$1',[candidate.id]))[0].status,'Applied');
  nodemailer.createTransport=()=>({sendMail:async()=>({accepted:['candidate@example.test']})});
  await request('/recruitment/'+candidate.id+'/send-interview','POST',{date:'2026-10-22',time:'10:00',link:'Office'});
  assert.equal((await sql('SELECT status FROM recruitment_candidates WHERE id=$1',[candidate.id]))[0].status,'Interview');
 }finally{nodemailer.createTransport=originalTransport;if(oldUser===undefined)delete process.env.EMAIL_USER;else process.env.EMAIL_USER=oldUser;if(oldPass===undefined)delete process.env.EMAIL_PASS;else process.env.EMAIL_PASS=oldPass;}
 const session=(await sql("INSERT INTO boss_chat_sessions(user_id,title) SELECT id,'Recent history' FROM sys_users WHERE is_owner LIMIT 1 RETURNING id"))[0].id;
 for(let n=0;n<20;n++)await sql('INSERT INTO boss_chat_messages(session_id,role,content,created_at) VALUES($1,$2,$3,$4)',[session,n%2?'ai':'user','history-'+n,new Date(Date.UTC(2020,0,1,0,0,n)).toISOString()]);
 mockAi(staff.emp);
 try{await request('/boss/chat','POST',{session_id:session,message:'Latest single question'});}finally{mockAi(null);}
 const contents=getAiContents();const all=JSON.stringify(contents);
 assert(all.includes('history-19'));assert(all.includes('history-10'));assert(!all.includes('history-9"'));assert.equal(contents.filter(m=>m.parts?.some(p=>p.text==='Latest single question')).length,1);
 // Actual access and refresh tokens are both rejected after logout/password reset.
 const loginMobile=async()=>{
  const response=await realFetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Client':'mobile'},body:JSON.stringify({username:staff.username,password:'Test-pass-1'})});assert.equal(response.status,200);return response.json();
 };
 const mobile=await loginMobile();
 assert.equal((await realFetch(base+'/auth/me',{headers:{'X-Client':'mobile',Authorization:'Bearer '+mobile.accessToken}})).status,200);
 assert.equal((await realFetch(base+'/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Client':'mobile',Authorization:'Bearer '+mobile.accessToken},body:'{}'})).status,200);
 assert.equal((await realFetch(base+'/auth/me',{headers:{'X-Client':'mobile',Authorization:'Bearer '+mobile.accessToken}})).status,401);
 assert.equal((await realFetch(base+'/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-Client':'mobile'},body:JSON.stringify({refreshToken:mobile.refreshToken})})).status,401);
 const second=await loginMobile();
 await request('/boss/users/'+staff.id+'/reset-password','PUT',{new_password:'Medium-new-pass-1'});
 assert.equal((await realFetch(base+'/auth/me',{headers:{'X-Client':'mobile',Authorization:'Bearer '+second.accessToken}})).status,401);
 assert.equal((await realFetch(base+'/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json','X-Client':'mobile'},body:JSON.stringify({refreshToken:second.refreshToken})})).status,401);
 // An expired access cookie must not prevent logout from revoking the valid refresh session.
 await request('/auth/login','POST',{username:reviewer.username,password:'Test-pass-1'});
 const cookies=Object.fromEntries(getCookie().split('; ').map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
 const decoded=jwt.decode(cookies.token);const expired=jwt.sign({id:reviewer.id,sid:decoded.sid,token_type:'access',exp:1},process.env.JWT_SECRET);
 await realFetch(base+'/auth/logout',{method:'POST',headers:{Cookie:'token='+expired+'; refresh_token='+cookies.refresh_token}});
 assert.equal((await realFetch(base+'/auth/refresh',{method:'POST',headers:{Cookie:'refresh_token='+cookies.refresh_token}})).status,401);
 setCookie(ownerCookie);
}
