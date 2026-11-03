import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';

export default function Announcements() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', content: '', priority: 'Medium', target_role: 'All', is_pinned: false, expiry_date: '' });
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // active, past

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['boss-announcements'],
    queryFn: () => api.get('/portal').then(r => r.data.ann_list)
  });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/boss/announcements', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['boss-announcements']});
      toast.success('Announcement Posted');
      setShowModal(false);
      setForm({ title: '', content: '', priority: 'Medium', target_role: 'All', is_pinned: false, expiry_date: '' });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to post')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/boss/announcements/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['boss-announcements']}); toast.success('Deleted'); setDeleteTarget(null); },
  });

  const publishMutation = useMutation({
    mutationFn: (id) => api.put(`/boss/announcements/${id}/publish`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['boss-announcements']}); toast.success('Published to All'); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    addMutation.mutate(form);
  };

  return (
    <Layout title="Announcements" subtitle="Manage company-wide communications">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'active' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'past' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Past Records
          </button>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-lg shadow-indigo-500/20">
          + New Announcement
        </button>
      </div>

      <div className="space-y-4">
        {isLoading ? <div className="text-center text-slate-400 py-8">Loading...</div> : (
          announcements?.filter(a => {
            const today = new Date().toISOString().split('T')[0];
            const isPast = a.expiry_date && a.expiry_date < today;
            return activeTab === 'active' ? !isPast : isPast;
          }).map(a => (
            <div key={a.id} className="p-6 rounded-2xl border border-white/5 bg-surface-800 relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {a.title}
                    {a.is_pinned && <span className="text-amber-400 text-xs"><Icon name="pin" size={17}/> Pinned</span>}
                    {a.priority === 'High' && <span className="bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded text-[10px] uppercase font-bold">Urgent</span>}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1 flex gap-3">
                    <span>Target: <strong className="text-slate-300">{a.target_role}</strong></span>
                    <span>Date: {a.created_at?.slice(0, 10)}</span>
                    {a.expiry_date && <span>Expires: {a.expiry_date}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.target_role === 'Pending HR Review' && (
                    <button onClick={() => publishMutation.mutate(a.id)} className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg font-semibold transition-colors">
                      Publish to All
                    </button>
                  )}
                  <button onClick={() => setDeleteTarget(a)} className="text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg font-semibold transition-colors">
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{a.content}</p>
            </div>
          ))
        )}
        {announcements?.length === 0 && <div className="text-center text-slate-500 py-8 border border-white/5 rounded-2xl border-dashed">No announcements found.</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface-850 border border-white/10 rounded-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Post Announcement</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="form-label">Title *</label><input required className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
              <div><label className="form-label">Content *</label><textarea required className="form-input" rows="4" value={form.content} onChange={e => setForm({...form, content: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Target Audience</label>
                  <select className="form-input" value={form.target_role} onChange={e => setForm({...form, target_role: e.target.value})}>
                    <option value="All">All Employees</option>
                    <option value="hr_manager">HR Only</option>
                    <option value="finance">Finance Only</option>
                    <option value="Pending HR Review">Draft (HR Review)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Priority</label>
                  <select className="form-input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High (Urgent)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Expiry Date *</label>
                  <input type="date" required className="form-input" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="pinned" checked={form.is_pinned} onChange={e => setForm({...form, is_pinned: e.target.checked})} className="rounded bg-black/20 border-white/10 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0" />
                <label htmlFor="pinned" className="text-sm text-slate-300">Pin to top</label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={addMutation.isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold">Post Announcement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.title}
      />
    </Layout>
  );
}
