import Icon from '../../components/common/Icon';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useNavigate } from 'react-router-dom';

export default function ExitSurvey() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    reason_for_leaving: '',
    job_satisfaction: '3',
    management_rating: '3',
    recommend_company: 'Maybe',
    additional_comments: ''
  });

  const { data, isLoading } = useQuery({ 
    queryKey: ['exit-survey'], 
    queryFn: () => api.get('/exit-survey').then(r => r.data) 
  });

  useEffect(() => {
    if (data?.ei) {
      setFormData({
        reason_for_leaving: data.ei.reason_for_leaving || '',
        job_satisfaction: String(data.ei.job_satisfaction || '3'),
        management_rating: String(data.ei.management_rating || '3'),
        recommend_company: data.ei.recommend_company || 'Maybe',
        additional_comments: data.ei.additional_comments || ''
      });
    }
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: (body) => api.post('/exit-survey', body),
    onSuccess: () => {
      alert('Exit Survey submitted successfully!');
      navigate('/portal');
    },
    onError: (err) => alert(err.response?.data?.error || 'Failed to submit survey')
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  if (isLoading) return <Layout title="Exit Survey"><p className="text-white p-6">Loading...</p></Layout>;
  
  if (!data?.ob) {
    return (
      <Layout title="Exit Survey" subtitle="Your final feedback">
        <div className="max-w-2xl mx-auto rounded-2xl p-6 text-center" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-5xl mb-4"><Icon name="active" size={17}/></div>
          <h2 className="text-lg font-bold text-white mb-2">No Offboarding Record Found</h2>
          <p className="text-slate-400">You do not have an active offboarding record, so you don't need to fill out an exit survey.</p>
        </div>
      </Layout>
    );
  }

  const RadioGroup = ({ label, name, options }) => (
    <div className="mb-6">
      <label className="form-label">{label}</label>
      <div className="flex gap-4">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-white cursor-pointer">
            <input 
              type="radio" name={name} value={opt.value} 
              checked={formData[name] === String(opt.value)}
              onChange={e => setFormData({ ...formData, [name]: e.target.value })}
              className="accent-indigo-500"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Layout title="Exit Survey" subtitle="We value your feedback to improve our workplace">
      <div className="max-w-3xl mx-auto rounded-2xl p-6 md:p-8" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        
        {data.ei && (
          <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-sm">
            You have already submitted your exit survey. You can update your responses below if needed.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="form-label">Primary Reason for Leaving</label>
            <select 
              required
              value={formData.reason_for_leaving}
              onChange={e => setFormData({ ...formData, reason_for_leaving: e.target.value })}
              className="form-input"
            >
              <option value="">Select a reason...</option>
              <option value="Better Opportunity">Better Opportunity / Compensation</option>
              <option value="Career Change">Career Change</option>
              <option value="Management Issues">Management / Leadership Issues</option>
              <option value="Work Environment">Work Environment / Culture</option>
              <option value="Personal Reasons">Personal Reasons</option>
              <option value="Relocation">Relocation</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <RadioGroup 
            label="Overall Job Satisfaction (1 = Poor, 5 = Excellent)" 
            name="job_satisfaction" 
            options={[{value: '1', label: '1'}, {value: '2', label: '2'}, {value: '3', label: '3'}, {value: '4', label: '4'}, {value: '5', label: '5'}]} 
          />

          <RadioGroup 
            label="Rating of Management/Leadership (1 = Poor, 5 = Excellent)" 
            name="management_rating" 
            options={[{value: '1', label: '1'}, {value: '2', label: '2'}, {value: '3', label: '3'}, {value: '4', label: '4'}, {value: '5', label: '5'}]} 
          />

          <RadioGroup 
            label="Would you recommend working here to a friend?" 
            name="recommend_company" 
            options={[{value: 'Yes', label: 'Yes'}, {value: 'No', label: 'No'}, {value: 'Maybe', label: 'Maybe'}]} 
          />

          <div className="mb-8">
            <label className="form-label">Additional Comments or Feedback</label>
            <textarea 
              value={formData.additional_comments}
              onChange={e => setFormData({ ...formData, additional_comments: e.target.value })}
              rows="4" 
              className="form-input"
              placeholder="What could we have done better? What did you like best?"
            ></textarea>
          </div>

          <button 
            type="submit" 
            disabled={submitMutation.isLoading}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
          >
            {submitMutation.isLoading ? 'Submitting...' : 'Submit Exit Survey'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
