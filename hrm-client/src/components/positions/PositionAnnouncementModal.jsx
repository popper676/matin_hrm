import Icon from '../common/Icon';
import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';

export default function PositionAnnouncementModal({ position, connection, onClose }) {
  const [caption, setCaption] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/positions/${position.id}/generate-caption`).then(r => r.data),
    onSuccess: (data) => {
      setCaption(data.caption || '');
      toast.success('AI draft generated — review before publishing');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate caption'),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('caption', caption);
      if (imageFile) fd.append('image', imageFile);
      return api.post(`/positions/${position.id}/publish-facebook`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: (data) => {
      toast.success('Published to Facebook!');
      if (data.facebook_post_url) {
        toast('View on Facebook', { icon: '🔗', duration: 8000 });
      }
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to publish'),
  });

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setImageFile(file);
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const connOk = connection?.configured && connection?.healthStatus !== 'error';
  const providerLabel = connection?.provider === 'zernio' ? 'Zernio' : connection?.provider === 'graph_api' ? 'Facebook Graph API' : 'Not configured';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-white/10 shadow-2xl"
        style={{ background: '#161929' }}
      >
        <div className="p-5 border-b border-white/5 sticky top-0 z-10" style={{ background: '#161929' }}>
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Facebook hiring announcement</h2>
              <p className="text-sm text-slate-400 mt-0.5">{position.title} · {position.level}</p>
            </div>
            <button aria-label="close" onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none p-1"><Icon name="close" size={17}/></button>
          </div>
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs flex items-center gap-2 ${connOk ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-200 border border-amber-500/30'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span><strong>{providerLabel}</strong> — {connection?.message || 'Checking connection…'}</span>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Post text</label>
              <button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {generateMutation.isPending ? 'Generating…' : '✨ Generate with AI'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={10}
              placeholder="Write your hiring announcement in Burmese and English…"
              className="w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-indigo-500 resize-y min-h-[180px]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Announcement image</label>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-8 rounded-xl border-2 border-dashed border-white/10 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-300 text-sm transition-colors"
                >
                  {imageFile ? `Selected: ${imageFile.name}` : '📷 Upload image (recommended for Zernio)'}
                </button>
                {connection?.provider === 'graph_api' && (
                  <p className="text-[10px] text-amber-400/80 mt-1">Graph API mode: text-only posts. Configure Zernio for images.</p>
                )}
              </div>
              {imagePreview && (
                <div className="w-full sm:w-40 flex-shrink-0">
                  <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-xl border border-white/10" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="text-[10px] text-rose-400 mt-1 hover:underline"
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl p-4 border border-white/5 bg-white/[0.02]">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Preview</p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{caption || 'Your announcement text will appear here…'}</p>
            {imagePreview && (
              <img src={imagePreview} alt="" className="mt-3 rounded-lg max-h-48 object-contain border border-white/5" />
            )}
          </div>
        </div>

        <div className="p-5 border-t border-white/5 flex flex-wrap gap-3 justify-end sticky bottom-0" style={{ background: '#161929' }}>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-400 hover:text-white rounded-xl">
            Cancel
          </button>
          <button
            onClick={() => publishMutation.mutate()}
            disabled={!caption.trim() || publishMutation.isPending || !connection?.configured}
            className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl flex items-center gap-2"
          >
            {publishMutation.isPending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            )}
            Publish to Facebook
          </button>
        </div>
      </div>
    </div>
  );
}
