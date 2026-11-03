const HANDOVER_DOT = {
  completed: 'bg-emerald-500 ring-emerald-500/30',
  waived: 'bg-slate-500 ring-slate-500/30',
  cancelled: 'bg-rose-500 ring-rose-500/30',
  in_progress: 'bg-indigo-500 ring-indigo-500/30 animate-pulse',
  pending_review: 'bg-purple-500 ring-purple-500/30',
  pending_successor: 'bg-amber-500 ring-amber-500/30',
  draft: 'bg-slate-600 ring-slate-600/30',
};

const LEAVE_DOT = {
  Approved: 'bg-emerald-500 ring-emerald-500/30',
  Pending: 'bg-amber-500 ring-amber-500/30 animate-pulse',
  Rejected: 'bg-rose-500 ring-rose-500/30',
};

function Step({ label, statusLabel, dotClass, muted }) {
  return (
    <div className={`leave-step flex flex-col items-center min-w-0 flex-1 ${muted ? 'leave-step-muted opacity-40' : ''}`}>
      <div className={`leave-dot w-2.5 h-2.5 rounded-full ring-4 flex-shrink-0 ${dotClass}`} title={statusLabel} />
      <span className="leave-step-label text-[9px] font-semibold text-slate-500 mt-1.5 uppercase tracking-wide truncate max-w-full px-0.5">{label}</span>
      <span className="leave-step-status text-[9px] text-slate-400 capitalize truncate max-w-full px-0.5">{statusLabel}</span>
    </div>
  );
}

function coverageStep(request) {
  if (!request.coverage_handover_status) {
    if (request.status === 'Approved' && request.can_start_coverage) {
      return { statusLabel: 'ready', dotClass: 'bg-slate-600 ring-slate-600/30', muted: false };
    }
    if (request.status !== 'Approved') return { statusLabel: '—', dotClass: 'bg-slate-700 ring-slate-700/20', muted: true };
    return { statusLabel: '—', dotClass: 'bg-slate-700 ring-slate-700/20', muted: true };
  }
  const s = request.coverage_handover_status;
  return {
    statusLabel: s.replace(/_/g, ' '),
    dotClass: HANDOVER_DOT[s] || 'bg-slate-600 ring-slate-600/30',
    muted: false,
  };
}

function returnStep(request) {
  if (!request.return_handover_status) {
    if (request.can_start_return) {
      return { statusLabel: 'ready', dotClass: 'bg-amber-500/80 ring-amber-500/30', muted: false };
    }
    return { statusLabel: '—', dotClass: 'bg-slate-700 ring-slate-700/20', muted: true };
  }
  const s = request.return_handover_status;
  return {
    statusLabel: s.replace(/_/g, ' '),
    dotClass: HANDOVER_DOT[s] || 'bg-slate-600 ring-slate-600/30',
    muted: false,
  };
}

import { useLanguage } from '../../context/LanguageContext';

export default function LeaveHandoverWorkflow({ request }) {
  const { t } = useLanguage();
  const cov = coverageStep(request);
  const ret = returnStep(request);
  const leaveLabel = request.status || '—';

  return (
    <div className="flex items-start gap-0 min-w-[200px] max-w-[240px]">
      <Step
        label={t('hrm.leave.wfLeave') || 'Leave'}
        statusLabel={leaveLabel}
        dotClass={`leave-dot-${request.status?.toLowerCase() || 'default'} ${LEAVE_DOT[request.status] || 'bg-slate-600 ring-slate-600/30'}`}
        muted={false}
      />
      <div className={`leave-step-line h-px w-4 mt-1.5 flex-shrink-0 ${cov.muted ? 'bg-white/5' : 'bg-white/15'}`} />
      <Step label={t('hrm.leave.wfCoverage') || 'Coverage'} statusLabel={cov.statusLabel} dotClass={`leave-dot-handover-${(request.coverage_handover_status || 'default').toLowerCase()} ${cov.dotClass}`} muted={cov.muted} />
      <div className={`leave-step-line h-px w-4 mt-1.5 flex-shrink-0 ${ret.muted ? 'bg-white/5' : 'bg-white/15'}`} />
      <Step label={t('hrm.leave.wfReturn') || 'Return'} statusLabel={ret.statusLabel} dotClass={`leave-dot-handover-${(request.return_handover_status || 'default').toLowerCase()} ${ret.dotClass}`} muted={ret.muted} />
    </div>
  );
}
