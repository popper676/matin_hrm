import PDFDocument from 'pdfkit';
export async function prepareDemoFiles(files) {
 return Promise.all(files.map(async file=>{
  if(file.content)return file;
  const doc=new PDFDocument({size:'A4',margin:54}),chunks=[];
  const finished=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.fontSize(21).fillColor('#9c2242').text('DEMO — FICTIONAL DOCUMENT');
  doc.moveDown().fontSize(11).fillColor('#222222').text(file.pdfText);
  doc.moveDown().fontSize(9).text('For HR system demonstration only. No real identity, employment or payment record.');doc.end();
  return {...file,content:await finished};
 }));
}
// Database cleanup precedes storage deletion. A failed removal remains retryable.
export async function removeDemoFiles(db, runId, files, {tracked=false}={}) {
 const pending=[];
 for(const f of files){
  if((!tracked&&!f.path.startsWith(`demo/${runId}/`))||f.path.includes('..')||!['avatars','resumes','recruitment_documents','leave_documents','handover_documents','expense_documents','employee_information','company_documents','sop_videos','attendance_photos'].includes(f.bucket))throw new Error('Refusing an attachment outside this demo namespace.');
  const {error}=await db.storage.from(f.bucket).remove([f.path]);
  if(error){pending.push(f);continue;}
  const result=await db.from('hr_demo_files').update({deleted_at:new Date().toISOString()}).eq('run_id',runId).eq('bucket',f.bucket).eq('path',f.path);
  if(result.error)pending.push(f);
 }
 return pending;
}
