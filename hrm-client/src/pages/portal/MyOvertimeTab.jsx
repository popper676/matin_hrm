import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';

export default function MyOvertimeTab() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ ot_date: '', start_time: '', end_time: '', reason: '' });

  // Get employee ID directly from user portal data (or backend handles it via JWT, our API does it via JWT)
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my_overtime'],
    queryFn: () => api.get('/overtime/my').then(r => r.data)
  });

  // We need employee_id to create request. We can fetch it from /portal or assume backend will fill it?
  // Our backend expects employee_id from req.body for now. Let's get it from portal data.
  const { data: portalData } = useQuery({
    queryKey: ['portal_data'],
    queryFn: () => api.get('/portal').then(r => r.data)
  });

  const empId = portalData?.emp?.id;

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/overtime/request', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['my_overtime']});
      setShowModal(false);
      setFormData({ ot_date: '', start_time: '', end_time: '', reason: '' });
      toast.success(t('portal.overtime.toast.reqSuccess'));
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || t('portal.overtime.toast.reqFailed'));
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/overtime/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['my_overtime']});
      toast.success(t('portal.overtime.toast.statusUpdate'));
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || t('portal.overtime.toast.statusFailed'));
    }
  });

  const handleRequest = (e) => {
    e.preventDefault();
    if (!empId) {
      toast.error(t('portal.overtime.toast.profileNotLoaded'));
      return;
    }
    createMutation.mutate({
      ...formData,
      employee_id: empId,
      requested_by: 'employee'
    });
  };

  const getStatusBadge = (status) => {
    const config = {
      'Pending_Boss_Approval': { text: t('portal.overtime.status.pendingBoss'), css: 'bg-amber-500/10 text-amber-400 border border-amber-400/20' },
      'Pending_Employee_Acceptance': { text: t('portal.overtime.status.actionRequired'), css: 'bg-orange-500/10 text-orange-400 border border-orange-400/20 animate-pulse' },
      'Approved': { text: t('portal.overtime.status.approved'), css: 'bg-emerald-500/10 text-emerald-400 border border-emerald-400/20' },
      'Rejected': { text: t('portal.overtime.status.rejected'), css: 'bg-rose-500/10 text-rose-400 border border-rose-400/20' }
    };
    const c = config[status] || { text: status, css: 'bg-slate-500/10 text-slate-400 border border-slate-400/20' };
    return <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${c.css}`}>{c.text}</span>;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">{t('portal.overtime.title')}</h3>
          <p className="text-sm text-slate-400">{t('portal.overtime.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold py-2 px-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/25 flex items-center gap-2"
        >
          <span>➕ {t('portal.overtime.requestBtn')}</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase font-bold text-slate-400 bg-black/20 border-b border-white/5">
            <tr>
              <th className="py-4 px-5">{t('hrm.attendance.roster.overtime.cols.date')}</th>
              <th className="py-4 px-5">{t('hrm.attendance.roster.overtime.cols.time')}</th>
              <th className="py-4 px-5">{t('hrm.attendance.roster.overtime.cols.reason')}</th>
              <th className="py-4 px-5">{t('hrm.attendance.roster.overtime.cols.origin')}</th>
              <th className="py-4 px-5">{t('hrm.attendance.roster.overtime.cols.status')}</th>
              <th className="py-4 px-5 text-right">{t('hrm.attendance.roster.overtime.cols.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan="5" className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </td>
              </tr>
            ) : requests.length > 0 ? (
              requests.map(r => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-4 px-5 text-emerald-400 font-mono text-xs">{r.ot_date}</td>
                  <td className="py-4 px-5 text-cyan-400 font-mono text-xs">{r.start_time ? `${r.start_time.slice(0,5)} - ${r.end_time.slice(0,5)}` : '—'}</td>
                  <td className="py-4 px-5 text-slate-300 max-w-[250px] truncate" title={r.reason}>{r.reason || '—'}</td>
                  <td className="py-4 px-5">
                    {r.requested_by === 'hr_boss'
                      ? <span className="text-xs font-semibold text-indigo-400"><Icon name="departments" size={17}/> {t('portal.overtime.origins.boss')}</span>
                      : <span className="text-xs text-slate-400"><Icon name="users" size={17}/> {t('portal.overtime.origins.self')}</span>}
                  </td>
                  <td className="py-4 px-5">{getStatusBadge(r.status)}</td>
                  <td className="py-4 px-5 text-right space-x-2">
                    {r.status === 'Pending_Employee_Acceptance' && (
                      <>
                        <button
                          onClick={() => statusMutation.mutate({ id: r.id, status: 'Approved' })}
                          className="px-3 py-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
                        >
                          {t('portal.overtime.actions.accept')}
                        </button>
                        <button
                          onClick={() => statusMutation.mutate({ id: r.id, status: 'Rejected' })}
                          className="px-3 py-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors"
                        >
                          {t('portal.overtime.actions.decline')}
                        </button>
                      </>
                    )}
                    {(r.status === 'Pending_Boss_Approval') && (
                      <span className="text-xs text-slate-500 italic">{t('portal.overtime.actions.waiting')}</span>
                    )}
                    {(r.status === 'Approved' || r.status === 'Rejected') && (
                      <span className="text-xs text-slate-500 italic">{t('portal.overtime.actions.closed')}</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="py-12 text-center text-slate-500">{t('portal.overtime.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
              <h2 className="text-lg font-bold text-white">{t('portal.overtime.modal.title')}</h2>
              <button aria-label="close" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors"><Icon name="close" size={17}/></button>
            </div>
            <form onSubmit={handleRequest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">{t('portal.overtime.modal.date')}</label>
                <input
                  type="date"
                  required
                  value={formData.ot_date}
                  onChange={e => setFormData({...formData, ot_date: e.target.value})}
                  className="w-full bg-surface-850 portal-form-control text-slate-300 text-sm rounded-xl px-4 py-2.5 border border-white/5 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">{t('portal.overtime.modal.start')}</label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={e => setFormData({...formData, start_time: e.target.value})}
                    className="w-full bg-surface-850 portal-form-control text-slate-300 text-sm rounded-xl px-4 py-2.5 border border-white/5 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">{t('portal.overtime.modal.end')}</label>
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={e => setFormData({...formData, end_time: e.target.value})}
                    className="w-full bg-surface-850 portal-form-control text-slate-300 text-sm rounded-xl px-4 py-2.5 border border-white/5 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">{t('portal.overtime.modal.reason')}</label>
                <textarea
                  rows="3"
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  className="w-full bg-surface-850 portal-form-control text-slate-300 text-sm rounded-xl px-4 py-2.5 border border-white/5 outline-none focus:border-indigo-500 resize-none"
                  placeholder={t('portal.overtime.modal.reasonPlh')}
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white">{t('portal.overtime.modal.cancel')}</button>
                <button type="submit" disabled={createMutation.isPending || !empId} className="px-5 py-2 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 disabled:opacity-50 shadow-lg shadow-indigo-500/25">
                  {createMutation.isPending ? t('portal.overtime.modal.sending') : t('portal.overtime.modal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
