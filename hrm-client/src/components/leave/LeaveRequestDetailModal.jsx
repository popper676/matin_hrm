import Modal from '../experience/Modal';
import {LeaveFormReview} from './LeaveForm';
import Icon from '../common/Icon';
const STATUS_CFG = {
  Pending: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  Approved: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Rejected: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
};

const HANDOVER_STATUS_CFG = {
  in_progress: 'text-indigo-400 bg-indigo-400/10',
  pending_review: 'text-purple-400 bg-purple-400/10',
  completed: 'text-emerald-400 bg-emerald-400/10',
  waived: 'text-slate-400 bg-slate-400/10',
  pending_successor: 'text-amber-400 bg-amber-400/10',
};

function DetailRow({ label, children }) {
  return (
    <div className="leave-detail-row flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-white/5 last:border-0">
      <span className="leave-detail-label text-xs font-semibold text-slate-500 uppercase tracking-wider sm:w-36 flex-shrink-0">{label}</span>
      <div className="leave-detail-value text-sm text-slate-200 flex-1 min-w-0">{children}</div>
    </div>
  );
}

function leaveDays(start, end) {
  if (!start || !end) return null;
  const s = new Date(start.slice(0, 10));
  const e = new Date(end.slice(0, 10));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : null;
}

import { useLanguage } from '../../context/LanguageContext';

