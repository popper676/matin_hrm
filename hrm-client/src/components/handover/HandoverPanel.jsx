import {can} from '../../../../shared/accessPolicy.js';
import {useAuth} from '../../context/AuthContext';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import HandoverChecklistReadOnly from './HandoverChecklistReadOnly';
import { useLanguage } from '../../context/LanguageContext';

const STATUS_COLORS = {
  draft: 'text-slate-400 bg-slate-500/10',
  pending_successor: 'text-amber-400 bg-amber-500/10',
  in_progress: 'text-indigo-400 bg-indigo-500/10',
  pending_review: 'text-purple-400 bg-purple-500/10',
  completed: 'text-emerald-400 bg-emerald-500/10',
  waived: 'text-slate-400 bg-slate-500/10',
  cancelled: 'text-rose-400 bg-rose-500/10',
};

export default function HandoverPanel({
  handover,
  items = [],
  employees = [],
  excludeEmployeeId,
  onRefresh,
  readOnly = false,
  allowSuccessorEdit = true,
}) {
  const { t, tDyn } = useLanguage();
  const {user}=useAuth();
  const canReview=!readOnly&&can(user,'handovers','approve');
  const canEdit=!readOnly&&can(user,'handovers','edit');
  const [successorId, setSuccessorId] = useState('');
  const [waiveReason, setWaiveReason] = useState('');
  const [showWaive, setShowWaive] = useState(false);

  const successorMutation = useMutation({
    mutationFn: (body) => api.put(`/handover/${handover.id}/successor`, body),
    onSuccess: () => { onRefresh?.(); toast.success(t('hrm.handovers.toast.succAssigned') || 'Successor assigned'); },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.handovers.toast.succError') || 'Failed to assign successor'),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/handover/${handover.id}/approve`,{version:handover.version}),
    onSuccess: () => { onRefresh?.(); toast.success(t('hrm.handovers.toast.approved') || 'Handover approved'); },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.handovers.toast.approveError') || 'Failed to approve'),
  });

  const waiveMutation = useMutation({
    mutationFn: (reason) => api.post(`/handover/${handover.id}/waive`, { reason,version:handover.version }),
    onSuccess: () => {
      setShowWaive(false);
      onRefresh?.();
      toast.success(t('hrm.handovers.toast.waived') || 'Handover waived');
      if (handover.leave_request_id || handover.trigger_type === 'temporary_coverage') {
        toast(t('hrm.handovers.toast.waiveInfo') || 'You can start a new coverage handover from Leave Requests if needed.', { icon: 'ℹ️', duration: 6000 });
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.handovers.toast.waiveError') || 'Failed to waive'),
  });

  if (!handover) return null;

  const pct = handover.completion_pct || 0;
  const statusClass = STATUS_COLORS[handover.status] || STATUS_COLORS.draft;
  const ackItems = items.filter(i => i.status === 'done' || i.status === 'not_applicable');
  const ackCount = ackItems.filter(i => i.successor_acknowledged).length;
  const needsSuccessorAck = !!handover.successor_employee_id;
  const allAcked = !needsSuccessorAck || (ackItems.length > 0 && ackCount === ackItems.length);
  const isSubmitted = handover.status === 'pending_review';
  const allRequiredDone=items.length>0&&items.filter(i=>i.is_required!==false).every(i=>['done','not_applicable'].includes(i.status));
  const canApprove = canReview && isSubmitted && allRequiredDone && (!needsSuccessorAck || allAcked);
  const isDone = ['completed', 'waived'].includes(handover.status);
  const successorOptions = employees.filter(e => e.id !== excludeEmployeeId);
  const title = tDyn('hrm.handovers.kinds', handover.handover_label || handover.handover_kind) || t('hrm.handovers.panel.defaultTitle') || 'Employee Handover';
  const closedDate = (handover.approved_at || handover.waived_at || '').slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="handover-panel-card rounded-2xl p-5" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="handover-panel-title text-sm font-bold text-white">{title}</h3>
              <span className={`handover-panel-status handover-panel-status-${handover.status || 'draft'} text-xs font-bold px-2 py-0.5 rounded-lg ${statusClass}`}>
                {tDyn("hrm.offboarding.statusEnum", handover.status) || handover.status?.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="handover-panel-meta text-xs text-slate-400">
              {t('hrm.handovers.panel.outgoing')}: <span className="handover-panel-meta-val text-white font-semibold">{handover.outgoing_name}</span>
              {' · '}{t('hrm.handovers.panel.successor')}: <span className="handover-panel-meta-val text-white font-semibold">{handover.successor_name || t('hrm.handovers.panel.notAssigned')}</span>
              {handover.leave_start && (
                <> · {t('hrm.handovers.panel.leave')}: <span className="handover-panel-meta-val text-amber-400">{handover.leave_start}</span> → <span className="handover-panel-meta-val text-amber-400">{handover.leave_end}</span></>
              )}
              {handover.handover_deadline && <> · {t('hrm.handovers.panel.deadline')}: <span className="handover-panel-meta-val text-amber-400">{handover.handover_deadline}</span></>}
            </p>
          </div>
          <div className="text-right">
            <p className={`handover-panel-pct-num text-2xl font-black ${isDone ? 'text-emerald-400' : 'text-indigo-400'}`}>{pct}%</p>
            <p className="handover-panel-pct-label text-xs text-slate-500">{t('hrm.handovers.panel.checklistComplete')}</p>
          </div>
        </div>

        <div className="handover-panel-progress-bg w-full h-2 bg-white/5 rounded-full overflow-hidden mt-4">
          <div className={`handover-panel-progress-fill h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
        </div>

        {needsSuccessorAck && !isDone && (
          <div className={`handover-panel-alert mt-3 rounded-xl px-3 py-2 text-xs ${allAcked && isSubmitted ? 'handover-panel-alert-success' : 'handover-panel-alert-warning'}`} style={{ background: allAcked && isSubmitted ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${allAcked && isSubmitted ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
            <span className={`handover-panel-alert-text ${allAcked && isSubmitted ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}`}>
              {!isSubmitted
                ? t('hrm.handovers.panel.waitingOutgoing')
                : ackItems.length === 0
                  ? t('hrm.handovers.panel.noCompletedItems')
                  : `${t('hrm.handovers.panel.successorAck')}: ${ackCount}/${ackItems.length}${allAcked ? ' — ' + t('hrm.handovers.panel.readyForHR') : ' — ' + t('hrm.handovers.panel.mustAck')}`}
            </span>
          </div>
        )}

        {canEdit && !isDone && allowSuccessorEdit && (
          <div className="mt-4 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="handover-panel-meta text-xs text-slate-400 block mb-1">{t('hrm.handovers.panel.assignSuccessor')}</label>
              <select
                value={successorId || handover.successor_employee_id || ''}
                onChange={e => setSuccessorId(e.target.value)}
                className="handover-panel-select w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
              >
                <option value="">— {t('hrm.handovers.panel.selectSuccessor')} —</option>
                {successorOptions.map(e => (
                  <option key={e.id} value={e.id}>{e.Full_name} ({e.employee_id})</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => successorMutation.mutate({ successor_employee_id: successorId || handover.successor_employee_id, successor_type: handover.successor_type || 'existing' })}
              disabled={successorMutation.isPending || !(successorId || handover.successor_employee_id)}
              className="handover-panel-btn-primary px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
            >{t('hrm.handovers.panel.saveSuccessor')}</button>
          </div>
        )}

        {canReview && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canApprove && (
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="handover-panel-btn-approve px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
              >{t('hrm.handovers.panel.approveHandover')}</button>
            )}
            {needsSuccessorAck && isSubmitted && !allAcked && (
              <span className="handover-panel-meta text-xs text-amber-400 self-center">{t('hrm.handovers.panel.waitingSuccessor')}</span>
            )}
            {!isSubmitted && !isDone && (
              <span className="handover-panel-meta text-xs text-amber-400 self-center">{t('hrm.handovers.panel.waitingOutgoingSubmit')}</span>
            )}
            {!isDone && (
              <button
                onClick={() => setShowWaive(!showWaive)}
                className="handover-panel-btn-waive px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold rounded-xl"
              >{t('hrm.handovers.panel.waiveHandover')}</button>
            )}
          </div>
        )}

        {canReview && showWaive && (
          <div className="mt-3 space-y-2">
            {(handover.leave_request_id || handover.trigger_type === 'temporary_coverage') && (
              <p className="handover-panel-meta text-xs text-slate-400">{t('hrm.handovers.panel.waiveDesc')}</p>
            )}
            <div className="flex gap-2">
            <input
              value={waiveReason}
              onChange={e => setWaiveReason(e.target.value)}
              placeholder={t('hrm.handovers.panel.waiveReason')}
              className="handover-panel-input flex-1 bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 outline-none"
            />
            <button
              onClick={() => waiveMutation.mutate(waiveReason)}
              disabled={!waiveReason.trim() || waiveMutation.isPending}
              className="handover-panel-btn-danger px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl disabled:opacity-50"
            >{t('hrm.handovers.panel.confirmWaive')}</button>
            </div>
          </div>
        )}

        {readOnly && closedDate && (
          <p className="handover-panel-bottom-text mt-3 text-xs text-slate-500">{t('hrm.handovers.panel.closed')} {closedDate}</p>
        )}
        {handover.waived_reason && (
          <p className="handover-panel-bottom-text mt-3 text-xs text-slate-400">{t('hrm.handovers.panel.waived')}: {handover.waived_reason}</p>
        )}
      </div>

      <HandoverChecklistReadOnly items={items} />
    </div>
  );
}
