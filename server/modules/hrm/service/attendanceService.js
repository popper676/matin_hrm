import {attendanceCalendar,shiftForDay} from '../../../lib/attendanceShift.js';
import {auditContext} from '../../../middleware/auditContext.js';
import {integrityRpc} from '../../../lib/integrityRpc.js';
import {decodeAttendancePhoto,saveAttendancePhoto,removeAttendancePhoto} from '../../../lib/attendancePhotos.js';
import crypto from 'crypto';
import { attendanceRepository } from '../repository/attendanceRepository.js';
import { dbFetchOne,systemDb } from '../../../lib/supabase.js';
import { getBkkDateString } from '../../../lib/dateUtils.js';

// Only shift metadata is needed after the attendance route has checked the target employee.
async function attendanceEmployee(id){
 const {data,error}=await systemDb.from('Employees').select('id,default_shift_id,Dept_id').eq('id',id).maybeSingle();
 if(error)throw error;return data;
}

async function shiftAt(employeeId,day,claimed=null) {
 const [employee,schedules,rosters,shifts,calendar]=await Promise.all([attendanceEmployee(employeeId),attendanceRepository.getDailySchedule(employeeId,day,null),attendanceRepository.getRosters(employeeId),attendanceRepository.getShifts(),attendanceCalendar()]);
 return employee?shiftForDay(employee,day,{schedules:schedules?[schedules]:[],rosters,shifts,...calendar},claimed):null;
}
const checkIsLate=async(employeeId,checkin,claimed=null)=>{
 const day=getBkkDateString(checkin),shift=await shiftAt(employeeId,day,claimed);
 if(!shift)return false;
 return new Date(checkin)>new Date(new Date(day+'T'+shift.start_time+'+07:00').getTime()+Number(shift.grace_period_minutes??15)*60000);
};
async function resolveAttendanceShift(employeeId,record){return shiftAt(employeeId,getBkkDateString(record.check_in),record.claimed_shift_id);}
export function openAttendance(records,now) {
 const record=records.find(r=>r.check_in&&!r.check_out);
 if(!record)return null;
 const hours=(new Date(now)-new Date(record.check_in))/3600000;
 if(hours<0||hours>36)throw new Error('An earlier attendance record is still open. Ask a manager to correct it before checking in.');
 return record;
}
export function overtimeHours(record,checkout,shift,requests) {
 if(!record?.check_in||!shift?.start_time||!shift?.end_time)return 0;
 const day=getBkkDateString(record.check_in),at=time=>new Date(day+'T'+time+'+07:00').getTime();
 const shiftStart=at(shift.start_time),night=shift.end_time<shift.start_time;
 const shiftEnd=at(shift.end_time)+(night?86400000:0),end=new Date(checkout).getTime(),start=new Date(record.check_in).getTime();
 if(!Number.isFinite(end)||end<=start)return 0;
 const windows=[];
 for(const request of requests){
  if(request.status!=='Approved'||request.ot_date!==day)continue;
  let a=at(request.start_time),b=at(request.end_time);
  if(night&&a<shiftStart){a+=86400000;b+=86400000;}
  if(b<=a)b+=86400000;
  const approved=Number(request.requested_hours);
  if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(approved)||approved<=0)continue;
  b=Math.min(b,a+approved*3600000,end);a=Math.max(a,start,shiftEnd);
  if(b>a)windows.push([a,b]);
 }
 windows.sort((a,b)=>a[0]-b[0]);let total=0,until=0;
 for(const [a,b] of windows){total+=Math.max(0,b-Math.max(a,until));until=Math.max(until,b);}
 const hours=total/3600000;
 return hours>=1?Math.round(hours*10)/10:0;
}
const calcOvertime=async(employeeId,checkout,record)=>{
 if(!record?.check_in)return 0;
 const day=getBkkDateString(record.check_in);
 const [shift,requests]=await Promise.all([resolveAttendanceShift(employeeId,record),attendanceRepository.getOvertimeRequests({employee_id:employeeId,ot_date:day,status:'Approved'})]);
 return overtimeHours(record,checkout,shift,requests||[]);
};

