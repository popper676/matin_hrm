import ExpenseWorkspace from '../../components/expense/ExpenseForm';
import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../api/client';
import Layout from '../../components/layout/Layout';
import toast from 'react-hot-toast';

export default function RewardsMgmt() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' or 'reject'
  const [actionForm, setActionForm] = useState({ amount: '', remarks: '' });
  const [issueForm, setIssueForm] = useState({ employee_id: '', claim_type: 'Spot Bonus (Google Review)', custom_type: '', amount: '', description: '' });
  const [viewingImage, setViewingImage] = useState(null);

  const CLAIM_TYPES = [
    'Spot Bonus (Google Review)',
    'Emergency Call-out',
    'Performance Reward',
    'Other'
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['rewards'],
    queryFn: async () => {
      const res = await api.get('/rewards');
      return res.data;
    }
  });

  const rewards = (data?.rewards || []).filter(r=>r.form_version!==2);
  const employees = data?.employees || [];

  const pendingClaims = rewards.filter(r => r.status === 'PENDING');
  const historyClaims = rewards.filter(r => r.status !== 'PENDING');

  const issueMutation = useMutation({
    mutationFn: (payload) => api.post('/rewards/issue', payload),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['rewards']});
      setShowIssueModal(false);
      toast.success('Bonus issued successfully!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to issue bonus')
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, type, payload }) => type === 'approve' ? api.put(`/rewards/${id}/approve`, payload) : api.put(`/rewards/${id}/reject`, payload),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['rewards']});
      setActionTarget(null);
      toast.success(`Claim ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Action failed')
  });

  const handleIssueSubmit = (e) => {
    e.preventDefault();
    if (!issueForm.employee_id || !issueForm.amount) return toast.error('Please fill required fields');
    issueMutation.mutate(issueForm);
  };

  const handleActionSubmit = (e) => {
    e.preventDefault();
    actionMutation.mutate({
      id: actionTarget.id,
      type: actionType,
      payload: {
        approved_amount: actionForm.amount,
        admin_remarks: actionForm.remarks
      }
    });
  };

  const openActionModal = (req, type) => {
    setActionTarget(req);
    setActionType(type);
    setActionForm({
      amount: req.requested_amount,
      remarks: ''
    });
  };

  return (
    <Layout title={t('hrm.rewards.title') || 'Rewards & Claims'} subtitle="Manage employee spot bonuses, emergency allowances, and expense claims">

      <ExpenseWorkspace records={data?.rewards || []} canSubmit={false} />

      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>{t('hrm.rewards.pending') || 'Pending Claims'}</span>
            {pendingClaims.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-black/20 text-[10px]">{pendingClaims.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>{t('hrm.rewards.history') || 'History'}</span>
          </button>
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          <span>{t('hrm.rewards.issueBonus') || 'Issue Bonus'}</span>
        </button>
      </div>

      {/* ── Lists ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-white/5 animate-pulse" />)
        ) : (
          (activeTab === 'pending' ? pendingClaims : historyClaims).length > 0 ? (
            (activeTab === 'pending' ? pendingClaims : historyClaims).map(req => (
              <div key={req.id} className="rounded-2xl p-5 border border-white/10 bg-surface-800 hover:shadow-xl transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {req.claim_type === 'Other' ? req.custom_type : req.claim_type}
                    </span>
                    {req.status === 'PENDING' && <span className="text-xs font-bold text-amber-400"><Icon name="pending" size={17}/> Pending</span>}
                    {req.status === 'APPROVED' && <span className="text-xs font-bold text-emerald-400"><Icon name="active" size={17}/> Approved</span>}
                    {req.status === 'REJECTED' && <span className="text-xs font-bold text-rose-400"><Icon name="close" size={17}/> Rejected</span>}
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">{req.employee_name}</h4>

                  <div className="text-2xl font-black text-white mb-2">
                    {req.status === 'PENDING' ? req.requested_amount : req.approved_amount} <span className="text-xs text-slate-400 font-medium">THB/MMK</span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
                    {req.description || 'No description provided.'}
                  </p>

                  {req.proof_image_url && (
                    <button onClick={() => setViewingImage(req.proof_image_url)} className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 px-3 py-1.5 rounded-lg mb-3">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      View Proof Image
                    </button>
                  )}

                  {req.admin_remarks && (
                    <div className="p-2.5 rounded-lg bg-black/20 text-xs text-slate-400 border border-white/5 mb-3">
                      <strong className="text-slate-300 block mb-0.5">Admin Remark:</strong>
                      {req.admin_remarks}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono">{(req.created_at || '').split('T')[0]}</span>
                  {req.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => openActionModal(req, 'reject')} className="px-3 py-1.5 rounded-lg font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20">Reject</button>
                      <button onClick={() => openActionModal(req, 'approve')} className="px-3 py-1.5 rounded-lg font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20">Approve</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full p-16 text-center bg-white/5 rounded-2xl border border-white/5">
              <span className="text-slate-400 text-sm font-medium">No records found.</span>
            </div>
          )
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}

      {/* Issue Bonus Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setShowIssueModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl p-6 bg-surface-800 border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4">{t('hrm.rewards.issueBonus') || 'Issue Bonus Directly'}</h2>
            <form onSubmit={handleIssueSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Target Employee *</label>
                <select
                  className="form-input focus:border-emerald-500"
                  value={issueForm.employee_id} onChange={e => setIssueForm({...issueForm, employee_id: e.target.value})} required
                >
                  <option className="bg-surface-800 text-white" value="">Select Employee...</option>
                  {employees.map(e => <option className="bg-surface-800 text-white" key={e.id} value={e.id}>{e.Full_name} ({e.employee_id})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Reward Type *</label>
                <select
                  className="form-input focus:border-emerald-500"
                  value={issueForm.claim_type} onChange={e => setIssueForm({...issueForm, claim_type: e.target.value})}
                >
                  {CLAIM_TYPES.map(c => <option className="bg-surface-800 text-white" key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {issueForm.claim_type === 'Other' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Specify Type *</label>
                  <input type="text" required className="form-input focus:border-emerald-500" value={issueForm.custom_type} onChange={e => setIssueForm({...issueForm, custom_type: e.target.value})} />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Amount *</label>
                <input type="number" step="0.01" required className="form-input focus:border-emerald-500" value={issueForm.amount} onChange={e => setIssueForm({...issueForm, amount: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Description / Reason</label>
                <textarea rows="2" className="form-input focus:border-emerald-500" value={issueForm.description} onChange={e => setIssueForm({...issueForm, description: e.target.value})} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowIssueModal(false)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-400 bg-white/5 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={issueMutation.isLoading} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20">{issueMutation.isLoading ? 'Issuing...' : 'Issue Bonus'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modal (Approve/Reject) */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setActionTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 bg-surface-800 border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4 capitalize">{actionType} Claim</h2>
            <form onSubmit={handleActionSubmit} className="space-y-4">

              {actionType === 'approve' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Approved Amount (Adjust if needed)</label>
                  <input type="number" step="0.01" required className="form-input focus:border-emerald-500" value={actionForm.amount} onChange={e => setActionForm({...actionForm, amount: e.target.value})} />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Admin Remarks (Optional)</label>
                <textarea rows="2" placeholder="Note for the employee..." className="form-input focus:border-emerald-500" value={actionForm.remarks} onChange={e => setActionForm({...actionForm, remarks: e.target.value})} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setActionTarget(null)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-400 bg-white/5 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={actionMutation.isLoading} className={`flex-1 py-2.5 rounded-xl font-bold text-white shadow-lg ${actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'}`}>
                  {actionMutation.isLoading ? 'Saving...' : `Confirm ${actionType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setViewingImage(null)} />
          <div className="relative max-w-4xl max-h-screen p-2">
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full transition-all"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <img src={viewingImage} alt="Proof Evidence" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </Layout>
  );
}
