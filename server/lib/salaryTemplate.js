import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
import {can,personalCan,employeeScope} from '../../shared/accessPolicy.js';
import {salaryStatement,SALARY_COLUMNS} from '../../shared/salaryTemplate.js';
import {pdfBranding} from './branding.js';
import {drawBrandHeader} from './brandPresentation.js';

export function canReadPayroll(user,employeeId) {
 if(user?.is_owner)return true;
 const scope=employeeScope(user);
 return !!(can(user,'payroll','view')&&user.access?.sensitive?.salary&&(scope===null||scope.includes(employeeId)));
}
export function canReadPayslip(user,employeeId) {
 return canReadPayroll(user,employeeId)||(user?.employee_id===employeeId&&personalCan(user,'payslips'));
}
export async function salaryPdf(record,employee) {
 const s=salaryStatement(record,employee),brand=await pdfBranding(),doc=new PDFDocument({size:'A4',margin:42,info:{Title:'Salary Statement '+record.month,Author:brand.name}}),chunks=[];
 const result=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.font(fileURLToPath(new URL('../fonts/Padauk-Regular.ttf',import.meta.url)));
 drawBrandHeader(doc,brand,14);doc.fillColor('#15263a').moveDown().fontSize(20).text('Salary Statement').fontSize(10).text(`${record.month} · ${record.payment_status} · THB`).moveDown(.5);
 doc.fontSize(11).text(s.employee_name||employee.Full_name||'').fontSize(10).text('Employee ID: '+(s.employee_code||employee.employee_id||'—'));
 if(s.department)doc.text('Department: '+s.department);
 if(s.hire_date)doc.text('Join date: '+String(s.hire_date).slice(0,10));
 if(s.period_start)doc.text('Pay period: '+s.period_start+' to '+s.period_end);
 doc.moveDown(.7);
 const labels=s.legacy?[['basic_salary','Basic Salary'],['allowances','Allowances'],['bonus','Bonus'],['gross_salary','Gross Salary'],['total_deduction','Total Deduction'],['net_salary','Net Salary']]:SALARY_COLUMNS.slice(4);
 for(const [key,label]of labels){
  const y=doc.y,unit=['attendance_days','unpaid_leave_days'].includes(key)?' days':key==='ot_hours'?' hours':' THB';
  const total=['gross_salary','total_deduction','net_salary'].includes(key);
  if(total)doc.rect(42,y-2,511,22).fill('#f1f4f8');
  doc.fillColor('#223047').fontSize(total?11:10).text(label,50,y,{width:330,lineBreak:false});
  doc.text(Number(s[key]??0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})+unit,380,y,{width:165,align:'right',lineBreak:false});
  doc.y=y+22;
 }
 doc.moveDown(.5).fontSize(9).fillColor('#526071').text(s.legacy?'Historical payroll amounts are shown as saved.':'Employer SSB is an employer cost and is not deducted from net salary. Unpaid leave is deducted once in Total Deduction.',42,doc.y,{width:511,align:'left'});
 if(record.notes)doc.moveDown(.5).text('Notes: '+record.notes,42,doc.y,{width:511,align:'left'});
 doc.end();return result;
}
