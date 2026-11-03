import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import nodemailer from 'nodemailer';
import express from 'express';
import {extractRecruitmentText,receiveRecruitmentFile} from '../lib/recruitmentFiles.js';
import {renderInterviewEmail,DEFAULT_BRANDING} from '../../shared/branding.js';

const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function docx(xml,parts={}) {
 const zip=new JSZip();zip.file('word/document.xml',xml);
 for(const [name,content] of Object.entries(parts))zip.file(name,content);
 return {originalname:'requirements.docx',mimetype:mime,buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})};
}
const wrap=body=>'<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body>'+body+'</x:body></x:document>';
test('DOCX recruitment extraction preserves Unicode, paragraphs, tables and notes',async()=>{
 const file=await docx(wrap('<x:p><x:r><x:t>JD မြန်မာ</x:t><x:tab/><x:t>Requirements</x:t><x:br/><x:t>Node.js</x:t></x:r></x:p><x:tbl><x:tr><x:tc><x:p><x:r><x:t>Experience</x:t></x:r></x:p></x:tc><x:tc><x:p><x:r><x:t>2 years</x:t></x:r></x:p></x:tc></x:tr></x:tbl><x:p><x:del><x:r><x:t>Old requirement</x:t></x:r></x:del><x:r><x:t>Current requirement</x:t></x:r></x:p>'),{'word/footnotes.xml':wrap('<x:p><x:r><x:t>Footnote evidence</x:t></x:r></x:p>')});
 const result=await extractRecruitmentText(file);
 assert.equal(result.status,'ready');
 for(const text of ['JD မြန်မာ\tRequirements\nNode.js','Experience','2 years','Current requirement','Footnote evidence'])assert(result.text.includes(text),result.text);
 assert(!result.text.includes('Old requirement'));
});
test('DOCX reader never follows external relationships or exposes field instructions',async()=>{
 const file=await docx(wrap('<x:p><x:r><x:instrText>INCLUDETEXT file:///etc/passwd</x:instrText><x:t>Visible requirements</x:t></x:r></x:p>'),{'word/_rels/document.xml.rels':'<Relationships><Relationship Target="https://external.invalid/private" TargetMode="External"/></Relationships>'});
 const result=await extractRecruitmentText(file);
 assert.deepEqual(result,{text:'Visible requirements',status:'ready'});
});
test('DOCX extraction rejects entity expansion, malformed XML and missing body',async()=>{
 for(const xml of ['<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]>'+wrap('<x:p>&secret;</x:p>'),wrap('<x:p><x:r><x:t>Broken</x:p>')])
  assert.equal((await extractRecruitmentText(await docx(xml))).status,'failed');
 const zip=new JSZip();zip.file('word/header1.xml',wrap('<x:p>Not a document</x:p>'));
 assert.equal((await extractRecruitmentText({originalname:'broken.docx',mimetype:mime,buffer:await zip.generateAsync({type:'nodebuffer'})})).status,'failed');
});
test('updated mail transport renders the recruitment invitation without contacting SMTP',async()=>{
 const message=renderInterviewEmail(DEFAULT_BRANDING,{candidate:'Candidate မြန်မာ',position:'Automation Developer',meeting_details:'Monday at 09:00'});
 const transport=nodemailer.createTransport({jsonTransport:true});
 const info=await transport.sendMail({from:'hr@example.test',to:'candidate@example.test',...message,disableFileAccess:true,disableUrlAccess:true});
 const rendered=JSON.parse(info.message);
 assert.equal(rendered.to[0].address,'candidate@example.test');
 assert.equal(rendered.subject,message.subject);assert.equal(rendered.html,message.html);
 assert(rendered.text.includes('Monday at 09:00'));
});
test('updated multipart parser enforces recruitment limits and remains responsive after malformed fields',async()=>{
 const app=express();app.post('/files',receiveRecruitmentFile('file'),(req,res)=>res.json({success:true}));app.get('/health',(req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 try {
  const valid=new FormData();valid.append('file',new Blob(['Requirements']),'JD.txt');assert.equal((await fetch(url+'/files',{method:'POST',body:valid})).status,200);
  const tooMany=new FormData();tooMany.append('file',new Blob(['One']),'one.txt');tooMany.append('file',new Blob(['Two']),'two.txt');assert.equal((await fetch(url+'/files',{method:'POST',body:tooMany})).status,400);
  const large=new FormData();large.append('file',new Blob([new Uint8Array(10485761)]),'large.txt');assert.equal((await fetch(url+'/files',{method:'POST',body:large})).status,413);
  for(const name of ['x[999999999]','x['.repeat(200)]) {
   const data=new FormData();data.append(name,'value');const response=await fetch(url+'/files',{method:'POST',body:data});assert([200,400].includes(response.status));
   assert.equal((await fetch(url+'/health')).status,200);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
