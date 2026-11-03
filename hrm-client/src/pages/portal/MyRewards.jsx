import ExpenseWorkspace from '../../components/expense/ExpenseForm';
import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../api/client';
import Layout from '../../components/layout/Layout';
import toast from 'react-hot-toast';

export default function MyRewards() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [formData, setFormData] = useState({ claim_type: 'Spot Bonus (Google Review)', custom_type: '', requested_amount: '', description: '', proof_image_url: '', currency: '' });
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

  const requestMutation = useMutation({
    mutationFn: (payload) => api.post('/rewards', payload),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['rewards']});
      setShowRequestModal(false);
      setFormData({ claim_type: 'Spot Bonus (Google Review)', custom_type: '', requested_amount: '', description: '', proof_image_url: '', currency: '' });
      toast.success('Claim submitted successfully!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to submit claim')
  });

  // Simple file upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Create form data to upload to our general upload endpoint (if available) or convert to base64
    // Since we don't have a specific endpoint for proof images in the plan, we'll assume a base64 conversion for simplicity or use existing upload endpoint.
    // Assuming there is a generic upload endpoint /api/misc/upload or similar.
    // For now, let's use base64 if it's small, but actually the app might have an upload API.
    // Let's use a quick FileReader for base64 to ensure it works without a new backend route.
    if (file.size > 2 * 1024 * 1024) {
      return toast.error('Image must be less than 2MB');
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, proof_image_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.requested_amount) return toast.error('Amount is required');
    requestMutation.mutate(formData);
  };

  return (
    <Layout title={t('hrm.rewards.title') || 'My Rewards & Claims'} subtitle="Submit and track your spot bonuses and expense claims">

      <ExpenseWorkspace records={data?.rewards || []} />

      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
        <h2 className="text-base font-bold text-white">{t('hrm.rewards.history') || 'Claim History'}</h2>

        <button
          onClick={() => setShowRequestModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          <span>{t('hrm.rewards.requestBonus') || 'Request Bonus / Claim'}</span>
        </button>
      </div>

      {/* ── Lists ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-white/5 animate-pulse" />)
        ) : rewards.length > 0 ? (
          rewards.map(req => (
            <div key={req.id} className="rounded-2xl p-5 border border-white/10 bg-surface-800 hover:shadow-xl transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {req.claim_type === 'Other' ? req.custom_type : req.claim_type}
                  </span>
                  {req.status === 'PENDING' && <span className="text-xs font-bold text-amber-400"><Icon name="pending" size={17}/> Pending</span>}
                  {req.status === 'PAID' && <span className="text-xs text-emerald-500">Paid / ပေးချေပြီး</span>}
                  {req.status === 'APPROVED' && <span className="text-xs font-bold text-emerald-400"><Icon name="active" size={17}/> Approved</span>}
                  {req.status === 'REJECTED' && <span className="text-xs font-bold text-rose-400"><Icon name="close" size={17}/> Rejected</span>}
                </div>

                <div className="text-2xl font-black text-white mb-2">
                  {req.status === 'PENDING' ? req.requested_amount : req.approved_amount} <span className="text-xs text-slate-400 font-medium">{req.currency || "—"}</span>
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
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full p-16 text-center bg-white/5 rounded-2xl border border-white/5">
            <span className="text-slate-400 text-sm font-medium">No records found.</span>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setShowRequestModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl p-6 bg-surface-800 border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4">{t('hrm.rewards.requestBonus') || 'Submit a Claim'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
<label className="block text-sm">Currency / ငွေကြေး<select className="w-full rounded-lg border p-3 bg-transparent" value={formData.currency} required={formData.claim_type==='Expense Claim'} onChange={e=>setFormData({...formData,currency:e.target.value})}><option value="">Choose currency / ငွေကြေးရွေးပါ</option>{['THB','MMK','USD'].map(c=><option key={c}>{c}</option>)}</select></label>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">{t('hrm.rewards.claimType') || 'Claim Type'} *</label>
                <select
                  className="form-input focus:border-indigo-500"
                  value={formData.claim_type} onChange={e => setFormData({...formData, claim_type: e.target.value})}
                >
                  {CLAIM_TYPES.map(c => <option className="bg-surface-800 text-white" key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {formData.claim_type === 'Other' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Specify Type *</label>
                  <input type="text" required className="form-input focus:border-indigo-500" value={formData.custom_type} onChange={e => setFormData({...formData, custom_type: e.target.value})} />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">{t('hrm.rewards.amount') || 'Amount'} *</label>
                <input type="number" step="0.01" required className="form-input focus:border-indigo-500" value={formData.requested_amount} onChange={e => setFormData({...formData, requested_amount: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">{t('hrm.rewards.description') || 'Description / Reason'}</label>
                <textarea rows="2" className="form-input focus:border-indigo-500" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">{t('hrm.rewards.uploadProof') || 'Upload Proof Image'} (Optional)</label>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="form-input focus:border-indigo-500" />
                {formData.proof_image_url && (
                  <div className="mt-2 text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                    Image attached
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRequestModal(false)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-400 bg-white/5 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={requestMutation.isLoading} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20">{requestMutation.isLoading ? 'Submitting...' : (t('hrm.rewards.submit') || 'Submit Request')}</button>
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
