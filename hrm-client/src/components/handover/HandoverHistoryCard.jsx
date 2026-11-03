import HandoverChecklistReadOnly from './HandoverChecklistReadOnly';

const STATUS_COLORS = {
  completed: 'text-emerald-400 bg-emerald-500/10',
  waived: 'text-slate-400 bg-slate-500/10',
  cancelled: 'text-rose-400 bg-rose-500/10',
};

export default function HandoverHistoryCard({ entry, role = 'outgoing' }) {
  const { handover, items = [], attachments = [] } = entry;
  const statusClass = STATUS_COLORS[handover.status] || 'text-slate-400 bg-white/5';
  const closedDate = (handover.approved_at || handover.waived_at || '').slice(0, 10);

  return (
    <div className="space-y-4 rounded-2xl p-5" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="text-base font-bold text-white">{handover.handover_label || 'Handover'}</h2>
            <p className="text-xs text-slate-400 mt-1">
              {role === 'outgoing' ? (
                <>Successor: {handover.successor_name || '—'}</>
              ) : (
                <>From: {handover.outgoing_name || '—'}</>
              )}
              {handover.leave_start && (
                <> · Leave: {(handover.leave_start || '').slice(0, 10)} → {(handover.leave_end || '').slice(0, 10)}</>
              )}
              {!handover.leave_start && handover.effective_date && (
                <> · Effective: {handover.effective_date}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <span className={`text-xs font-bold px-2 py-1 rounded-lg capitalize ${statusClass}`}>
              {handover.status?.replace(/_/g, ' ')}
            </span>
            {closedDate && <p className="text-[10px] text-slate-500 mt-1">Closed {closedDate}</p>}
          </div>
        </div>
        {handover.waived_reason && (
          <p className="text-xs text-slate-400">Waived: {handover.waived_reason}</p>
        )}
        {handover.successor_ack && (
          <p className="text-xs text-slate-500 mt-1">
            Successor ack: {handover.successor_ack.acked}/{handover.successor_ack.total}
          </p>
        )}
      </div>
      <HandoverChecklistReadOnly items={items} />
      {attachments?.length > 0 && (
        <p className="text-xs text-slate-500">{attachments.length} attachment(s) on file</p>
      )}
    </div>
  );
}
