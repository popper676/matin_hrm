import {useNavigate} from 'react-router-dom';
import {LEAVE_KINDS} from '../../../../shared/leavePolicy';
import LeaveEntitlements from '../../components/leave/LeaveEntitlements';
import {hasApprovalAccess,personalCan} from '../../../../shared/accessPolicy';
import Icon from '../../components/common/Icon';
import { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import HandoverPanel from '../../components/handover/HandoverPanel';
import LeaveRequestDetailModal from '../../components/leave/LeaveRequestDetailModal';
import LeaveHandoverWorkflow from '../../components/leave/LeaveHandoverWorkflow';
import LeaveRequestActionsMenu, { buildLeaveRequestMenuItems } from '../../components/leave/LeaveRequestActionsMenu';
import { useLanguage } from '../../context/LanguageContext';

function leaveDays(start, end) {
  if (!start || !end) return null;
  const s = new Date(start.slice(0, 10));
  const e = new Date(end.slice(0, 10));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : null;
}

const mapLeaveType = (name, t) => {
  if (!name) return name;
  const key = name.toLowerCase().replace(' leave', '').replace(' ', '');
  return t(`hrm.leave.leaveType.${key}`) || name;
};

const mapLeaveDescription = (name, desc, t) => {
  if (!name) return desc;
  const key = name.toLowerCase().replace(' leave', '').replace(' ', '');
  const translated = t(`hrm.leave.leaveDesc.${key}`);
  if (translated && !translated.startsWith('hrm.')) return translated;
  return desc || '—';
};

export default function Leave() {
  const { t,language } = useLanguage();
  const l=(en,my)=>language==='my'?my:en;
  const [activeTabState, setActiveTabState] = useState(localStorage.getItem('leaveTab') || 'balances');
  const activeTab = activeTabState;
  const setActiveTab = (tab) => { setActiveTabState(tab); localStorage.setItem('leaveTab', tab); };
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editTypeData, setEditTypeData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [signatureModalTarget, setSignatureModalTarget] = useState(null);
  const [coverageModal, setCoverageModal] = useState(null);
  const [handoverView, setHandoverView] = useState(null);
  const [detailRequest, setDetailRequest] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [actingSuccessorId, setActingSuccessorId] = useState('');
  const sigCanvas = useRef({});
  const { isAdmin,can,user } = useAuth();
  const navigate=useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['leave'], queryFn: () => api.get('/leave').then(r => r.data) });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, e_signature }) => api.put(`/leave/${id}/status`, { status, e_signature }),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['leave']});
      toast.success(t('hrm.leave.toast.statusUpdate') || 'Leave status updated');
      if (res.data?.warning?.message) {
        toast(res.data.warning.message, { icon: '⚠️', duration: 8000 });
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to update leave status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/leave/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['leave']}); setDeleteTarget(null); toast.success(t('hrm.leave.toast.delSuccess') || 'Leave request deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.leave.toast.delError') || 'Failed to delete leave request'),
  });

  const saveTypeMutation = useMutation({
    mutationFn: (body) => body.id ? api.put(`/leave/types/${body.id}`, body) : api.post('/leave/types', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['leave']}); setShowTypeModal(false); setEditTypeData(null); },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id) => api.delete(`/leave/types/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['leave']}); setDeleteTarget(null); },
  });

  const coverageMutation = useMutation({
    mutationFn: ({ leaveId, successor_employee_id }) =>
      api.post(`/handover/leave/${leaveId}/coverage`, { successor_employee_id }),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['leave']});
      setCoverageModal(null);
      setActingSuccessorId('');
      toast.success(t('hrm.leave.toast.covSuccess') || 'Coverage handover started');
      if (res.data?.warning?.message) {
        toast(res.data.warning.message, { icon: '⚠️', duration: 8000 });
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.leave.toast.covError') || 'Failed to start coverage handover'),
  });

  const returnMutation = useMutation({
    mutationFn: (leaveId) => api.post(`/handover/leave/${leaveId}/return`),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['leave']});
      toast.success(t('hrm.leave.toast.retSuccess') || 'Return handover started');
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.leave.toast.retError') || 'Failed to start return handover'),
  });

  const { data: handoverDetail, refetch: refetchHandover } = useQuery({
    queryKey: ['handover-leave', handoverView?.leaveId, handoverView?.kind],
    queryFn: () => api.get(`/handover/leave/${handoverView.leaveId}`).then(r => r.data),
    enabled: !!handoverView?.leaveId,
  });

  const requests = data?.requests || [];
  const leaveTypes = data?.leave_types || [];
  const employees = data?.employees || [];
  const balances = data?.balances || [];

  const TABS = [
    { id: 'balances', label: t('hrm.leave.tabs.balances') },
    { id: 'requests', label: t('hrm.leave.tabs.requests') },
    { id: 'types', label: t('hrm.leave.tabs.types') }
  ];

  const handleTypeSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.is_paid=data.is_paid==='true';
    if (editTypeData?.id) data.id = editTypeData.id;
    saveTypeMutation.mutate(data);
  };

  const leaveActionHandlers = {
    onDetails: setDetailRequest,
    onApprovals:hasApprovalAccess(user)?()=>navigate('/approvals'):null,
    onApprove: setSignatureModalTarget,
    onReject: (r) => statusMutation.mutate({ id: r.id, status: 'Rejected' }),
    onStartCoverage: (r) => { setCoverageModal(r); setActingSuccessorId(''); },
    onViewCoverage: (r) => setHandoverView({ leaveId: r.id, kind: 'coverage', readOnly: r.coverage_handover_is_terminal }),
    onStartReturn: (r) => returnMutation.mutate(r.id),
    onViewReturn: (r) => setHandoverView({ leaveId: r.id, kind: 'return', readOnly: r.return_handover_is_terminal }),
    onDelete: (r) => {
      if (r.can_delete_leave === false) {
        toast(r.delete_blocked_reason || t('hrm.leave.toast.delBlock') || 'Cannot delete while handover is active', { icon: '⚠️', duration: 6000 });
        return;
      }
      setDeleteTarget({ mode: 'request', item: r });
    },
  };

  return (
    <Layout title={t('hrm.leave.title')} subtitle={t('hrm.leave.subtitle')}>
      <div className="uyf-page-toolbar flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`leave-tab-btn px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === t.id ? 'active bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              style={activeTab === t.id ? { background: '#C8192E' } : { background: 'rgba(255,255,255,0.05)' }}>
              {t.label}
            </button>
          ))}
        </div>
        {activeTab === 'requests' ? (
          <button disabled={!personalCan(user,'leave')} onClick={() => navigate('/portal/leaves?new=1')} className="leave-primary-action flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:bg-indigo-500" style={{ background: '#C8192E' }}>
            {t('hrm.leave.newRequestBtn')}
          </button>
        ) : (
          isAdmin() && (
            <button onClick={() => { setEditTypeData(null); setShowTypeModal(true); }} className="leave-primary-action flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:bg-indigo-500" style={{ background: '#C8192E' }}>
              {t('hrm.leave.addTypeBtn')}
            </button>
          )
        )}
      </div>

      {activeTab==='balances'&&can('leave','edit')&&<LeaveEntitlements employees={employees} types={leaveTypes} balances={balances}/>}
      {/* Leave Balances Table */}
      {activeTab === 'balances' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {isLoading ? <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-850, #161929)' }}>
                  <tr>
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.leave.balances.emp')}</th>
                    <th className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.leave.balances.type')}</th>
                    <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.leave.balances.entitled')}</th>
                    <th className="text-center py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.leave.balances.used')}</th>
                    <th className="text-center py-3.5 px-5 text-xs font-semibold text-emerald-400 uppercase tracking-wider">{t('hrm.leave.balances.remaining')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {balances.length > 0 ? balances.map(b => {
                    const emp = employees.find(e => e.id === b.employee_id);
                    const empName = emp ? emp.Full_name : 'Unknown';
                    const empIdStr = emp ? emp.employee_id : '';
                    const used = Number(b.used_days || 0);
                    const entitled = Number(b.entitled_days || 0);
                    const pct = entitled > 0 ? Math.round((used / entitled) * 100) : 0;
                    return (
                      <tr key={b.id} className="hover:bg-white/2 transition-colors">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white">
                              {empName[0]}
                            </div>
                            <div>
                              <p className="text-white font-medium text-sm">{empName}</p>
                              {empIdStr && <p className="text-xs text-slate-500 font-mono">{empIdStr}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-slate-300 font-medium">{mapLeaveType(b.type_name, t)}</td>
                        <td className="py-3 px-5 text-center text-slate-300">{b.entitled_days}</td>
                        <td className="py-3 px-5 text-center text-slate-300">
                          <div className="flex flex-col items-center gap-1">
                            <span>{b.used_days}</span>
                            <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 80 ? '#f43f5e' : pct > 50 ? '#f59e0b' : '#10b981' }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-center font-bold text-emerald-400">{b.remain_days}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan="5" className="py-12 text-center text-slate-500 text-sm">{t('hrm.leave.balances.empty')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Requests Table */}
      {activeTab === 'requests' && (
        <div className="leave-req-table-wrapper rounded-2xl" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
          {isLoading ? <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
          : (
            <div className="overflow-x-auto rounded-2xl">
              <table className="leave-req-table w-full text-sm">
                <thead className="leave-req-thead" style={{ background: 'var(--bg-850, #161929)' }}>
                  <tr>
                    {[t('hrm.leave.requests.emp'), t('hrm.leave.requests.leave'), t('hrm.leave.requests.period'), t('hrm.leave.requests.progress'), ''].map(h => (
                      <th key={h || 'actions'} className="leave-req-th text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="leave-req-tbody">
                  {requests.length > 0 ? requests.map(r => {
                    const days = r.working_days ?? leaveDays(r.start_date, r.end_date);
                    const menuItems = buildLeaveRequestMenuItems(r, leaveActionHandlers, { isAdmin: isAdmin(), t });
                    return (
                    <tr
                      key={r.id}
                      className="leave-req-tr border-t border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => setDetailRequest(r)}
                    >
                      <td className="leave-req-td py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="leave-req-avatar w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                            {(r.employee_name || '?')[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="leave-req-emp-name text-white text-sm font-medium truncate">{r.employee_name}</p>
                            {r.employee_code && <p className="leave-req-emp-code text-[10px] text-slate-500 font-mono">{r.employee_code}</p>}
                            {r.employee_in_offboarding && (
                              <span className="inline-block text-[10px] font-semibold text-amber-400 mt-0.5">{t('hrm.leave.requests.offboarding')}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="leave-req-td py-4 px-5">
                        <p className="leave-req-type text-slate-200 font-medium">{mapLeaveType(r.type_name, t)}</p>
                        {r.reason && (
                          <p className="leave-req-reason text-[11px] text-slate-500 mt-0.5 line-clamp-1 max-w-[180px]" title={r.reason}>{r.reason}</p>
                        )}
                        {r.document_url && (
                          <a
                            href={r.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="leave-req-attachment text-[10px] text-indigo-400 hover:text-indigo-300 mt-0.5 inline-block"
                          >
                            {t('hrm.leave.requests.attachment')}
                          </a>
                        )}
                      </td>
                      <td className="leave-req-td py-4 px-5 whitespace-nowrap">
                        <p className="leave-req-dates text-slate-300 text-sm">{(r.start_date || '').slice(0, 10)}</p>
                        <p className="leave-req-duration text-slate-500 text-xs">→ {(r.end_date || '').slice(0, 10)}{days != null && ` · ${days}d`}</p>
                      </td>
                      <td className="leave-req-td py-4 px-5" onClick={e => e.stopPropagation()}>
                        <LeaveHandoverWorkflow request={r} />
                      </td>
                      <td className="leave-req-td py-4 px-5" onClick={e => e.stopPropagation()}>
                        <div className="leave-req-actions flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailRequest(r)}
                            className="leave-req-btn-view p-2 rounded-lg text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                            title="View details & signature"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {isAdmin() && r.status === 'Pending' && (
                            <button
                              onClick={() => setSignatureModalTarget(r)}
                              className="leave-req-btn-approve p-2 rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                              title="Approve with signature"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                          <LeaveRequestActionsMenu
                            isOpen={openMenuId === r.id}
                            onToggle={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                            onClose={() => setOpenMenuId(null)}
                            items={menuItems}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  }) : <tr><td colSpan="5" className="leave-req-empty py-12 text-center text-slate-500 text-sm">{t('hrm.leave.requests.empty')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Leave Types */}
      {activeTab === 'types' && (
        <div className="leave-type-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {leaveTypes.length > 0 ? leaveTypes.map(tType => (
            <div key={tType.id} className="leave-type-card rounded-2xl p-6 flex flex-col justify-between transition-transform hover:-translate-y-1" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`leave-type-badge ${tType.is_paid !== false ? 'leave-type-badge-paid text-emerald-400 bg-emerald-400/10' : 'leave-type-badge-unpaid text-slate-400 bg-white/5'} text-xs font-semibold px-3 py-1 rounded-full`}>
                    {tType.is_paid !== false ? t('hrm.leave.types.paid') : t('hrm.leave.types.unpaid')}
                  </span>
                  <span className="leave-type-days-num text-3xl font-bold text-white">{tType.default_days}</span>
                </div>
                <h3 className="leave-type-title text-lg font-bold text-white mb-1">{mapLeaveType(tType.type_name, t)}</h3>
                <p className="leave-type-desc text-sm text-slate-400 mb-2 leading-relaxed">{mapLeaveDescription(tType.type_name, tType.description, t)}</p>
                <p className="leave-type-days-text text-xs text-slate-500 font-medium">{tType.default_days} {t('hrm.leave.types.daysEntitlement')}</p>
              </div>

              <div className="leave-type-actions flex justify-end gap-4 mt-6 pt-4 border-t border-white/5">
                {isAdmin() && (
                  <>
                    <button onClick={() => { setEditTypeData(tType); setShowTypeModal(true); }} className="leave-type-btn-edit text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      {t('hrm.leave.types.edit')}
                    </button>
                    <button onClick={() => setDeleteTarget({ mode: 'type', item: tType })} className="leave-type-btn-delete text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      {t('hrm.leave.types.delete')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )) : (
            <div className="leave-type-empty col-span-full py-12 text-center text-slate-500 text-sm bg-surface-850 rounded-2xl border border-white/5">
              {t('hrm.leave.types.empty')}
            </div>
          )}
        </div>
      )}

      {/* Coverage handover modal */}
      {coverageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCoverageModal(null)} />
          <div className="relative rounded-2xl w-full max-w-md m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">{t('hrm.leave.coverage.title')}</h2>
              <button aria-label="close" onClick={() => setCoverageModal(null)} className="text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              {t('hrm.leave.coverage.assign')} <span className="text-white font-semibold">{coverageModal.employee_name}</span> {t('hrm.leave.coverage.during')} ({(coverageModal.start_date || '').slice(0, 10)} → {(coverageModal.end_date || '').slice(0, 10)}).
            </p>
            {coverageModal.employee_in_offboarding && (
              <div className="mb-4 rounded-xl p-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30">
                <p className="font-bold mb-1">{t('hrm.leave.coverage.offboardWarnTitle')}</p>
                <p>{coverageModal.offboarding_warning || t('hrm.leave.coverage.offboardWarn')}</p>
              </div>
            )}
            <label className="form-label">{t('hrm.leave.coverage.successor')}</label>
            <select
              value={actingSuccessorId}
              onChange={e => setActingSuccessorId(e.target.value)}
              className="form-input mb-4"
            >
              <option value="">{t('hrm.leave.modal.selectEmp')}</option>
              {employees.filter(e => e.id !== coverageModal.employee_id).map(e => (
                <option key={e.id} value={e.id}>{e.Full_name} ({e.employee_id})</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setCoverageModal(null)} className="flex-1 text-sm text-slate-400 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>{t('hrm.leave.modal.cancel')}</button>
              <button
                type="button"
                disabled={!actingSuccessorId || coverageMutation.isPending}
                onClick={() => coverageMutation.mutate({ leaveId: coverageModal.id, successor_employee_id: actingSuccessorId })}
                className="flex-1 text-sm font-semibold text-white py-2.5 rounded-xl disabled:opacity-50"
                style={{ background: '#C8192E' }}
              >
                {coverageMutation.isPending ? t('hrm.leave.coverage.starting') : t('hrm.leave.coverage.startBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover detail modal */}
      {handoverView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setHandoverView(null)} />
          <div className="relative rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-surface-850 pb-2 z-10">
              <h2 className="text-base font-bold text-white">
                {handoverView.readOnly ? t('hrm.leave.handover.history') : ''}
                {handoverView.kind === 'return' ? t('hrm.leave.handover.return') : t('hrm.leave.handover.coverage')}
              </h2>
              <button aria-label="close" onClick={() => setHandoverView(null)} className="text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
            </div>
            {(() => {
              const detail = handoverView.kind === 'return' ? handoverDetail?.returnDetail : handoverDetail?.coverageDetail;
              if (!detail?.handover) {
                return <div className="py-8 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>;
              }
              return (
                <HandoverPanel
                  handover={detail.handover}
                  items={detail.items || []}
                  employees={handoverDetail?.employees || employees}
                  excludeEmployeeId={detail.handover.outgoing_employee_id}
                  readOnly={handoverView.readOnly || ['completed', 'waived', 'cancelled'].includes(detail.handover.status)}
                  allowSuccessorEdit={!handoverView.readOnly && handoverView.kind === 'coverage' && !detail.handover.successor_employee_id}
                  onRefresh={() => {
                    refetchHandover();
                    qc.invalidateQueries({queryKey:['leave']});
                  }}
                />
              );
            })()}
          </div>
        </div>
      )}

      <LeaveRequestDetailModal
        request={detailRequest}
        onClose={() => setDetailRequest(null)}
        isAdmin={isAdmin()}
        onApprove={setSignatureModalTarget}
        onReject={(r) => statusMutation.mutate({ id: r.id, status: 'Rejected' })}
        onViewCoverage={(r) => setHandoverView({ leaveId: r.id, kind: 'coverage', readOnly: r.coverage_handover_is_terminal })}
        onViewReturn={(r) => setHandoverView({ leaveId: r.id, kind: 'return', readOnly: r.return_handover_is_terminal })}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget.mode === 'request') deleteMutation.mutate(deleteTarget.item.id);
          else deleteTypeMutation.mutate(deleteTarget.item.id);
        }}
        itemName={deleteTarget?.mode === 'type' ? deleteTarget.item.type_name : 'Leave Request'}
        blockedReason={deleteTarget?.mode === 'request' && deleteTarget.item?.can_delete_leave === false ? (deleteTarget.item.delete_blocked_reason || t('hrm.leave.toast.delBlock')) : null}
        warning={deleteTarget?.mode === 'request' && deleteTarget.item?.coverage_handover_status
          ? t('hrm.leave.toast.delWarn')
          : null}
      />

      {/* Leave Type Form Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTypeModal(false)} />
          <div className="relative rounded-2xl w-full max-w-md m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">{editTypeData ? t('hrm.leave.typeModal.edit') : t('hrm.leave.typeModal.add')}</h2>
              <button aria-label="close" onClick={() => setShowTypeModal(false)} className="text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
            </div>
            <form onSubmit={handleTypeSubmit} className="space-y-4">
              <label className="form-label">{l('Policy category','ခွင့်စည်းမျဉ်းအမျိုးအစား')}<select name="kind" className="form-input" required defaultValue={editTypeData?.kind||'other'}>{LEAVE_KINDS.map(([k,en,my])=><option key={k} value={k}>{l(en,my)}</option>)}</select></label>
              <label className="form-label">{l('Paid leave','လစာပါခွင့်')}<select name="is_paid" className="form-input" defaultValue={String(editTypeData?.is_paid!==false)}><option value="true">{l('Paid','လစာပါ')}</option><option value="false">{l('Unpaid','လစာမဲ့')}</option></select></label>
              <div>
                <label className="form-label">{t('hrm.leave.typeModal.name')}</label>
                <input type="text" name="type_name" required defaultValue={editTypeData?.type_name || ''} className="form-input" placeholder={t('hrm.leave.typeModal.namePlaceholder')} />
              </div>
              <div>
                <label className="form-label">{t('hrm.leave.typeModal.days')}</label>
                <input type="number" step="0.5" min="0" name="default_days" required defaultValue={editTypeData?.default_days || 0} className="form-input" />
              </div>
              <div>
                <label className="form-label">{t('hrm.leave.typeModal.desc')}</label>
                <textarea name="description" rows="3" defaultValue={editTypeData?.description || ''} className="form-input" placeholder={t('hrm.leave.typeModal.descPlaceholder')} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTypeModal(false)} className="flex-1 text-sm text-slate-400 py-2.5 rounded-xl transition-colors hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.05)' }}>{t('hrm.leave.modal.cancel')}</button>
                <button type="submit" disabled={saveTypeMutation.isPending} className="flex-1 text-sm font-semibold text-white py-2.5 rounded-xl transition-all hover:bg-indigo-500 disabled:opacity-50" style={{ background: '#C8192E' }}>
                  {saveTypeMutation.isPending ? t('hrm.leave.typeModal.saving') : t('hrm.leave.typeModal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {signatureModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-800 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
              <h2 className="text-lg font-bold text-white">{t('hrm.leave.sig.title')}</h2>
              <button aria-label="close" onClick={() => setSignatureModalTarget(null)} className="text-slate-400 hover:text-white transition-colors">
                <Icon name="close" size={17}/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300">{t('hrm.leave.sig.desc')} <span className="font-bold text-white">{signatureModalTarget.employee_name}</span>.</p>
              {signatureModalTarget.employee_in_offboarding && (
                <div className="rounded-xl p-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30">
                  <p className="font-bold mb-1">{t('hrm.leave.coverage.offboardWarnTitle')}</p>
                  <p>{signatureModalTarget.offboarding_warning || t('hrm.leave.sig.offboardWarn')}</p>
                </div>
              )}
              <div className="border border-slate-300 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-surface-850 overflow-hidden">
                <SignatureCanvas
                  ref={sigCanvas}
                  penColor="#0f172a"
                  canvasProps={{ width: 500, height: 200, className: 'w-full h-[200px] cursor-crosshair dark:invert' }}
                />
              </div>
              <div className="flex justify-end">
                <button onClick={() => sigCanvas.current.clear()} className="text-xs text-slate-400 hover:text-white transition-colors">{t('hrm.leave.sig.clear')}</button>
              </div>
            </div>
            <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-black/20">
              <button
                onClick={() => setSignatureModalTarget(null)}
                className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
              >
                {t('hrm.leave.modal.cancel')}
              </button>
              <button
                onClick={() => {
                  try {
                    if (!sigCanvas.current || typeof sigCanvas.current.isEmpty !== 'function') {
                       toast.error("Signature pad is still loading, please wait.");
                       return;
                    }
                    if (sigCanvas.current.isEmpty()) {
                      alert(t('hrm.leave.toast.noSig') || "Please provide a signature first.");
                      return;
                    }
                    const canvas = sigCanvas.current.getCanvas();
                    if (!canvas) throw new Error("Could not get canvas");
                    const e_signature = canvas.toDataURL('image/png');
                    statusMutation.mutate({ id: signatureModalTarget.id, status: 'Approved', e_signature });
                    setSignatureModalTarget(null);
                  } catch (err) {
                    console.error("Signature processing error:", err);
                    toast.error("Error processing signature: " + err.message);
                  }
                }}
                className="px-5 py-2 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/25"
              >
                {t('hrm.leave.sig.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
