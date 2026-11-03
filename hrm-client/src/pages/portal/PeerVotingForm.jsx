import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function PeerVotingForm() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    nominee_id: '',
    attendance: 3,
    punctuality: 3,
    sops: 3,
    peer: 3,
    initiative: 3,
    comment: ''
  });

  const { data: colleagues, isLoading } = useQuery({ 
    queryKey: ['colleagues'], 
    queryFn: () => api.get('/peer-voting/colleagues').then(r => r.data?.employees || [])
  });

  const voteMutation = useMutation({
    mutationFn: (body) => api.post('/peer-voting/submit', body),
    onSuccess: () => {
      toast.success(t('hrm.peervoting.toast.success'));
      navigate('/portal');
    },
    onError: (err) => toast.error(err.response?.data?.error || t('hrm.peervoting.toast.error'))
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    voteMutation.mutate(formData);
  };

  const Slider = ({ label, name }) => (
    <div className="mb-6">
      <div className="flex justify-between mb-2">
        <label className="pv-slider-label text-sm font-semibold text-white">{label}</label>
        <span className="pv-slider-val text-indigo-400 font-bold">{formData[name]} / 5</span>
      </div>
      <input 
        type="range" min="1" max="5" step="1" 
        value={formData[name]}
        onChange={e => setFormData({ ...formData, [name]: parseInt(e.target.value) })}
        className="pv-slider w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
      />
      <div className="pv-slider-meta flex justify-between text-xs text-slate-500 mt-1">
        <span>{t('hrm.peervoting.form.needsImprovement')}</span>
        <span>{t('hrm.peervoting.form.excellent')}</span>
      </div>
    </div>
  );

  return (
    <Layout title={t('hrm.peervoting.form.title')} subtitle={t('hrm.peervoting.form.subtitle')}>
      <div className="pv-form-wrapper max-w-2xl mx-auto rounded-2xl p-6 md:p-8" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <form onSubmit={handleSubmit}>
          
          <div className="mb-8">
            <label className="pv-label form-label">{t('hrm.peervoting.form.selectColleague')}</label>
            <select 
              required
              value={formData.nominee_id}
              onChange={e => setFormData({ ...formData, nominee_id: e.target.value })}
              className="pv-input form-input"
            >
              <option value="">{t('hrm.peervoting.form.chooseColleague')}</option>
              {!isLoading && colleagues?.filter(c => c.id !== user.employee_id).map(c => (
                <option key={c.id} value={c.id}>{c.Full_name} ({c.employee_id})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Slider label={t('hrm.peervoting.form.attendance')} name="attendance" />
            <Slider label={t('hrm.peervoting.form.punctuality')} name="punctuality" />
            <Slider label={t('hrm.peervoting.form.sops')} name="sops" />
            <Slider label={t('hrm.peervoting.form.peer')} name="peer" />
            <Slider label={t('hrm.peervoting.form.initiative')} name="initiative" />
          </div>

          <div className="mb-8">
            <label className="pv-label form-label">{t('hrm.peervoting.form.constructiveComments')}</label>
            <textarea 
              value={formData.comment}
              onChange={e => setFormData({ ...formData, comment: e.target.value })}
              rows="3" 
              className="pv-input form-input"
              placeholder={t('hrm.peervoting.form.commentsPlaceholder')}
            ></textarea>
          </div>

          <button 
            type="submit" 
            disabled={voteMutation.isLoading}
            className="pv-btn-submit w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
          >
            {voteMutation.isLoading ? t('hrm.peervoting.form.submitting') : t('hrm.peervoting.form.submitEvaluation')}
          </button>
        </form>
      </div>
    </Layout>
  );
}
