const CAT_LABELS = {
  knowledge_transfer: 'Knowledge Transfer',
  pending_work: 'Active Work',
  clients_contacts: 'Contacts',
  documents: 'Documents',
  systems_access: 'Systems & Access',
  other: 'Other',
};

import { useLanguage } from '../../context/LanguageContext';

export default function HandoverChecklistReadOnly({ items = [], showAck = true }) {
  const { t, tDyn } = useLanguage();
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  if (!items.length) {
    return <p className="text-sm text-slate-500 text-center py-4">{t('hrm.handovers.checklist.noItems')}</p>;
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat} className="handover-panel-cat-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="handover-panel-cat-header px-5 py-3 border-b border-white/5">
            <h4 className="handover-panel-cat-title text-sm font-bold text-white">{tDyn("hrm.handovers.categories", cat) || CAT_LABELS[cat] || cat}</h4>
          </div>
          <div className="handover-panel-list divide-y divide-white/5">
            {catItems.map(item => {
              const done = item.status === 'done' || item.status === 'not_applicable';
              return (
                <div key={item.id} className="handover-panel-item px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className={`handover-panel-item-title text-sm font-medium ${done ? 'text-emerald-400' : 'text-white'}`}>
                        {item.is_required !== false && <span className="text-rose-400 mr-1">*</span>}
                        {tDyn("hrm.handovers.checklistTitles", item.title) || item.title}
                      </p>
                      {item.outgoing_notes ? (
                        <p className="handover-panel-item-notes text-xs text-slate-400 mt-1 whitespace-pre-wrap">{item.outgoing_notes}</p>
                      ) : done ? (
                        <p className="handover-panel-item-notes text-xs text-slate-500 italic mt-1">{t('hrm.handovers.checklist.markedAs')} {tDyn("hrm.offboarding.statusEnum", item.status) || item.status?.replace(/_/g, ' ')}</p>
                      ) : null}
                      {item.evidence_url && (
                        <a href={item.evidence_url} target="_blank" rel="noreferrer" className="handover-panel-item-link text-xs text-indigo-400 hover:underline mt-1 inline-block">{t('hrm.handovers.checklist.viewAttachment')}</a>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`handover-panel-item-status handover-panel-item-status-${item.status || 'default'} text-xs font-semibold px-2 py-0.5 rounded ${done ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 bg-white/5'}`}>
                        {tDyn("hrm.offboarding.statusEnum", item.status) || item.status}
                      </span>
                      {showAck && item.successor_acknowledged && (
                        <span className="handover-panel-item-ack text-[10px] text-indigo-400">✓ {t('hrm.handovers.checklist.successorAck')}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