export const attendanceService = {
  getAttendance: async (targetDate) => {
    const today = getBkkDateString(new Date());

    // Using custom repository method that mimics the raw Supabase logic
    const records = await attendanceRepository.getAttendanceRecordsCustom(targetDate);

    // We also need Employees, Bio devices, etc as per original.
    // Instead of importing supabase everywhere, I'll use repository fetches
    // Actually, in original it fetched them simultaneously. I'll just use dbFetch for Employees
    const { supabase } = await import('../../../lib/supabase.js');

    const [employeesRes, bioDevicesRes, bioRegsRes, tokensRes, shiftsRes, schedulesRes, rostersRes] = await Promise.all([
      supabase.from('Employees').select('id,Full_name,employee_id,default_shift_id').eq('status', 'Active'),
      supabase.from('biometric_device').select('*'),
      supabase.from('biometric_employees').select('*'),
      supabase.from('qr_attendance_tokens').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('shifts').select('*'),
      supabase.from('employee_daily_schedules').select('*'),
      supabase.from('employee_rosters').select('*')
    ]);

    const employees = employeesRes.data || [];
    const bioDevices = bioDevicesRes.data || [];
    const bioRegs = bioRegsRes.data || [];
    const tokens = tokensRes.data || [];
    const shifts = shiftsRes.data || [];
    const schedules = schedulesRes.data || [];
    const rosters = rostersRes.data || [];

    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const calendar=await attendanceCalendar();

    const enriched = records.map(r => {
      const emp = empMap[r.employee_id] || {};
      let workHours = null;
      let isEarlyLeave = false;
      if (r.check_in && r.check_out) {
        try {
          workHours = Math.max(0, Math.round(((new Date(r.check_out) - new Date(r.check_in)) / 3600000) * 100) / 100);

          const day=getBkkDateString(r.check_in),shift=shiftForDay({...emp,id:r.employee_id},day,{schedules,rosters,shifts,...calendar},r.claimed_shift_id);
          if(shift){const end=new Date(day+'T'+shift.end_time+'+07:00');if(shift.end_time<shift.start_time)end.setUTCDate(end.getUTCDate()+1);isEarlyLeave=new Date(r.check_out)<end;}
        } catch (err) {
          console.error(`[getAttendance] Failed to calculate check_out data for record ID: ${r.id}`, err);
        }
      }
      return { ...r, Full_name: emp.Full_name || '—', employee_code: emp.employee_id || '—', work_hours_calc: workHours, is_early_leave: isEarlyLeave };
    });

    bioRegs.forEach(reg => { reg.Full_name = (empMap[reg.employee_id] || {}).Full_name || '—'; });
    tokens.forEach(t => {
      const emp = empMap[t.employee_id] || {};
      t.Full_name = emp.Full_name || '—';
      t.emp_code = emp.employee_id || '—';
    });

    const statsPresent = enriched.filter(r => r.check_in && getBkkDateString(r.check_in) === today).length;
    const statsLate = enriched.filter(r => r.is_late && r.check_in && getBkkDateString(r.check_in) === today).length;
    const statsInOffice = enriched.filter(r => r.check_in && getBkkDateString(r.check_in) === today && !r.check_out).length;

    return {
      records: enriched, employees,
      biometric_devices: bioDevices, biometric_registrations: bioRegs,
      active_tokens: tokens,
      stats: { present: statsPresent, late: statsLate, in_office: statsInOffice, total: records.length },
      today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    };
  },

  manualCheckIn: async (data, employeeId) => {
    const now = new Date().toISOString();
    const ci = data.check_in || now;
    if (data.check_out && ci && new Date(data.check_out) < new Date(ci)) {
      throw new Error('Check-out time cannot be before check-in time');
    }

    const today = getBkkDateString(ci);
    const schedule = await attendanceRepository.getDailySchedule(employeeId, today, false);
    const shiftId = schedule?.shift_id || null;

    let isLate = false;
    let shiftAppStatus = 'Approved';
    let claimedId = null;
    let specialReason = null;

    if (data.claimed_shift_id === 'special') {
      isLate = false;
      shiftAppStatus = 'Pending';
      specialReason = data.special_shift_reason || 'No reason provided';
    } else if (data.claimed_shift_id) {
      claimedId = data.claimed_shift_id;
      isLate = await checkIsLate(employeeId, ci, claimedId);
      shiftAppStatus = 'Pending';
    } else {
      isLate = await checkIsLate(employeeId, ci);
    }

    const result = await attendanceRepository.createAttendanceRecord({
      employee_id: employeeId,
      check_in: ci,
      check_out: data.check_out || null,
      overtime_hours: data.overtime_hours ? parseFloat(data.overtime_hours) : (data.check_out ? await calcOvertime(employeeId, data.check_out,{check_in:ci,claimed_shift_id:claimedId}) : 0),
      attendance_method: data.attendance_method || 'Manual',
      is_late: isLate,
      claimed_shift_id: claimedId,
      shift_approval_status: shiftAppStatus,
      special_shift_reason: specialReason,
      created_at: now,
    });
    return result;
  },

  manualCheckOut: async (id) => {
    const now = new Date().toISOString();
    const record = await attendanceRepository.getAttendanceRecordById(id);
    if (!record) throw Object.assign(new Error('Attendance record not found'), {status:404});
    if (record.check_out) throw Object.assign(new Error('Attendance was already checked out. Refresh and try again.'), {status:409});
    if (new Date(record.check_in).getTime() > Date.now()) throw Object.assign(new Error('Check-out cannot precede check-in.'), {status:409});
    const overtime_hours = await calcOvertime(record.employee_id, now, record);
    // Conditional write prevents overlapping requests from overwriting the original check-out.
    await attendanceRepository.closeAttendanceRecord(id, { check_out: now, overtime_hours });
  },

  deleteAttendance: async (id) => {
    await attendanceRepository.deleteAttendanceRecord(id);
  },

  generateQr: async (employee_id, expires_in_minutes = 60) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + expires_in_minutes * 60000).toISOString();
    await attendanceRepository.createQrToken({
      employee_id,
      token,
      expires_at,
      used: false
    });
    return token;
  },

  scanQr: async (token) => {
    const qrData = await attendanceRepository.getQrToken(token);
    if (!qrData) throw new Error('Invalid token');
    if (qrData.used) throw new Error('Token already used');
    if (new Date(qrData.expires_at) < new Date()) throw new Error('Token expired');

    const now=new Date().toISOString(),records=await attendanceRepository.getAttendanceRecords({employee_id:qrData.employee_id},{order:'check_in',ascending:false,limit:10}),open=openAttendance(records,now);
    const result=await integrityRpc('hr_scan_qr',{p_actor:auditContext.getStore()?.user?.id,p_token:token,p_open:open?.id||null,p_late:open?false:await checkIsLate(qrData.employee_id,now),p_ot:open?await calcOvertime(qrData.employee_id,now,open):0});
    return {success:true,message:result.action==='check-out'?'QR Check-out successful':'QR Check-in successful',employee_id:result.employee_id};
  },

  photoCheckin: async (employee_id,claimed_shift_id,special_shift_reason,photoBase64) => {
    const photo=decodeAttendancePhoto(photoBase64),now=new Date().toISOString(),today=getBkkDateString(now);
    const records=await attendanceRepository.getAttendanceRecords({employee_id},{order:'check_in',ascending:false,limit:10});
    const open=openAttendance(records,now),latest=records[0];
    if(latest&&new Date(now)-new Date(latest.check_out||latest.check_in)<120000)
      throw new Error('Please wait at least 2 minutes between check-ins to prevent duplicates.');
    if(!open&&records.some(r=>r.check_out&&getBkkDateString(r.check_in)===today))
      throw new Error('Attendance already completed for today.');
    if(!open&&claimed_shift_id&&claimed_shift_id!=='special'){
      const {allowed_shifts}=await attendanceService.getAvailableShifts(employee_id);
      if(!allowed_shifts.some(s=>s.id===claimed_shift_id))throw new Error('Choose an available shift.');
    }
    let isLate=false,status='Approved',claimedId=null,reason=null;
    if(!open){
      if(claimed_shift_id==='special'){status='Pending';reason=String(special_shift_reason||'No reason provided').slice(0,2000);}
      else{claimedId=claimed_shift_id||null;isLate=await checkIsLate(employee_id,now,claimedId);}
    }
    const overtime_hours=open?await calcOvertime(employee_id,now,open):0;
    const saved=await saveAttendancePhoto(employee_id,photo);
    try{
      if(open){
        await attendanceRepository.closeAttendanceRecord(open.id,{check_out:now,overtime_hours,check_out_photo_url:saved.url});
      }else{
        await attendanceRepository.createAttendanceRecord({employee_id,check_in:now,attendance_method:'Photo',is_late:isLate,claimed_shift_id:claimedId,shift_approval_status:status,special_shift_reason:reason,check_in_photo_url:saved.url});
      }
    }catch(error){await removeAttendancePhoto(saved.path);throw error;}
    if(!open&&status==='Pending'){
      const {dbInsert}=await import('../../../lib/supabase.js');
      await dbInsert('system_notifications',{recipient_role:'management',employee_id,title:'Special Shift Approval Required',message:'An employee self-declared a special shift during Check-in.',link_url:'/attendance',is_read:false});
    }
    return {success:true,message:open?'Photo Check-out successful':'Photo Check-in successful'};
  },

  biometricSync: async (records) => {
    let synced = 0;
    for (const r of records) {
      const bioEmp = await attendanceRepository.getBiometricRegistrationByBiometricId(r.fingerprint_id);
      if (!bioEmp) continue;

      const empId = bioEmp.employee_id;
      const logTime = r.timestamp;

      const existingLog = await attendanceRepository.getBiometricLogByRawTime(empId, logTime);
      if (existingLog) continue;

      await attendanceRepository.createBiometricLog({
        device_id: r.device_id || bioEmp.device_id,
        employee_id: empId,
        raw_time: logTime
      });

      await attendanceRepository.createAttendanceRecord({
        employee_id: empId,
        check_in: logTime,
        attendance_method: 'Biometric',
        is_late: await checkIsLate(empId, logTime),
        created_at: new Date().toISOString()
      });

      synced++;
    }
    return synced;
  },

  createBiometricDevice: async (data) => attendanceRepository.createBiometricDevice(data),
  deleteBiometricDevice: async (id) => attendanceRepository.deleteBiometricDevice(id),
  createBiometricMapping: async (data) => attendanceRepository.createBiometricMapping(data),
  updateBiometricMapping: async (id, data) => attendanceRepository.updateBiometricMapping(id, data),
  deleteBiometricMapping: async (id) => attendanceRepository.deleteBiometricMapping(id),

  getAvailableShifts: async (employeeId) => {
    const today = getBkkDateString(new Date());
    const emp = await attendanceEmployee(employeeId);

    const resolved=await shiftAt(employeeId,today);
    const defaultShiftId=resolved?.id||null;

    const allShifts = await attendanceRepository.getShifts();
    const myShifts = allShifts.filter(s => {
      if (!s.allowed_departments || s.allowed_departments.length === 0) return true;
      return s.allowed_departments.includes(emp?.Dept_id);
    });

    return { default_shift_id: defaultShiftId, allowed_shifts: myShifts };
  },

  updateApproval: async (id, data) => {
    const { shift_approval_status, override_shift_id, special_shift_reason } = data;
    const updates = { shift_approval_status };

    if (override_shift_id) {
      updates.claimed_shift_id = override_shift_id;
      updates.special_shift_reason = null;
    } else if (special_shift_reason) {
      updates.claimed_shift_id = 'special';
      updates.special_shift_reason = special_shift_reason;
    }

    const record = await attendanceRepository.getAttendanceRecordById(id);
    if (record) {
      const finalShiftId = override_shift_id || record.claimed_shift_id;
      if (finalShiftId && finalShiftId !== 'special') {
        updates.is_late = await checkIsLate(record.employee_id, record.check_in, finalShiftId);
      } else {
        updates.is_late = false;
      }
    }

    await attendanceRepository.updateAttendanceRecord(id, updates);
  },

  getSchedules: async (start, end) => attendanceRepository.getDailySchedulesByDateRange(start, end),
  upsertSchedules: async (entries) => attendanceRepository.upsertDailySchedules(entries),
  deleteSchedule: async (id) => attendanceRepository.deleteDailySchedule(id),

  getShifts: async () => attendanceRepository.getShifts(),
  createShift: async (data) => attendanceRepository.createShift(data),
  updateShift: async (id, data) => attendanceRepository.updateShift(id, data),
  deleteShift: async (id) => attendanceRepository.deleteShift(id),

  getRosters: async () => attendanceRepository.getRosters(),
  createRoster: async (data) => attendanceRepository.createRoster(data),
  deleteRoster: async (id) => attendanceRepository.deleteRoster(id),

  updateDefaultShift: async (employeeId, shiftId) => {
    const { supabase } = await import('../../../lib/supabase.js');
    await supabase.from('Employees').update({ default_shift_id: shiftId || null }).eq('id', employeeId);
  },

  // Overtime
  getAllOvertimeRequests: async () => {
    const requests = await attendanceRepository.getOvertimeRequests({}, { order: 'created_at', ascending: false });
    const { supabase } = await import('../../../lib/supabase.js');
    const [employeesRes, positionsRes] = await Promise.all([
      supabase.from('Employees').select('id,Full_name,position_id'),
      supabase.from('positions').select('id,title')
    ]);
    const empMap = Object.fromEntries((employeesRes.data || []).map(e => [e.id, e]));
    const posMap = Object.fromEntries((positionsRes.data || []).map(p => [p.id, p.title]));

    return requests.map(r => {
      const emp = empMap[r.employee_id] || {};
      return {
        ...r,
        employee_name: emp.Full_name || 'Unknown',
        position_name: posMap[emp.position_id] || 'Unknown'
      };
    });
  },

  getEmployeeOvertimeRequests: async (employeeId) => {
    return await attendanceRepository.getOvertimeRequests({ employee_id: employeeId }, { order: 'created_at', ascending: false });
  },

  createOvertimeRequest: async (data) => {
    const { employee_id, ot_date, start_time, end_time, reason, requested_by } = data;
    let requested_hours = 0;
    try {
      const start = new Date(`1970-01-01T${start_time}:00Z`);
      const end = new Date(`1970-01-01T${end_time}:00Z`);
      requested_hours = (end - start) / 3600000;
      if (requested_hours < 0) requested_hours += 24;
    } catch (e) {
      throw new Error('Invalid start or end time format.');
    }

    const status = requested_by === 'hr_boss' ? 'Pending_Employee_Acceptance' : 'Pending_Boss_Approval';

    return await attendanceRepository.createOvertimeRequest({
      employee_id, ot_date, start_time, end_time, requested_hours, reason, requested_by, status
    });
  },

  updateOvertimeStatus: async (id, status) => {
    return await attendanceRepository.updateOvertimeRequest(id, { status, updated_at: new Date().toISOString() });
  },

  getOvertimeRequestById: async (id) => attendanceRepository.getOvertimeRequestById(id),

  // Public API
  getAttendanceSummaryForPayroll: async (date) => {
    if (date) {
      return await attendanceRepository.getAttendanceRecordsCustom(date);
    }
    return await attendanceRepository.getAttendanceRecordsCustom();
  },

  getAttendanceHistory: async (employeeId) => {
    return await attendanceRepository.getAttendanceRecords({ employee_id: employeeId }, { order: 'check_in', ascending: false });
  }
};
