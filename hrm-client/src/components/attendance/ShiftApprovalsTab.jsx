import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';
import ConfirmModal from '../common/ConfirmModal';

export default function ShiftApprovalsTab() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch all attendance records (API returns latest 500)
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['attendance_approvals'],
    queryFn: () => api.get('/attendance').then(r => r.data.records)
  });

  // Fetch all shifts for the dropdown
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/attendance/shifts').then(r => r.data.shifts)
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, override_shift_id }) =>
      api.put(`/attendance/approvals/${id}`, { shift_approval_status: status, override_shift_id }),
    onSuccess: () => {
      toast.success(t('hrm.attendance.toast.apprSuccess') || 'Approval status updated');
      qc.invalidateQueries({queryKey:['attendance_approvals']});
      qc.invalidateQueries({queryKey:['attendance']});
    },
    onError: (err) => toast.error(err.response?.data?.error || t('hrm.attendance.toast.apprError') || 'Failed to update status')
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids) => api.post('/attendance/approvals/bulk-approve', { record_ids: ids }),
    onSuccess: () => {
      toast.success('Successfully approved all pending records!');
      qc.invalidateQueries({queryKey:['attendance_approvals']});
      qc.invalidateQueries({queryKey:['attendance']});
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to bulk approve')
  });

  const handleApprove = (record, overrideShiftId = null) => {
    updateStatusMutation.mutate({
      id: record.id,
      status: 'Approved',
      override_shift_id: overrideShiftId
    });
  };

  const handleReject = (record) => {
    updateStatusMutation.mutate({
      id: record.id,
      status: 'Rejected',
      override_shift_id: null
    });
  };

  // Convert check_in UTC timestamp to Bangkok local date
  const toBkkDate = (isoString) => {
    if (!isoString) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(isoString));
    } catch { return ''; }
  };

  // Pending records should ALWAYS show up regardless of the selected date (so nothing is forgotten)
  const pendingRecords = records.filter(r => r.shift_approval_status === 'Pending');

  // Processed records are filtered by the selected date for clean history viewing
  // BUG FIX: Use Bangkok timezone date conversion instead of UTC string startsWith
  const processedRecords = records.filter(r =>
    r.shift_approval_status !== 'Pending' &&
    toBkkDate(r.check_in) === filterDate
  );

  if (isLoading) return <div className="p-4 text-slate-400">{t('hrm.attendance.roster.approvals.loading')}</div>;

  const renderTable = (data, isPending) => (
    <div className="att-approval-table-wrapper overflow-x-auto mt-4 bg-surface-800 rounded-2xl border border-white/5">
      <table className="att-approval-table w-full text-left text-sm">
        <thead className="att-approval-thead" style={{ background: 'var(--bg-850, #161929)' }}>
          <tr>
            <th className="att-approval-th p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.attendance.roster.approvals.cols.emp')}</th>
            <th className="att-approval-th p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.attendance.roster.approvals.cols.checkin')}</th>
            <th className="att-approval-th p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.attendance.roster.approvals.cols.claimed')}</th>
            <th className="att-approval-th p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.attendance.roster.approvals.cols.reason')}</th>
            <th className="att-approval-th p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.attendance.roster.approvals.cols.status')}</th>
            <th className="att-approval-th p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">{t('hrm.attendance.roster.approvals.cols.actions')}</th>
          </tr>
        </thead>
        <tbody className="att-approval-tbody divide-y divide-white/5">
          {data.length > 0 ? data.map(r => {
            const shiftName = r.claimed_shift_id === 'special'
              ? t('hrm.attendance.roster.approvals.special')
              : shifts.find(s => s.id === r.claimed_shift_id)?.shift_name || t('hrm.attendance.roster.approvals.na');

            return (
              <tr key={r.id} className="att-approval-tr hover:bg-white/5 transition-colors">
                <td className="att-approval-td p-3">
                  <p className="att-approval-emp-name font-bold text-white">{r.Full_name}</p>
                </td>
                <td className="att-approval-td p-3">
                  <span className="att-approval-time text-emerald-400 font-mono text-xs">{new Date(r.check_in).toLocaleTimeString()}</span>
                </td>
                <td className="att-approval-td p-3 text-slate-300 font-medium att-approval-shift-name">
                  {shiftName}
                </td>
                <td className="att-approval-td p-3">
                  {r.special_shift_reason ? (
                    <span className="att-approval-reason-badge text-amber-400 text-xs bg-amber-400/10 px-2 py-1 rounded">
                      {r.special_shift_reason}
                    </span>
                  ) : <span className="att-approval-empty-reason text-slate-500">—</span>}
                </td>
                <td className="att-approval-td p-3">
                  <span className={`att-approval-status-${(r.shift_approval_status || 'pending').toLowerCase()} text-xs font-bold px-2 py-1 rounded-lg ${
                    r.shift_approval_status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400' :
                    r.shift_approval_status === 'Rejected' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {r.shift_approval_status || 'Pending'}
                  </span>
                </td>
                <td className="att-approval-td p-3 text-right">
                  {isPending ? (
                    <div className="flex gap-2 justify-end">
                      <select
                        className="att-approval-select bg-surface-800 border border-white/10 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                        onChange={(e) => {
                          if (e.target.value) {
                            handleApprove(r, e.target.value);
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">{t('hrm.attendance.roster.approvals.approveAs')}</option>
                        {r.claimed_shift_id !== 'special' && (
                          <option value={r.claimed_shift_id}>{t('hrm.attendance.roster.approvals.reqShift')}</option>
                        )}
                        {shifts.map(s => (
                          <option key={s.id} value={s.id}>{s.shift_name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleReject(r)}
                        className="att-approval-btn-reject px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded transition-colors"
                      >
                        {t('hrm.attendance.roster.approvals.rejectBtn')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleApprove(r, null)} // To reset back to pending or edit later if needed, but for now just a simple action
                      className="att-approval-btn-edit text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {t('hrm.attendance.roster.approvals.editBtn')}
                    </button>
                  )}
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan="6" className="att-approval-empty p-8 text-center text-slate-500 text-sm">
                {isPending ? t('hrm.attendance.roster.approvals.emptyPending') : t('hrm.attendance.roster.approvals.emptyProcessed')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="att-approval-wrapper p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="att-approval-title text-xl font-bold text-white">{t('hrm.attendance.roster.approvals.title')}</h2>
          <p className="att-approval-subtitle text-sm text-slate-400 mt-1">{t('hrm.attendance.roster.approvals.subtitle')}</p>
        </div>
        <div>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="att-approval-date-input form-input bg-surface-800 text-white border-white/10"
          />
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h3 className="att-approval-section-title text-sm font-bold text-amber-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            {t('hrm.attendance.roster.approvals.pendingSec')} ({pendingRecords.length})
          </h3>

          {pendingRecords.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={bulkApproveMutation.isPending}
              className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {bulkApproveMutation.isPending ? 'Processing...' : 'Approve All'}
            </button>
          )}
        </div>
        {renderTable(pendingRecords, true)}
      </div>

      <div>
        <h3 className="att-approval-section-title text-sm font-bold text-emerald-400 flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          {t('hrm.attendance.roster.approvals.processedSec')} ({processedRecords.length})
        </h3>
        {renderTable(processedRecords, false)}
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => bulkApproveMutation.mutate(pendingRecords.map(r => r.id))}
        title="Approve All Records?"
        message="Are you sure you want to approve ALL pending records with their claimed shifts? This will lock their attendance."
        confirmText="Yes, Approve All"
        confirmStyle="primary"
      />
    </div>
  );
}
