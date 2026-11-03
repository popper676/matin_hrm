import {Link} from 'react-router-dom';
import EmployeeInformation from '../../components/employee/EmployeeInformation';
import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Layout from '../../components/layout/Layout';

export default function MyProfile() {
  const { data, isLoading } = useQuery({ 
    queryKey: ['portal_data'], 
    queryFn: () => api.get('/portal').then(r => r.data) 
  });

  const emp = data?.emp || {};

  const [pwdData, setPwdData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

  const pwdMutation = useMutation({
    mutationFn: (body) => api.post('/auth/change-password', body),
    onSuccess: () => {
      toast.success('Password updated successfully!');
      setPwdData({ oldPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to update password');
    }
  });

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (pwdData.newPassword !== pwdData.confirmPassword) {
      return toast.error('New passwords do not match');
    }
    pwdMutation.mutate({ oldPassword: pwdData.oldPassword, newPassword: pwdData.newPassword });
  };

  return (
    <Layout title="My Profile" subtitle="Your corporate identity and details">
      <Link className="ux-button ux-button-secondary" style={{marginBottom:20}} to="/portal/profile/360">My Employee 360 ↗</Link>
      {isLoading ? (
        <div className="flex justify-center p-20"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Identity Card */}
          <div className="md:col-span-1 rounded-2xl p-8 flex flex-col items-center text-center shadow-sm" style={{ background: 'var(--bg-850, #161929)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-4xl font-bold text-white mb-4 shadow-xl border-4 border-[#121421] portal-avatar-ring">
              {(emp.Full_name || 'U')[0]}
            </div>
            <h2 className="text-xl font-bold text-white mb-1">{emp.Full_name || 'Unknown Employee'}</h2>
            <p className="text-sm text-indigo-400 font-mono mb-6">{emp.employee_id || 'N/A'}</p>
            
            <div className="w-full space-y-3">
              <div className="bg-surface-800 p-3 rounded-xl border border-white/5" style={{ borderColor: 'var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Department</p>
                <p className="text-sm text-white font-medium">{emp.dept_name || '—'}</p>
              </div>
              <div className="bg-surface-800 p-3 rounded-xl border border-white/5" style={{ borderColor: 'var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Position</p>
                <p className="text-sm text-white font-medium">{emp.pos_title || '—'}</p>
              </div>
            </div>
          </div>

          {/* Details Card */}
          <div className="md:col-span-2 rounded-2xl p-8 shadow-sm" style={{ background: 'var(--bg-850, #161929)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2"><span><Icon name="users" size={17}/></span> Personal Information</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Email Address</p>
                <p className="text-sm text-slate-300">{emp.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Phone Number</p>
                <p className="text-sm text-slate-300">{emp.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Date of Birth</p>
                <p className="text-sm text-slate-300 font-mono">{emp.date_of_birth || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Gender</p>
                <p className="text-sm text-slate-300">{emp.gender || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Home Address</p>
                <p className="text-sm text-slate-300 leading-relaxed">{emp.address || '—'}</p>
              </div>
            </div>

            <hr className="my-8 border-white/5" />

            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2"><span><Icon name="departments" size={17}/></span> Employment Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Date of Joining</p>
                <p className="text-sm text-slate-300 font-mono">{emp.hire_date || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5">Employment Status</p>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${emp.status === 'Active' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' : 'text-slate-400 bg-slate-400/10 border-slate-500/20'}`}>
                  {emp.status || 'Unknown'}
                </span>
              </div>
            </div>

          </div>
        </div>

        <EmployeeInformation />

        {/* Security / Password Change */}
        <div className="rounded-2xl p-8 shadow-sm" style={{ background: 'var(--bg-850, #161929)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
          <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2"><span><Icon name="lock" size={17}/></span> Security Settings</h3>
          <form onSubmit={handlePasswordChange} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Current Password</label>
              <input type="password" required className="form-input" value={pwdData.oldPassword} onChange={e => setPwdData({...pwdData, oldPassword: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">New Password</label>
              <input type="password" required className="form-input" value={pwdData.newPassword} onChange={e => setPwdData({...pwdData, newPassword: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Confirm New Password</label>
              <input type="password" required className="form-input" value={pwdData.confirmPassword} onChange={e => setPwdData({...pwdData, confirmPassword: e.target.value})} />
            </div>
            <div className="md:col-span-3 flex justify-end mt-2">
              <button type="submit" disabled={pwdMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl text-sm transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                {pwdMutation.isPending ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

      </div>
      )}
    </Layout>
  );
}
