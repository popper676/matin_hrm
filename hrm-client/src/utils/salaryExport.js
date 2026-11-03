import {utils,writeFile} from 'xlsx';
import {SALARY_COLUMNS,salaryPeriod} from '../../../shared/salaryTemplate.js';
const serial=day=>(Date.parse(day+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
export function createSalaryWorkbook(rows,month,company) {
 if(!rows.length)throw new Error('There are no saved salary-template records for this month.');
 const period=salaryPeriod(month),data=[[`${company} · ${month} Salary (THB)`],[],SALARY_COLUMNS.map(([,label])=>label),...rows.map(s=>SALARY_COLUMNS.map(([key])=>key==='hire_date'?(s[key]?serial(String(s[key]).slice(0,10)):null):s[key]??''))];
 const sheet=utils.aoa_to_sheet(data),set=(cell,value,formula,format)=>{sheet[cell]={t:typeof value==='number'?'n':'s',v:value,...(formula?{f:formula}:{}),...(format?{z:format}:{})};};
 set('G1','Pay Period');set('H1',serial(period.start),null,'yyyy-mm-dd');set('H2',serial(period.end),null,'yyyy-mm-dd');set('I2',period.days,'H2-H1+1','0');
 rows.forEach((s,index)=>{
  const r=index+4,formulas={G:`E${r}+F${r}`,H:`$I$2-S${r}`,I:`ROUND(E${r}/$I$2*H${r},2)`,K:`ROUND(E${r}*12/(52*48)*J${r}*2,2)`,N:`SUM(G${r},K${r}:M${r})`,T:`ROUND(G${r}/30*S${r},2)`,V:`SUM(O${r},Q${r}:R${r},T${r}:U${r})`,W:`N${r}-V${r}`};
  SALARY_COLUMNS.forEach(([key],column)=>{const address=utils.encode_cell({r:r-1,c:column});if(column===3&&s.hire_date)set(address,serial(String(s.hire_date).slice(0,10)),null,'yyyy-mm-dd');if(column>=4)set(address,Number(s[key]??0),formulas[utils.encode_col(column)],'#,##0.00');});
 });
 const totalRow=rows.length+4;set('A'+totalRow,'Total');
 SALARY_COLUMNS.forEach(([key],column)=>{if(column<4||['attendance_days','unpaid_leave_days'].includes(key))return;const letter=utils.encode_col(column),amount=rows.reduce((sum,s)=>sum+Number(s[key]??0),0);set(letter+totalRow,Math.round(amount*100)/100,`SUM(${letter}4:${letter}${totalRow-1})`,'#,##0.00');});
 set('A'+(totalRow+2),'Unpaid leave is deducted once. Employer SSB is not an employee deduction. SSB, tax and loan amounts are reviewed manual inputs.');
 sheet['!ref']=`A1:W${totalRow+2}`;sheet['!autofilter']={ref:`A3:W${totalRow-1}`};sheet['!cols']=SALARY_COLUMNS.map(([,label],i)=>({wch:i===1?32:i===2?30:Math.max(16,label.length+2)}));sheet['!rows']=[{hpt:28},{hpt:22},{hpt:44}];
 const workbook=utils.book_new();utils.book_append_sheet(workbook,sheet,'Salary');return workbook;
}
export function exportSalaryWorkbook(rows,month,company){writeFile(createSalaryWorkbook(rows,month,company),`Salary_${month}.xlsx`);}
