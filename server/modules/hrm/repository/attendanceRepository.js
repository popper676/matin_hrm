import { supabase, dbFetch, dbFetchOne, dbInsert, dbUpdate, dbDelete } from '../../../lib/supabase.js';

export const attendanceRepository = {
  getDailySchedule: async (employeeId, scheduleDate, isOffDay = false) => {
    return await dbFetchOne('employee_daily_schedules', '*', {
      employee_id: employeeId,
      schedule_date: scheduleDate,
      ...(isOffDay===null?{}:{is_off_day:isOffDay})
    });
  },

  getDailySchedulesByDateRange: async (start, end) => {
    const { data, error } = await supabase
      .from('employee_daily_schedules')
      .select('*')
      .gte('schedule_date', start)
      .lte('schedule_date', end)
      .order('schedule_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  upsertDailySchedules: async (entries) => {
    const { error, data } = await supabase.from('employee_daily_schedules')
      .upsert(entries, { onConflict: ['employee_id', 'schedule_date'] });
    if (error) throw error;
    return data;
  },

  deleteDailySchedule: async (id) => {
    const { error } = await supabase.from('employee_daily_schedules').delete().eq('id', id);
    if (error) throw error;
  },

  getRosters: async (employeeId = null) => {
    if (employeeId) return await dbFetch('employee_rosters', '*', { employee_id: employeeId });
    return await dbFetch('employee_rosters');
  },

  createRoster: async (data) => {
    return await dbInsert('employee_rosters', data);
  },

  deleteRoster: async (id) => {
    await dbDelete('employee_rosters', id);
  },

  getShiftById: async (shiftId) => {
    return await dbFetchOne('shifts', '*', { id: shiftId });
  },

  getShifts: async () => {
    return await dbFetch('shifts', '*', {}, { order: 'shift_name' });
  },

  createShift: async (data) => {
    return await dbInsert('shifts', data);
  },

  updateShift: async (id, data) => {
    return await dbUpdate('shifts', id, data);
  },

  deleteShift: async (id) => {
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) throw error;
  },

  getAttendanceRecords: async (query = {}, options = {}) => {
    return await dbFetch('attendance_records', '*', query, options);
  },

  getAttendanceRecordsCustom: async (targetDate = null) => {
    let recordsQuery = supabase.from('attendance_records').select('*').order('check_in', { ascending: false });
    if (targetDate) {
      // BUG FIX: Use Bangkok timezone boundaries (+07:00) so that UTC-stored records
      // (Photo/QR method) for early-morning check-ins are not missed.
      // e.g., an employee check-in at 5:56 AM BKK = 2026-10-12T22:56Z which
      // would be excluded by a plain T00:00:00 - T23:59:59 UTC range.
      recordsQuery = recordsQuery
        .gte('check_in', `${targetDate}T00:00:00+07:00`)
        .lte('check_in', `${targetDate}T23:59:59+07:00`);
    } else {
      recordsQuery = recordsQuery.limit(500);
    }
    const { data,error } = await recordsQuery;
    if(error)throw error;
    return data || [];
  },

  getAttendanceRecordById: async (id) => {
    return await dbFetchOne('attendance_records', '*', { id });
  },

  createAttendanceRecord: async (data) => {
    return await dbInsert('attendance_records', data);
  },

  updateAttendanceRecord: async (id, data) => {
    return await dbUpdate('attendance_records', id, data);
  },
  closeAttendanceRecord: async(id,data)=>{
    const {data:rows,error}=await supabase.from('attendance_records').update(data).eq('id',id).is('check_out',null).select('id');
    if(error)throw error;
    if(!rows?.length)throw Object.assign(new Error('Attendance was already checked out or the record is unavailable. Refresh and try again.'),{status:409});
    return rows[0];
  },

  deleteAttendanceRecord: async (id) => {
    await dbDelete('attendance_records', id);
  },

  getOvertimeRequests: async (query = {}, options = {}) => {
    return await dbFetch('overtime_requests', '*', query, options);
  },

  getOvertimeRequestById: async (id) => {
    return await dbFetchOne('overtime_requests', '*', { id });
  },

  createOvertimeRequest: async (data) => {
    return await dbInsert('overtime_requests', data);
  },

  updateOvertimeRequest: async (id, data) => {
    return await dbUpdate('overtime_requests', id, data);
  },

  // QR Tokens
  createQrToken: async (data) => {
    return await dbInsert('qr_attendance_tokens', data);
  },

  getQrToken: async (token) => {
    return await dbFetchOne('qr_attendance_tokens', '*', { token });
  },

  updateQrToken: async (id, data) => {
    return await dbUpdate('qr_attendance_tokens', id, data);
  },

  getRecentQrTokens: async () => {
    const { data } = await supabase.from('qr_attendance_tokens').select('*').order('created_at', { ascending: false }).limit(100);
    return data || [];
  },

  // Biometrics
  getBiometricDevices: async () => {
    const { data } = await supabase.from('biometric_device').select('*');
    return data || [];
  },

  createBiometricDevice: async (data) => {
    return await dbInsert('biometric_device', data);
  },

  deleteBiometricDevice: async (id) => {
    const { error } = await supabase.from('biometric_device').delete().eq('id', id);
    if (error) throw error;
  },

  getBiometricRegistrations: async () => {
    const { data } = await supabase.from('biometric_employees').select('*');
    return data || [];
  },

  getBiometricRegistrationByBiometricId: async (biometricId) => {
    return await dbFetchOne('biometric_employees', '*', { biometric_id: biometricId });
  },

  createBiometricMapping: async (data) => {
    return await dbInsert('biometric_employees', data);
  },

  updateBiometricMapping: async (id, data) => {
    return await dbUpdate('biometric_employees', id, data);
  },

  deleteBiometricMapping: async (id) => {
    const { error } = await supabase.from('biometric_employees').delete().eq('id', id);
    if (error) throw error;
  },

  getBiometricLogByRawTime: async (employeeId, rawTime) => {
    return await dbFetchOne('biometric_logs', 'id', { employee_id: employeeId, raw_time: rawTime });
  },

  createBiometricLog: async (data) => {
    return await dbInsert('biometric_logs', data);
  }
};
