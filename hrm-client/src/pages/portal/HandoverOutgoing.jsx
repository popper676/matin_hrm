import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import HandoverHistoryCard from '../../components/handover/HandoverHistoryCard';

const CAT_LABELS = {
  knowledge_transfer: 'Knowledge Transfer',
  pending_work: 'Active Work',
  clients_contacts: 'Contacts',
  documents: 'Documents',
  systems_access: 'Systems & Access',
  other: 'Other',
};

function TabBar({ tab, setTab }) {
  return (
    <div className="flex gap-2 mb-6">
      {['active', 'past'].map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
            tab === t ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
          }`}
        >
          {t === 'active' ? 'Active' : 'Past'}
        </button>
      ))}
    </div>
  );
}

function OutgoingHandoverCard({ entry, onRefetch }) {
  const fileRef = useRef(null);
  const [uploadItemId, setUploadItemId] = useState(null);
  const [notes, setNotes] = useState({});

  const { handover, items = [], attachments = [] } = entry;
  const handoverId = handover.id;

  const updateMutation = useMutation({
    mutationFn: ({ itemId, body }) => api.put(`/handover/${handoverId}/items/${itemId}`, body),
    onSuccess: () => onRefetch(),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/handover/${handoverId}/submit`),
    onSuccess: () => { onRefetch(); toast.success('Handover submitted for review!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, itemId }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (itemId) fd.append('handover_item_id', itemId);
      return api.post(`/handover/${handoverId}/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => { onRefetch(); toast.success('File uploaded'); setUploadItemId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Upload failed'),
  });

  const saveNotes = (itemId) => {
    const text = notes[itemId] ?? items.find(i => i.id === itemId)?.outgoing_notes ?? '';
    updateMutation.mutate({
      itemId,
      body: { outgoing_notes: text, status: text.trim() ? 'done' : 'in_progress' },
    });
  };

  const markNA = (itemId) => {
    updateMutation.mutate({ itemId, body: { status: 'not_applicable', outgoing_notes: notes[itemId] || 'N/A' } });
  };

  const pct = handover.completion_pct || 0;
  const isSubmitted = ['pending_review', 'completed', 'waived'].includes(handover.status);
  const label = handover.handover_label || 'Handover';
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-5 rounded-2xl p-5" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-base font-bold text-white">{label}</h2>
            <p className="text-xs text-slate-400 mt-1">
              Successor: {handover.successor_name || 'Pending assignment by HR'}
              {handover.leave_start && (
                <> · Leave: {handover.leave_start} → {handover.leave_end}</>
              )}
              {!handover.leave_start && handover.effective_date && (
                <> · Effective: {handover.effective_date}</>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-indigo-400">{pct}%</p>
            <p className="text-xs text-slate-500 capitalize">{handover.status?.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="px-5 py-3 border-b border-white/5">
            <h3 className="text-sm font-bold text-white">{CAT_LABELS[cat] || cat}</h3>
          </div>
          <div className="divide-y divide-white/5">
            {catItems.map(item => {
              const done = item.status === 'done' || item.status === 'not_applicable';
              const val = notes[item.id] ?? item.outgoing_notes ?? '';
              return (
                <div key={item.id} className="p-5">
                  <div className="flex items-start gap-2 mb-2">
                    {item.is_required !== false && <span className="text-rose-400 text-sm">*</span>}
                    <p className={`text-sm font-semibold flex-1 ${done ? 'text-emerald-400' : 'text-white'}`}>{item.title}</p>
                    <span className="text-xs text-slate-500">{item.status}</span>
                  </div>
                  {!isSubmitted && (
                    <>
                      <textarea
                        value={val}
                        onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                        placeholder="Describe what the successor needs to know..."
                        rows={3}
                        className="w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-indigo-500 resize-none"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          onClick={() => saveNotes(item.id)}
                          disabled={updateMutation.isPending}
                          className="text-xs font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                        >
                          Save
                        </button>
                        {!item.is_required && (
                          <button
                            onClick={() => markNA(item.id)}
                            className="text-xs font-bold px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                          >
                            N/A
                          </button>
                        )}
                        {cat === 'documents' && (
                          <button
                            onClick={() => { setUploadItemId(item.id); fileRef.current?.click(); }}
                            className="text-xs font-bold px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg"
                          >
                            Upload file
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  {isSubmitted && item.outgoing_notes && (
                    <p className="text-xs text-slate-400 whitespace-pre-wrap">{item.outgoing_notes}</p>
                  )}
                  {item.evidence_url && (
                    <a href={item.evidence_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline mt-1 inline-block">
                      View attachment
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && uploadItemId) uploadMutation.mutate({ file, itemId: uploadItemId });
          e.target.value = '';
        }}
      />

      {!isSubmitted && (
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Submitting...' : 'Submit Handover for Review'}
        </button>
      )}

      {handover.status === 'completed' && (
        <div className="rounded-xl p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center font-semibold">
          Handover approved by management
        </div>
      )}

      {attachments?.length > 0 && (
        <p className="text-xs text-slate-500">{attachments.length} attachment(s) on file</p>
      )}
    </div>
  );
}

export default function HandoverOutgoing() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['handover-outgoing'],
    queryFn: () => api.get('/handover/portal/outgoing').then(r => r.data),
    enabled: tab === 'active',
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['handover-outgoing-history'],
    queryFn: () => api.get('/handover/portal/history/outgoing').then(r => r.data),
    enabled: tab === 'past',
  });

  const loading = tab === 'active' ? isLoading : historyLoading;

  if (loading) {
    return <Layout title="My Handover"><div className="p-10 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div></Layout>;
  }

  const activeHandovers = data?.handovers?.length
    ? data.handovers
    : (data?.handover ? [{ handover: data.handover, items: data.items || [], attachments: data.attachments || [] }] : []);

  const pastHandovers = historyData?.handovers || [];

  const showEmpty = tab === 'active' ? !activeHandovers.length : !pastHandovers.length;

  return (
    <Layout title="My Handovers" subtitle={tab === 'active' ? 'Complete your active handover checklists' : 'Past completed or waived handovers'}>
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        <button onClick={() => navigate('/portal')} className="text-sm text-slate-400 hover:text-white">← Back to Portal</button>
        <TabBar tab={tab} setTab={setTab} />

        {showEmpty ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="text-5xl mb-4">{tab === 'active' ? '📋' : '📁'}</div>
            <h2 className="text-lg font-bold text-white mb-2">
              {tab === 'active' ? 'No Active Handover' : 'No Past Handovers'}
            </h2>
            <p className="text-slate-400 text-sm">
              {tab === 'active'
                ? 'You do not have an active handover checklist.'
                : 'Completed, waived, or cancelled handovers will appear here.'}
            </p>
          </div>
        ) : tab === 'active' ? (
          activeHandovers.map(entry => (
            <OutgoingHandoverCard key={entry.handover.id} entry={entry} onRefetch={refetch} />
          ))
        ) : (
          pastHandovers.map(entry => (
            <HandoverHistoryCard key={entry.handover.id} entry={entry} role="outgoing" />
          ))
        )}
      </div>
    </Layout>
  );
}
