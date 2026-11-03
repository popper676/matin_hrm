import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function BossDashboard() {
  const [selectedReq, setSelectedReq] = useState(null);
  const [signatureText, setSignatureText] = useState('Executive Signed & Approved');
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const qc = useQueryClient();

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['boss-overview'],
    queryFn: () => api.get('/boss/overview').then(r => r.data)
  });

  const { data: docsData, isLoading: loadingDocs } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get('/documents').then(r => r.data)
  });

  const bossSignMutation = useMutation({
    mutationFn: ({ id, action, boss_signature, rejection_reason }) =>
      api.post(`/documents/boss-sign/${id}`, { action, boss_signature, rejection_reason }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({queryKey:['documents']});
      setSelectedReq(null);
      setRejectReason('');
      setIsRejecting(false);
      if (variables.action === 'REJECT') {
        toast.error('Document request rejected');
      } else {
        toast.success('Document signed & approved! Sent to HR for final seal.');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to process signature');
    }
  });

  const summary = overview?.summary || {};
  const requests = docsData?.requests || [];
  const pendingRequests = requests.filter(r => r.status === 'PENDING_BOSS');

  const handleSignSubmit = (e) => {
    e.preventDefault();
    if (!selectedReq) return;

    if (isRejecting) {
      bossSignMutation.mutate({
        id: selectedReq.id,
        action: 'REJECT',
        rejection_reason: rejectReason || 'Rejected by Executive'
      });
    } else {
      bossSignMutation.mutate({
        id: selectedReq.id,
        action: 'APPROVE',
        boss_signature: signatureText || 'Executive Approved'
      });
    }
  };

  return (
    <Layout title="Executive Overview" subtitle="High-level insights & document approval center">
      {/* ── Summary Stats ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {[
          { label: 'Total Employees', value: summary.total_employees, color: 'indigo', icon: 'staff' },
          { label: 'Total Payroll', value: `$${(summary.total_payroll || 0).toLocaleString()}`, color: 'emerald', icon: 'payroll' },
          { label: 'Open Positions', value: summary.open_positions, color: 'amber', icon: 'positions' },
          { label: 'Pending Doc Approvals', value: pendingRequests.length, color: 'rose', icon: 'pending' },
        ].map(s => (
          <div key={s.label} className="portal-stat-card uyf-portal-stat" data-tone={s.color} style={{ background: 'var(--bg-800, #1e2235)', border: `1px solid rgba(255,255,255,0.08)` }}>
            <span className="uyf-icon-tile mb-3"><Icon name={s.icon} size={23}/></span>
            <p className="portal-stat-num uyf-portal-stat-value">{loadingOverview ? '...' : s.value}</p>
            <p className="uyf-portal-stat-label">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Pending Document Approvals Queue ────────────────────── */}
      <div className="mb-6 rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h3 className="text-base font-bold text-white">Pending Official Document Approvals</h3>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {pendingRequests.length} Request{pendingRequests.length !== 1 ? 's' : ''} Pending
          </span>
        </div>

        {loadingDocs ? (
          <div className="h-32 bg-white/5 animate-pulse rounded-xl" />
        ) : pendingRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingRequests.map(req => (
              <div key={req.id} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 block w-fit mb-1">
                      {req.doc_type || req.category}
                    </span>
                    <h4 className="text-sm font-bold text-white line-clamp-1">{req.title}</h4>
                    <p className="text-xs text-slate-400">Target: <strong className="text-slate-200">{req.employee_name}</strong></p>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono font-semibold">PENDING SIGN</span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{req.description || 'No description notes provided by HR.'}</p>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono">Date: {req.effective_date || 'N/A'}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedReq(req); setIsRejecting(false); }}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    <span>Review & E-Sign</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-white/5 rounded-xl border border-white/5">
            <svg className="w-10 h-10 text-emerald-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p className="text-sm font-bold text-slate-300">All document requests cleared!</p>
            <p className="text-xs text-slate-500">There are no pending official letters waiting for executive signature.</p>
          </div>
        )}
      </div>

      {/* ── Secondary Widgets ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-6 flex flex-col items-center justify-center text-center" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)', minHeight: '260px' }}>
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-2xl mb-3 border border-indigo-500/30">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">AI Executive Copilot</h3>
          <p className="text-slate-400 text-xs mb-4 max-w-sm">Query HR metrics, generate staff evaluation summaries, or analyze department productivity.</p>
          <Link to="/boss/chat" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors">
            Open Copilot Chat
          </Link>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)', minHeight: '260px' }}>
          <h3 className="text-base font-bold text-white mb-3">Quick Actions</h3>
          <div className="space-y-3">
            <Link to="/documents" className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between group transition-all">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                <span className="text-xs font-bold text-white">Full Document Vault & Folders</span>
              </div>
              <span className="text-xs text-indigo-400 group-hover:translate-x-1 transition-transform">Browse →</span>
            </Link>

            <Link to="/boss/kpi" className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between group transition-all">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                <span className="text-xs font-bold text-white">Performance & KPI Settings</span>
              </div>
              <span className="text-xs text-emerald-400 group-hover:translate-x-1 transition-transform">Configure →</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── E-SIGNATURE APPROVAL MODAL ──────────────────────────── */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setSelectedReq(null)} />
          <div className="relative rounded-2xl w-full max-w-lg p-6 overflow-hidden" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Executive Digital Signature</h2>
                <p className="text-xs text-slate-400">Review document details and apply your official E-Signature</p>
              </div>
              <button type="button" onClick={() => setSelectedReq(null)} className="text-slate-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleSignSubmit} className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <div><span className="text-slate-500">Document Title:</span> <strong className="text-white font-bold block text-sm">{selectedReq.title}</strong></div>
                <div><span className="text-slate-500">Target Employee:</span> <span className="text-amber-400 font-semibold">{selectedReq.employee_name}</span></div>
                <div><span className="text-slate-500">Document Type:</span> <span className="text-indigo-400 font-semibold">{selectedReq.doc_type || selectedReq.category}</span></div>
                <div><span className="text-slate-500">Effective Date:</span> <span className="text-slate-300 font-mono">{selectedReq.effective_date || 'N/A'}</span></div>
                {selectedReq.description && (
                  <div className="pt-2 border-t border-white/5 text-slate-300 italic">{selectedReq.description}</div>
                )}
                {selectedReq.file_url && (
                  <div className="pt-2 border-t border-white/5">
                    <a href={selectedReq.file_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-bold flex items-center gap-1">
                      <span>View Soft Copy Attachment</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    </a>
                  </div>
                )}
              </div>

              {!isRejecting ? (
                <div>
                  <label className="form-label text-xs">Executive E-Signature / Seal Text *</label>
                  <input
                    type="text"
                    required
                    value={signatureText}
                    onChange={e => setSignatureText(e.target.value)}
                    placeholder="e.g. Executive Approved & Signed - Managing Director"
                    className="form-input text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="form-label text-xs text-rose-400">Rejection Reason *</label>
                  <textarea
                    required
                    rows="3"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Provide reason for rejection to HR..."
                    className="form-input text-sm"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {!isRejecting ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRejecting(true)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                    >
                      Reject Request
                    </button>
                    <button
                      type="submit"
                      disabled={bossSignMutation.isLoading}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                    >
                      {bossSignMutation.isLoading ? 'Signing...' : 'Approve & E-Sign'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-white/5 transition-colors"
                    >
                      Back to Sign
                    </button>
                    <button
                      type="submit"
                      disabled={bossSignMutation.isLoading}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all shadow-lg shadow-rose-600/20"
                    >
                      {bossSignMutation.isLoading ? 'Processing...' : 'Confirm Rejection'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

