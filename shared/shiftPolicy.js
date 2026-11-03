// The same precedence as the SQL leave calendar: daily > date exception > roster > company week.
export function shiftForDay(employee,day,{schedules=[],rosters=[],shifts=[],settings={},dates=[]}={},claimed=null) {
 const latest=rows=>[...rows].sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))||String(b.id||'').localeCompare(String(a.id||'')))[0];
 const weekday=new Date(day+'T12:00:00Z').getUTCDay();
 const daily=latest(schedules.filter(r=>r.employee_id===employee.id&&r.schedule_date===day));
 const special=dates.find(r=>r.work_date===day);
 const roster=latest(rosters.filter(r=>r.employee_id===employee.id&&(r.day_of_week==null||Number(r.day_of_week)===weekday)&&(!r.start_date||r.start_date<=day)&&(!r.end_date||r.end_date>=day)));
 const working=claimed?true:daily?!daily.is_off_day:special?special.is_working:roster?!roster.is_off_day:!(settings.weekly_holidays||[0]).includes(weekday);
 if(!working)return null;
 const id=claimed||(daily?(daily.shift_id||employee.default_shift_id):special?employee.default_shift_id:roster?(roster.shift_id||employee.default_shift_id):employee.default_shift_id);
 const shift=shifts.find(r=>r.id===id);
 return {...shift,id:id||null,start_time:shift?.start_time||settings.default_start||'09:00:00',end_time:shift?.end_time||settings.default_end||'18:00:00',grace_period_minutes:shift?.grace_period_minutes??15};
}
