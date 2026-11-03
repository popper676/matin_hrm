import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import HandoverPanel from '../../components/handover/HandoverPanel';
import { useLanguage } from '../../context/LanguageContext';

const STATUS_COLORS = {
  draft: 'text-slate-400 bg-slate-500/10',
  pending_successor: 'text-amber-400 bg-amber-500/10',
  in_progress: 'text-indigo-400 bg-indigo-500/10',
  pending_review: 'text-purple-400 bg-purple-400/10',
  completed: 'text-emerald-400 bg-emerald-500/10',
  waived: 'text-slate-400 bg-slate-500/10',
  cancelled: 'text-rose-400 bg-rose-500/10',
};

const TERMINAL = ['completed', 'waived', 'cancelled'];

export default function Handovers() {
  const { t, tDyn } = useLanguage();
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [triggerType, setTriggerType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [detailId, setDetailId] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/employees').then(r => r.data.employees || r.data || []),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['handovers-admin', status, triggerType, employeeId],
    queryFn: () => api.get('/handover', {
      params: {
        status,
        ...(triggerType ? { trigger_type: triggerType } : {}),
        ...(employeeId ? { employee_id: employeeId } : {}),
        limit: 100,
      },
    }).then(r => r.data),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['handover-detail', detailId],
    queryFn: () => api.get(`/handover/${detailId}`).then(r => r.data),
    enabled: !!detailId,
  });

  const handovers = data?.handovers || [];

  return (
    <Layout title={t('hrm.handovers.title')} subtitle={t('hrm.handovers.subtitle')}>
      <div className="space-y-6">
        <div className="ho-filters flex flex-wrap gap-3 items-end">
          <div>
            <label className="ho-filter-label text-xs text-slate-500 block mb-1">{t('hrm.handovers.status')}</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="ho-select bg-surface-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
            >
              <option value="all">{t('hrm.handovers.all')}</option>
              <option value="active">{t('hrm.handovers.active')}</option>
              <option value="completed">{t('hrm.handovers.completed')}</option>
              <option value="waived">{t('hrm.handovers.waived')}</option>
              <option value="cancelled">{t('hrm.handovers.cancelled')}</option>
              <option value="in_progress">{t('hrm.handovers.inProgress')}</option>
              <option value="pending_review">{t('hrm.handovers.pendingReview')}</option>
            </select>
          </div>
          <div>
            <label className="ho-filter-label text-xs text-slate-500 block mb-1">{t('hrm.handovers.type')}</label>
            <select
              value={triggerType}
              onChange={e => setTriggerType(e.target.value)}
              className="ho-select bg-surface-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
            >
              <option value="">{t('hrm.handovers.allTypes')}</option>
              <option value="exit">{t('hrm.handovers.exitOffboarding')}</option>
              <option value="temporary_coverage">{t('hrm.handovers.leaveCoverage')}</option>
              <option value="return_from_leave">{t('hrm.handovers.returnFromLeave')}</option>
            </select>
          </div>
          <div className="min-w-[200px]">
            <label className="ho-filter-label text-xs text-slate-500 block mb-1">{t('hrm.handovers.employee')}</label>
            <select
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="ho-select w-full bg-surface-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
            >
              <option value="">{t('hrm.handovers.allEmployees')}</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.Full_name}</option>
              ))}
            </select>
          </div>
          <p className="ho-filter-meta text-xs text-slate-500 self-center">{data?.total ?? 0} {t('hrm.handovers.records')}</p>
        </div>

        <div className="ho-table-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {isLoading ? (
            <div className="p-12 text-center"><div className="ho-spinner w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ho-table w-full text-sm">
                <thead>
                  <tr className="ho-table-header text-left text-slate-500 border-b border-white/5">
                    <th className="py-3 px-5 font-medium">{t('hrm.handovers.cols.handover')}</th>
                    <th className="py-3 px-5 font-medium">{t('hrm.handovers.cols.outgoing')}</th>
                    <th className="py-3 px-5 font-medium">{t('hrm.handovers.cols.successor')}</th>
                    <th className="py-3 px-5 font-medium">{t('hrm.handovers.cols.status')}</th>
                    <th className="py-3 px-5 font-medium">{t('hrm.handovers.cols.progress')}</th>
                    <th className="py-3 px-5 font-medium">{t('hrm.handovers.cols.closed')}</th>
                    <th className="py-3 px-5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="ho-table-body">
                  {handovers.length ? handovers.map(h => (
                    <tr key={h.id} className="ho-table-row border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="py-3 px-5">
                        <p className="ho-cell-primary text-white font-medium">{tDyn("hrm.handovers.kinds", h.handover_label || h.handover_kind)}</p>
                        <p className="ho-cell-secondary text-[10px] text-slate-500 capitalize">{tDyn("hrm.handovers.types", h.trigger_type) || h.trigger_type?.replace(/_/g, ' ')}</p>
                      </td>
                      <td className="py-3 px-5">
                        <Link to={`/employees/${h.outgoing_employee_id}`} className="ho-link text-indigo-400 hover:underline">
                          {h.outgoing_name || '—'}
                        </Link>
                      </td>
                      <td className="ho-cell-text py-3 px-5 text-slate-300">{h.successor_name || '—'}</td>
                      <td className="py-3 px-5">
                        <span className={`ho-badge ho-badge-${h.status || 'draft'} text-xs font-semibold px-2 py-0.5 rounded capitalize ${STATUS_COLORS[h.status] || 'text-slate-400 bg-white/5'}`}>
                          {tDyn("hrm.offboarding.statusEnum", h.status) || h.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="ho-cell-text py-3 px-5 text-slate-400">{h.completion_pct ?? 0}% · {h.item_count ?? '—'} {t('hrm.handovers.items')}</td>
                      <td className="ho-cell-secondary py-3 px-5 text-slate-500 text-xs">
                        {(h.approved_at || h.waived_at || '').slice(0, 10) || '—'}
                      </td>
                      <td className="py-3 px-5">
                        <button
                          onClick={() => setDetailId(h.id)}
                          className="ho-btn-view text-xs font-medium text-indigo-400 bg-indigo-400/10 px-2.5 py-1.5 rounded-lg hover:bg-indigo-400/20"
                        >{t('hrm.handovers.view')}</button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="7" className="ho-empty-state py-12 text-center text-slate-500">{t('hrm.handovers.noHandovers')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailId && (
        <div className="ho-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailId(null)} />
          <div className="ho-modal-content relative rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="ho-modal-header flex items-center justify-between mb-4 sticky top-0 bg-surface-850 pb-2 z-10">
              <h2 className="ho-modal-title text-base font-bold text-white">{t('hrm.handovers.modalTitle')}</h2>
              <button aria-label="close" onClick={() => setDetailId(null)} className="ho-modal-close text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
            </div>
            {detailLoading || !detail?.handover ? (
              <div className="py-8 text-center"><div className="ho-spinner w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
            ) : (
              <HandoverPanel
                handover={detail.handover}
                items={detail.items || []}
                employees={detail.employees || employees}
                excludeEmployeeId={detail.handover.outgoing_employee_id}
                readOnly={TERMINAL.includes(detail.handover.status)}
                allowSuccessorEdit={false}
                onRefresh={() => {
                  refetch();
                  qc.invalidateQueries({queryKey:['handover-detail', detailId]});
                }}
              />
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
