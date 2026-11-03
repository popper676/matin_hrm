// The uploaded salary schedule's A:W column order. Values are THB unless days/hours.
export const SALARY_COLUMNS = [
 ['employee_code','ID'],['employee_name','Name'],['department','Department'],['hire_date','Join Date'],
 ['basic_salary','Basic Salary'],['fixed_allowance','Fixed Allowance'],['total_salary','Total Salary'],
 ['attendance_days','Attendance Day'],['salary_after_attendance','Salary After Attendance Deduction'],
 ['ot_hours','OT Hours'],['ot_amount','OT Amount'],['special_allowance','Special Allowance'],
 ['scarcity_allowance','Scarcity Allowance'],['gross_salary','Gross Salary'],['ssb_employee','SSB Employee'],
 ['ssb_employer','SSB Employer'],['income_tax','Income Tax'],['staff_loan','Staff Loan'],
 ['unpaid_leave_days','Unpaid Leave Day'],['unpaid_leave','Unpaid Leave'],['other_deduction','Other Deduction'],
 ['total_deduction','Total Deduction'],['net_salary','Net Salary'],
];
export const SALARY_INPUTS = ['basic_salary','fixed_allowance','ot_hours','special_allowance','scarcity_allowance','ssb_employee','ssb_employer','income_tax','staff_loan','unpaid_leave_days','other_deduction'];
export function salaryPeriod(month) {
 if(!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month||''))throw new Error('Choose a valid salary month.');
 const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 return {start:month+'-01',end:month+'-'+days,days};
}
export const salaryMoney=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const roundedRatio=(numerator,denominator)=>Number((numerator*2n+denominator)/(denominator*2n));
export function calculateSalaryTemplate(month,input) {
 const period=salaryPeriod(month),v={};
 for(const key of SALARY_INPUTS){
  const raw=input[key];
  if(raw===undefined||raw===null||(typeof raw==='string'&&raw.trim()==='')||!['number','string'].includes(typeof raw)||!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>100000000)throw new Error('Enter a non-negative number for '+key+'.');
  const n=Number(raw);
  if(Math.abs(n*100-Math.round(n*100))>0.00001)throw new Error(key+' allows up to two decimal places.');
  v[key]=n;
 }
 if(v.unpaid_leave_days>period.days||v.unpaid_leave_days*2!==Math.round(v.unpaid_leave_days*2))throw new Error('Unpaid leave must be in half days within the salary period.');
 if(v.ot_hours>period.days*24)throw new Error('OT hours exceed the salary period.');
 const cents=key=>Math.round(v[key]*100),total=cents('basic_salary')+cents('fixed_allowance');
 const halves=BigInt(v.unpaid_leave_days*2),basic=BigInt(cents('basic_salary'));
 const unpaidCents=roundedRatio(BigInt(total)*halves,60n);
 const otCents=roundedRatio(basic*24n*BigInt(Math.round(v.ot_hours*100)),249600n);
 const grossCents=total+otCents+cents('special_allowance')+cents('scarcity_allowance');
 const deductionCents=cents('ssb_employee')+cents('income_tax')+cents('staff_loan')+unpaidCents+cents('other_deduction');
 const total_salary=total/100,unpaid_leave=unpaidCents/100,ot_amount=otCents/100,gross_salary=grossCents/100,total_deduction=deductionCents/100;
 return {...v,version:1,currency:'THB',period_start:period.start,period_end:period.end,period_days:period.days,
  total_salary,attendance_days:period.days-v.unpaid_leave_days,
  salary_after_attendance:roundedRatio(basic*(BigInt(period.days)*2n-halves),BigInt(period.days)*2n)/100,
  ot_amount,unpaid_leave,gross_salary,total_deduction,net_salary:(grossCents-deductionCents)/100};
}
export function salaryStatement(record,employee={}) {
 if(record.salary_template)return {...record.salary_template,payment_status:record.payment_status,month:record.month,id:record.id};
 const basic_salary=Number(record.basic_salary??record.base_salary??0),allowances=Number(record.allowances??record.allowance??0),bonus=Number(record.bonus??0),deductions=Number(record.deductions??0);
 return {id:record.id,month:record.month,currency:'THB',legacy:true,employee_code:employee.employee_id||'',employee_name:employee.Full_name||'',
  basic_salary,allowances,bonus,gross_salary:salaryMoney(basic_salary+allowances+bonus),total_deduction:deductions,
  net_salary:Number(record.net_salary??record.net_pay??0),payment_status:record.payment_status};
}
