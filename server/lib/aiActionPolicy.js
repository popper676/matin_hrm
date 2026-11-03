const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateAiAction(kind,args={}) {
 const text=(key,max,optional=false)=>{
  const value=typeof args[key]==='string'?args[key].trim():'';
  if((!optional&&!value)||value.length>max)throw Object.assign(new Error('Invalid action field: '+key),{status:400});
  return value||null;
 };
 if(kind==='create_kpi_task'){
  const employee_id=text('employee_id',36),due_date=text('due_date',10,true);
  if(!UUID.test(employee_id)||due_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(due_date)||isNaN(Date.parse(due_date))))throw Object.assign(new Error('Choose a valid employee and due date.'),{status:400});
  return {title:text('title',200),description:text('description',8000,true),employee_id,due_date};
 }
 if(kind==='send_team_announcement'){
  const priority=args.priority||'Normal';if(!['Normal','High','Urgent','Low'].includes(priority))throw Object.assign(new Error('Invalid priority'),{status:400});
  return {title:text('title',200),content:text('content',8000),priority};
 }
 if(kind==='send_employee_warning')return {employee_name:text('employee_name',200),reason:text('reason',4000)};
 throw Object.assign(new Error('Unsupported AI action'),{status:400});
}