export default function LeaveRequestDetailModal({
  request,
  onClose,
  isAdmin,
  onApprove,
  onReject,
  onViewCoverage,
  onViewReturn,
}) {
  const { t } = useLanguage();
  if (!request) return null;
  if(request.form_version===2)return <Modal open wide title={request.employee_name||'Leave request'} onClose={onClose}><div className="ux-modal-body"><LeaveFormReview id={request.id}/></div></Modal>;
  const days = leaveDays(request.start_date, request.end_date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="leave-detail-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="leave-detail-content relative rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4"
        style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="leave-detail-header p-5 border-b border-white/5 flex justify-between items-start sticky top-0 bg-surface-850 z-10">
          <div>
            <h2 className="leave-detail-title text-base font-bold text-white">{request.employee_name}</h2>
            <p className="leave-detail-subtitle text-xs text-slate-400 mt-0.5">
              {request.type_name} · {(request.start_date || '').slice(0, 10)} → {(request.end_date || '').slice(0, 10)}
              {days != null && ` · ${days}d`}
            </p>
          </div>
          <button aria-label="close" onClick={onClose} className="leave-detail-close text-slate-400 hover:text-white text-lg leading-none p-1"><Icon name="close" size={17}/></button>
        </div>

        <div className="p-5">
          {request.employee_in_offboarding && (
            <div className="leave-detail-alert mb-4 rounded-xl p-3 border">
              <p className="leave-detail-alert-title font-bold mb-0.5"><Icon name="warning" size={17}/> {t('hrm.leave.modal.offboardingActive')}</p>
              <p className="leave-detail-alert-text">{request.offboarding_warning}</p>
            </div>
          )}

          <DetailRow label={t('hrm.leave.modal.employee')}>
            <p className="leave-detail-emp-name text-white font-semibold">{request.employee_name}</p>
            {request.employee_code && <p className="leave-detail-emp-code text-xs text-slate-500 font-mono mt-0.5">{request.employee_code}</p>}
          </DetailRow>

          <DetailRow label={t('hrm.leave.modal.status')}>
            <span className={`leave-detail-status leave-detail-status-${(request.status || 'pending').toLowerCase()} inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_CFG[request.status] || 'text-slate-400 bg-white/5 border-white/10'}`}>
              {request.status}
            </span>
            {request.created_at && (
              <p className="leave-detail-date text-xs text-slate-500 mt-1">{t('hrm.leave.modal.submitted')} {(request.created_at || '').slice(0, 10)}</p>
            )}
          </DetailRow>

          <DetailRow label={t('hrm.leave.modal.reason')}>
            <p className="leave-detail-reason text-slate-300 whitespace-pre-wrap">{request.reason || '—'}</p>
          </DetailRow>

          {request.document_url && (
            <DetailRow label={t('hrm.leave.modal.attachment')}>
              <a href={request.document_url} target="_blank" rel="noopener noreferrer" className="leave-detail-attachment text-indigo-400 hover:text-indigo-300 font-medium">
                <Icon name="documents" size={17}/> {t('hrm.leave.modal.viewDocument')}
              </a>
            </DetailRow>
          )}

          {(request.coverage_handover_status || request.return_handover_status) && (
            <DetailRow label={t('hrm.leave.modal.handovers')}>
              <div className="flex flex-wrap gap-2">
                {request.coverage_handover_status && (
                  <span className={`leave-detail-handover leave-detail-handover-${request.coverage_handover_status} text-xs font-semibold px-2 py-1 rounded-lg capitalize ${HANDOVER_STATUS_CFG[request.coverage_handover_status] || 'text-slate-400 bg-white/5'}`}>
                    {t('hrm.leave.modal.coverage')}: {request.coverage_handover_status.replace(/_/g, ' ')}
                  </span>
                )}
                {request.return_handover_status && (
                  <span className={`leave-detail-handover leave-detail-handover-${request.return_handover_status} text-xs font-semibold px-2 py-1 rounded-lg capitalize ${HANDOVER_STATUS_CFG[request.return_handover_status] || 'text-slate-400 bg-white/5'}`}>
                    {t('hrm.leave.modal.return')}: {request.return_handover_status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </DetailRow>
          )}

          <DetailRow label={t('hrm.leave.modal.hrSignature')}>
            {request.e_signature ? (
              <div className="space-y-2">
                <p className="leave-detail-sig-text text-xs text-slate-500">{t('hrm.leave.modal.capturedOnApproval')}</p>
                <div className="leave-detail-sig-box rounded-xl border border-white/10 bg-white/5 p-4 inline-block">
                  {/^data:image\/(png|jpeg|webp|gif);base64,/.test(request.e_signature)?<img src={request.e_signature} alt={t('hrm.leave.modal.hrApprovalSignature')} className="max-h-28 max-w-[240px] object-contain" />:<p>{request.e_signature}</p>}
                </div>
              </div>
            ) : request.status === 'Approved' ? (
              <p className="leave-detail-sig-text text-xs text-slate-500 italic">{t('hrm.leave.modal.noSignatureOnFile')}</p>
            ) : request.status === 'Rejected' ? (
              <p className="leave-detail-sig-text text-xs text-slate-500 italic">{t('hrm.leave.modal.naRejected')}</p>
            ) : (
              <p className="leave-detail-sig-text text-xs text-slate-500 italic">{t('hrm.leave.modal.requiredWhenApproving')}</p>
            )}
          </DetailRow>
        </div>

        <div className="leave-detail-footer p-5 border-t border-white/5 flex flex-wrap gap-2 justify-end bg-black/20 sticky bottom-0">
          <button onClick={onClose} className="leave-detail-btn-close px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>{t('common.actions.close')}</button>
          {isAdmin && request.status === 'Pending' && !request.approval_id && (
            <>
              <button onClick={() => { onReject?.(request); onClose(); }} className="leave-detail-btn-reject px-4 py-2 text-sm font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl">{t('common.actions.reject')}</button>
              <button onClick={() => { onApprove?.(request); onClose(); }} className="leave-detail-btn-approve px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">{t('common.actions.approve')}</button>
            </>
          )}
          {isAdmin && request.can_view_coverage_history && (
            <button onClick={() => { onViewCoverage?.(request); onClose(); }} className="leave-detail-btn-handover px-4 py-2 text-sm font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl">
              {request.coverage_handover_is_terminal ? t('hrm.leave.actions.covHistory') : t('hrm.leave.actions.openCov')}
            </button>
          )}
          {isAdmin && request.can_view_return_history && (
            <button onClick={() => { onViewReturn?.(request); onClose(); }} className="leave-detail-btn-handover px-4 py-2 text-sm font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl">
              {request.return_handover_is_terminal ? t('hrm.leave.actions.retHistory') : t('hrm.leave.actions.openRet')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
