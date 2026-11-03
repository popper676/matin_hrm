import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';

export default function RostersTab({ employees }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);

  // Queries
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/attendance/shifts').then(r => r.data.shifts)
  });

  const { data: rosters = [] } = useQuery({
    queryKey: ['rosters'],
    queryFn: () => api.get('/attendance/rosters').then(r => r.data.rosters)
  });

  // Mutations
  const addRosterMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/rosters', body),
    onSuccess: () => {
      toast.success(t('hrm.attendance.roster.toast.rostSuccess') || 'Roster assigned successfully');
      qc.invalidateQueries({queryKey:['rosters']});
      setShowRosterModal(false);
    },
    onError: () => toast.error(t('hrm.attendance.roster.toast.rostError') || 'Failed to assign roster')
  });

  const deleteRosterMutation = useMutation({
    mutationFn: (id) => api.delete(`/attendance/rosters/${id}`),
    onSuccess: () => {
      toast.success(t('hrm.attendance.roster.toast.rostDel') || 'Roster deleted');
      qc.invalidateQueries({queryKey:['rosters']});
    }
  });

  const defaultShiftMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/default-shift', body),
    onSuccess: () => {
      toast.success(t('hrm.attendance.roster.toast.defUpdate') || 'Default shift updated');
      qc.invalidateQueries({queryKey:['attendance']}); // to refresh employees data
    }
  });

  const createShiftMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/shifts', body),
    onSuccess: () => {
      toast.success(t('hrm.attendance.roster.toast.shfSuccess') || 'Shift created successfully');
      qc.invalidateQueries({queryKey:['shifts']});
      setShowShiftModal(false);
    }
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, body }) => api.put(`/attendance/shifts/${id}`, body),
    onSuccess: () => {
      toast.success(t('hrm.attendance.roster.toast.shfUpdate') || 'Shift updated successfully');
      qc.invalidateQueries({queryKey:['shifts']});
      setShowShiftModal(false);
    }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id) => api.delete(`/attendance/shifts/${id}`),
    onSuccess: () => {
      toast.success(t('hrm.attendance.roster.toast.shfDel') || 'Shift deleted');
      qc.invalidateQueries({queryKey:['shifts']});
    }
  });

  const handleAssignRoster = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addRosterMutation.mutate(Object.fromEntries(fd));
  };

  const handleSaveShift = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    if (editingShift?.id) {
      updateShiftMutation.mutate({ id: editingShift.id, body });
    } else {
      createShiftMutation.mutate(body);
    }
  };

  const handleUpdateDefaultShift = (employee_id, shift_id) => {
    defaultShiftMutation.mutate({ employee_id, shift_id });
  };

  const empMap = employees.reduce((acc, emp) => ({ ...acc, [emp.id]: emp.Full_name }), {});
  const shiftMap = shifts.reduce((acc, sh) => ({ ...acc, [sh.id]: sh.shift_name }), {});

  return (
    <div className="att-roster-wrapper p-4 space-y-8">
      {/* Manage Shifts Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="att-roster-section-title text-xl font-bold text-white">{t('hrm.attendance.roster.shifts.title')}</h2>
          <button
            onClick={() => { setEditingShift(null); setShowShiftModal(true); }}
            className="att-roster-btn-primary bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t('hrm.attendance.roster.shifts.newBtn')}
          </button>
        </div>
        <div className="att-roster-table-wrapper bg-surface-800 rounded-xl overflow-hidden border border-slate-700">
          <table className="att-roster-table w-full text-left text-sm text-slate-300">
            <thead className="att-roster-thead bg-surface-900 text-slate-400">
              <tr>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.shifts.cols.name')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.shifts.cols.start')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.shifts.cols.end')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.shifts.cols.grace')}</th>
                <th className="att-roster-th p-4 font-medium text-right">{t('hrm.attendance.roster.shifts.cols.actions')}</th>
              </tr>
            </thead>
            <tbody className="att-roster-tbody divide-y divide-slate-700/50">
              {shifts.length === 0 ? (
                <tr><td colSpan="5" className="att-roster-empty p-4 text-center text-slate-500">{t('hrm.attendance.roster.shifts.empty')}</td></tr>
              ) : (
                shifts.map(s => (
                  <tr key={s.id} className="att-roster-tr hover:bg-white/5 transition-colors">
                    <td className="att-roster-td att-roster-shift-name p-4 font-bold text-indigo-400">{s.shift_name}</td>
                    <td className="att-roster-td p-4">{s.start_time}</td>
                    <td className="att-roster-td p-4">{s.end_time}</td>
                    <td className="att-roster-td p-4">{s.grace_period_minutes}</td>
                    <td className="att-roster-td p-4 text-right flex justify-end gap-3">
                      <button
                        onClick={() => { setEditingShift(s); setShowShiftModal(true); }}
                        className="att-roster-action-edit text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {t('hrm.attendance.roster.shifts.edit')}
                      </button>
                      <button
                        onClick={() => {
                          if(confirm(t('hrm.attendance.roster.shifts.confirmDelete') || 'Are you sure you want to delete this shift?')) deleteShiftMutation.mutate(s.id);
                        }}
                        className="att-roster-action-delete text-red-400 hover:text-red-300 transition-colors"
                      >
                        {t('hrm.attendance.roster.shifts.delete')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Default Shifts Section */}
      <section>
        <h2 className="att-roster-section-title text-xl font-bold text-white mb-4">{t('hrm.attendance.roster.default.title')}</h2>
        <div className="att-roster-table-wrapper bg-surface-800 rounded-xl overflow-hidden border border-slate-700">
          <table className="att-roster-table w-full text-left text-sm text-slate-300">
            <thead className="att-roster-thead bg-surface-900 text-slate-400">
              <tr>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.default.cols.emp')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.default.cols.shift')}</th>
              </tr>
            </thead>
            <tbody className="att-roster-tbody divide-y divide-slate-700/50">
              {employees.map(emp => (
                <tr key={emp.id} className="att-roster-tr hover:bg-white/5 transition-colors">
                  <td className="att-roster-td p-4">{emp.Full_name}</td>
                  <td className="att-roster-td p-4">
                    <select
                      className="att-roster-select bg-surface-850 border border-slate-700 text-white rounded p-1"
                      value={emp.default_shift_id || ''}
                      onChange={(e) => handleUpdateDefaultShift(emp.id, e.target.value)}
                    >
                      <option value="">{t('hrm.attendance.roster.default.noDefault')}</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.shift_name} ({s.start_time})</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rotating Rosters Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="att-roster-section-title text-xl font-bold text-white">{t('hrm.attendance.roster.rotating.title')}</h2>
          <button
            onClick={() => setShowRosterModal(true)}
            className="att-roster-btn-primary bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t('hrm.attendance.roster.rotating.assignBtn')}
          </button>
        </div>

        <div className="att-roster-table-wrapper bg-surface-800 rounded-xl overflow-hidden border border-slate-700">
          <table className="att-roster-table w-full text-left text-sm text-slate-300">
            <thead className="att-roster-thead bg-surface-900 text-slate-400">
              <tr>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.rotating.cols.emp')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.rotating.cols.shift')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.rotating.cols.start')}</th>
                <th className="att-roster-th p-4 font-medium">{t('hrm.attendance.roster.rotating.cols.end')}</th>
                <th className="att-roster-th p-4 font-medium text-right">{t('hrm.attendance.roster.rotating.cols.actions')}</th>
              </tr>
            </thead>
            <tbody className="att-roster-tbody divide-y divide-slate-700/50">
              {rosters.length === 0 ? (
                <tr><td colSpan="5" className="att-roster-empty p-4 text-center text-slate-500">{t('hrm.attendance.roster.rotating.empty')}</td></tr>
              ) : (
                rosters.map(r => (
                  <tr key={r.id} className="att-roster-tr hover:bg-white/5 transition-colors">
                    <td className="att-roster-td p-4">{empMap[r.employee_id] || 'Unknown'}</td>
                    <td className="att-roster-td p-4">
                      <span className="att-roster-shift-badge bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-md text-xs font-medium">
                        {shiftMap[r.shift_id] || 'Unknown Shift'}
                      </span>
                    </td>
                    <td className="att-roster-td p-4">{r.start_date}</td>
                    <td className="att-roster-td p-4">{r.end_date || t('hrm.attendance.roster.rotating.ongoing')}</td>
                    <td className="att-roster-td p-4 text-right">
                      <button
                        onClick={() => deleteRosterMutation.mutate(r.id)}
                        className="att-roster-action-delete text-red-400 hover:text-red-300 transition-colors"
                      >
                        {t('hrm.attendance.roster.rotating.remove')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Roster Assignment Modal */}
      {showRosterModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-6">{t('hrm.attendance.roster.modals.assign.title')}</h3>
              <form onSubmit={handleAssignRoster} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.assign.emp')}</label>
                  <select name="employee_id" required className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white">
                    <option value="">{t('hrm.attendance.roster.modals.assign.selectEmp')}</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.Full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.assign.shift')}</label>
                  <select name="shift_id" required className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white">
                    <option value="">{t('hrm.attendance.roster.modals.assign.selectShift')}</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>{s.shift_name} ({s.start_time})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.assign.start')}</label>
                    <input type="date" name="start_date" required className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.assign.endOpt')}</label>
                    <input type="date" name="end_date" className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white" />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowRosterModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg p-2.5 transition-colors">{t('hrm.attendance.roster.modals.assign.cancel')}</button>
                  <button type="submit" disabled={addRosterMutation.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg p-2.5 font-medium transition-colors">
                    {addRosterMutation.isPending ? t('hrm.attendance.roster.modals.assign.assigning') : t('hrm.attendance.roster.modals.assign.submit')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Shift Management Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-6">{editingShift ? t('hrm.attendance.roster.modals.shift.editTitle') : t('hrm.attendance.roster.modals.shift.newTitle')}</h3>
              <form onSubmit={handleSaveShift} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.shift.name')}</label>
                  <input type="text" name="shift_name" required defaultValue={editingShift?.shift_name || ''} placeholder={t('hrm.attendance.roster.modals.shift.namePlh')} className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.shift.start')}</label>
                    <input type="time" name="start_time" required defaultValue={editingShift?.start_time?.substring(0, 5) || ''} className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.shift.end')}</label>
                    <input type="time" name="end_time" required defaultValue={editingShift?.end_time?.substring(0, 5) || ''} className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t('hrm.attendance.roster.modals.shift.grace')}</label>
                  <input type="number" name="grace_period_minutes" required defaultValue={editingShift?.grace_period_minutes || 15} min="0" className="w-full bg-surface-850 border border-slate-700 rounded-lg p-2.5 text-white" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowShiftModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg p-2.5 transition-colors">{t('hrm.attendance.roster.modals.shift.cancel')}</button>
                  <button type="submit" disabled={createShiftMutation.isPending || updateShiftMutation.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg p-2.5 font-medium transition-colors">
                    {createShiftMutation.isPending || updateShiftMutation.isPending ? t('hrm.attendance.roster.modals.shift.saving') : t('hrm.attendance.roster.modals.shift.submit')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
