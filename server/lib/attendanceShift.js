import {systemDb} from './supabase.js';
export {shiftForDay} from '../../shared/shiftPolicy.js';
export async function attendanceCalendar() {
 const [calendar,dates]=await Promise.all([systemDb.from('hr_leave_calendar').select('settings').eq('id',true).maybeSingle(),systemDb.from('hr_leave_calendar_dates').select('work_date,is_working')]);
 if(calendar.error||dates.error)throw Object.assign(new Error('Unable to load the working calendar. Apply migration 006 if missing.'),{status:503});
 return {settings:calendar.data?.settings||{},dates:dates.data||[]};
}
