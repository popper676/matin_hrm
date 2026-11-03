export function employeeSalary(value) {
 if(value===null||value===undefined||value==='')return null;
 if(!['number','string'].includes(typeof value)||String(value).trim()==='')throw Object.assign(new Error('Salary must be a non-negative number.'),{status:400});
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>100000000)throw Object.assign(new Error('Salary must be a non-negative number up to 100,000,000.'),{status:400});
 return n;
}
