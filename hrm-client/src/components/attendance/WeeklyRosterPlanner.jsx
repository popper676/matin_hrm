import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';

// Utility: get Monday of current week
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

export default function WeeklyRosterPlanner() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // Local state for batch editing
  // Key format: `${empId}-${dateStr}` (e.g., '12-2023-10-23')
  // Value format: { shift_id: string | null, is_off_day: boolean }
  const [localSchedules, setLocalSchedules] = useState({});

  // fetch employees (only active)
  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees','active'],
    queryFn: () => api.get('/employees?status=Active').then(r => r.data.employees)
  });

  // fetch schedules for the week
  const { data: schedules = [], isLoading: schedLoading, refetch } = useQuery({
    queryKey: ['schedules', weekStart.toISOString().slice(0,10), weekEnd.toISOString().slice(0,10)],
    queryFn: () => api.get(`/attendance/schedules?start=${weekStart.toISOString().slice(0,10)}&end=${weekEnd.toISOString().slice(0,10)}`).then(r => r.data.schedules)
  });

  // fetch shifts
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/attendance/shifts').then(r => r.data.shifts)
  });

  // Sync server schedules to local state on load/change
  useEffect(() => {
    const newLocal = {};
    schedules.forEach(s => {
      const key = `${s.employee_id}_${s.schedule_date}`;
      newLocal[key] = { shift_id: s.shift_id, is_off_day: s.is_off_day };
    });
    setLocalSchedules(newLocal);
  }, [schedules]);

  const upsertMutation = useMutation({
    mutationFn: (entries) => api.post('/attendance/schedules', entries),
    onSuccess: () => {
      toast.success(t('hrm.attendance.toast.planSuccess') || 'Schedule saved successfully');
      qc.invalidateQueries({queryKey:['schedules']});
      refetch();
    },
    onError: (err) => {
      console.error(err);
      toast.error(err.response?.data?.error || t('hrm.attendance.toast.planError') || 'Failed to save schedule');
    }
  });

  const days = [];
  for(let i=0;i<7;i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate()+i);
    days.push(d.toISOString().slice(0,10));
  }

  const handleLocalChange = (empId, date, value) => {
    const key = `${empId}_${date}`;
    setLocalSchedules(prev => {
      const updated = { ...prev };
      if (value === '') {
        delete updated[key];
      } else if (value === 'off') {
        updated[key] = { shift_id: null, is_off_day: true };
      } else {
        updated[key] = { shift_id: value, is_off_day: false };
      }
      return updated;
    });
  };

  const handleSavePlan = () => {
    // Build array from localSchedules
    const payload = Object.entries(localSchedules).map(([key, data]) => {
      const [employee_id, schedule_date] = key.split('_');
      return {
        employee_id,
        schedule_date,
        shift_id: data.shift_id || null,
        is_off_day: !!data.is_off_day
      };
    });

    if (payload.length === 0) {
      toast.error('No schedules to save.');
      return;
    }

    upsertMutation.mutate(payload);
  };

  const officeRegularShift = shifts?.find(s => s.shift_name?.toLowerCase().includes('office regular'));

  const isDynamic = (position) => {
    const pos = position?.toLowerCase() || '';
    return pos.includes('housekeeping') || pos.includes('kitchen');
  };

  const handleSmartAutoFill = () => {
    const newLocal = { ...localSchedules };

    employees.forEach(emp => {
      // Determine the default shift to assign (Mon-Sat)
      let targetShiftId = null;
      if (emp.default_shift_id) {
        targetShiftId = emp.default_shift_id;
      } else {
        const hasPosition = !!emp.pos_title && emp.pos_title.trim() !== '' && emp.pos_title !== '—';
        if (!isDynamic(emp.pos_title) && hasPosition && officeRegularShift) {
          targetShiftId = officeRegularShift.id;
        }
      }

      days.forEach(date => {
        const d = new Date(date);
        const isSunday = d.getDay() === 0;
        const key = `${emp.id}_${date}`;

        // 1. Sunday is strictly OFF by default for EVERYONE
        if (isSunday) {
          newLocal[key] = { shift_id: null, is_off_day: true };
        }
        // 2. For Mon-Sat, only fill if they have a targetShiftId AND the cell is currently blank
        else if (targetShiftId && !newLocal[key]) {
          newLocal[key] = { shift_id: targetShiftId, is_off_day: false };
        }
      });
    });

    setLocalSchedules(newLocal);
    toast.success('Smart Auto-fill applied! (Click Save to commit)');
  };

  if (empLoading || schedLoading || shiftsLoading) return <div className="att-planner-loading p-4 text-slate-400">{t('hrm.attendance.roster.planner.loading')}</div>;

  return (
    <div className="att-planner-wrapper p-4 space-y-4 bg-surface-800 rounded-xl overflow-hidden border border-slate-700 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="att-planner-title text-xl font-bold text-white">{t('hrm.attendance.roster.planner.title')}</h2>

        <div className="flex gap-2">
          <button
            onClick={handleSmartAutoFill}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd" />
            </svg>
            Smart Auto-Fill
          </button>

          <button
            onClick={handleSavePlan}
            disabled={upsertMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {upsertMutation.isPending ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>

      <div className="att-planner-table-wrapper overflow-x-auto rounded-lg border border-slate-700">
        <table className="att-planner-table min-w-full text-left text-sm text-slate-300">
          <thead className="att-planner-thead bg-surface-800 text-slate-400 border-b border-slate-700">
            <tr>
              <th className="att-planner-th p-3 font-semibold">{t('hrm.attendance.roster.planner.emp')}</th>
              {days.map(d => (
                <th key={d} className="att-planner-th p-3 font-semibold text-center border-l border-slate-700">
                  {new Date(d).toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'})}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="att-planner-tbody divide-y divide-slate-700">
            {employees.map(emp => (
              <tr key={emp.id} className="att-planner-tr hover:bg-white/[0.02] transition-colors">
                <td className="att-planner-td att-planner-emp-name p-3 font-medium text-white whitespace-nowrap">
                  {emp.Full_name}
                  {emp.default_shift_id && <span className="ml-2 text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded">Default Set</span>}
                </td>
                {days.map(date => {
                  const key = `${emp.id}_${date}`;
                  const localValue = localSchedules[key];

                  let selectValue = '';
                  if (localValue) {
                    selectValue = localValue.is_off_day ? 'off' : (localValue.shift_id || '');
                  }

                  return (
                    <td key={date} className="att-planner-td p-2 text-center align-middle border-l border-slate-700">
                        <select
                          className="att-planner-select bg-surface-850 border border-slate-600 hover:border-slate-500 text-slate-200 rounded-lg py-1.5 pl-2 pr-6 text-xs font-medium w-full min-w-[160px] focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                          value={selectValue}
                          onChange={e => handleLocalChange(emp.id, date, e.target.value)}
                        >
                        <option value="">—</option>
                        <option value="off">{t('hrm.attendance.roster.planner.off') || 'OFF (Rest Day)'}</option>
                        {shifts.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.shift_name} {s.start_time && s.end_time ? `(${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-4">
        <button className="att-planner-nav-btn bg-surface-700 hover:bg-surface-600 border border-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7*24*60*60*1000))}>
          ← {t('hrm.attendance.roster.planner.prevWeek')}
        </button>
        <div className="text-sm font-medium text-slate-400">
          {weekStart.toLocaleDateString()} - {weekEnd.toLocaleDateString()}
        </div>
        <button className="att-planner-nav-btn bg-surface-700 hover:bg-surface-600 border border-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7*24*60*60*1000))}>
          {t('hrm.attendance.roster.planner.nextWeek')} →
        </button>
      </div>
    </div>
  );
}
