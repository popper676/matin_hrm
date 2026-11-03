import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';

export default function UserAccounts() {
  const qc = useQueryClient();
  const [showFormModal, setShowFormModal] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'employee', full_name: '', employee_id: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTargetId, setEditTargetId] = useState(null);
  const [resetTargetId, setResetTargetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: users, isLoading } = useQuery({ queryKey: ['sys-users'], queryFn: () => api.get('/boss/users').then(r => r.data.users) });
  const { data: employees } = useQuery({ queryKey: ['employees-active'], queryFn: () => api.get('/employees').then(r => r.data.employees.filter(e => e.status === 'Active')) });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/boss/users/add', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['sys-users']});
      toast.success('User account created');
      setForm({ username: '', password: '', role: 'employee', full_name: '', employee_id: '' });
      setShowFormModal(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create user')
  });

  const editMutation = useMutation({
    mutationFn: (body) => api.put(`/boss/users/${editTargetId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['sys-users']});
      toast.success('User account updated');
      setForm({ username: '', password: '', role: 'employee', full_name: '', employee_id: '' });
      setEditTargetId(null);
      setShowFormModal(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to update user')
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/boss/users/${id}/toggle`, { is_active }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['sys-users']}); toast.success('Status updated'); },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, new_password }) => api.put(`/boss/users/${id}/reset-password`, { new_password }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['sys-users']}); toast.success('Password reset'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/boss/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['sys-users']}); toast.success('User deleted'); setDeleteTarget(null); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editTargetId) {
      editMutation.mutate(form);
    } else {
      addMutation.mutate(form);
    }
  };

  const handleEdit = (u) => {
    setForm({
      username: u.username,
      password: '', // we don't edit password here
      role: u.role,
      full_name: u.full_name || '',
      employee_id: u.employee_id || ''
    });
    setEditTargetId(u.id);
    setShowFormModal(true);
  };

  const handleCancelEdit = () => {
    setForm({ username: '', password: '', role: 'employee', full_name: '', employee_id: '' });
    setEditTargetId(null);
    setShowFormModal(false);
  };

  const handleResetClick = (id) => {
    setResetTargetId(id);
    setNewPassword('');
  };

  const handleConfirmReset = (e) => {
    e.preventDefault();
    if (newPassword.trim()) {
      resetMutation.mutate({ id: resetTargetId, new_password: newPassword.trim() });
      setResetTargetId(null);
    }
  };

  const roleEmoji = { boss: 'Boss', manager: 'Manager', hr_manager: 'HR Manager', finance: 'Finance', admin: 'Admin', employee: 'Employee' };

  const filteredUsers = (users || []).filter(u =>
    (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const groupedUsers = filteredUsers.reduce((acc, u) => {
    let groupKey = u.role;

    if (u.role === 'employee') {
      if (u.employee_id && employees) {
        const empRecord = employees.find(e => e.id === u.employee_id);
        if (empRecord && empRecord.dept_name && empRecord.dept_name !== '—') {
          groupKey = `employee_${empRecord.dept_name}`;
        } else {
          groupKey = 'employee_unassigned';
        }
      } else {
        groupKey = 'employee_unassigned';
      }
    }

    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(u);
    return acc;
  }, {});

  const roleOrder = ['boss', 'admin', 'manager', 'hr_manager', 'finance'];
  const sortedRoles = Object.keys(groupedUsers).sort((a, b) => {
    let ia = roleOrder.indexOf(a);
    let ib = roleOrder.indexOf(b);

    // Both standard roles
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;

    // Both employee sub-groups
    if (a === 'employee_unassigned') return 1;
    if (b === 'employee_unassigned') return -1;
    return a.localeCompare(b);
  });

  const getGroupTitle = (key) => {
    if (key.startsWith('employee_')) {
      const dept = key.replace('employee_', '');
      if (dept === 'unassigned') return '👤 Employee (No Department)';
      return `👤 Employee - ${dept}`;
    }
    return roleEmoji[key] || key;
  };

  return (
    <Layout title="User Accounts 🔓" subtitle="Manage system access — create accounts, assign roles, reset passwords">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <span className="text-sm text-slate-400 whitespace-nowrap">{users?.length || 0} Users</span>
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 bg-surface-800 text-slate-300 text-sm rounded-xl px-4 py-2 border border-white/5 outline-none focus:border-indigo-500"
          />
        </div>
        <button onClick={() => { handleCancelEdit(); setShowFormModal(true); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl whitespace-nowrap shadow-lg shadow-indigo-600/20">
          + New Account
        </button>
      </div>

      <div className="space-y-8">
        {isLoading ? (
            <div className="py-20 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
        ) : sortedRoles.length > 0 ? (
          sortedRoles.map(role => (
            <div key={role}>
              <h2 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                {getGroupTitle(role)}
                <span className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">{groupedUsers[role].length}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {groupedUsers[role].map(u => (
                  <div key={u.id} className={`p-5 rounded-2xl border transition-colors flex flex-col justify-between h-full ${!u.is_active ? 'bg-surface-900/50 border-rose-500/20' : 'bg-surface-800 border-white/5 hover:border-indigo-500/30'}`}>

                    <div className="flex items-start gap-4 mb-6">
                      <div className={`w-12 h-12 rounded-full font-bold flex items-center justify-center text-xl shrink-0 ${!u.is_active ? 'bg-surface-950 border border-white/5 text-slate-500' : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'}`}>
                        {(u.full_name || u.username)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold truncate text-base ${!u.is_active ? 'text-slate-500 line-through' : 'text-white'}`}>{u.full_name || 'System User'}</h3>
                        </div>
                        <div className="text-slate-400 text-sm truncate mb-2">@{u.username}</div>
                        {!u.is_active && <span className="text-[10px] bg-rose-500/10 text-rose-400 font-bold uppercase px-2 py-1 rounded-md">Disabled</span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-4">
                      <div className="text-slate-500 text-[10px]">
                        Joined {u.created_at ? u.created_at.slice(0, 10) : '2026-06-01'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })} className={`px-2 py-1 rounded-md text-xs font-bold transition-colors ${u.is_active ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20' : 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'}`} title={u.is_active ? "Deactivate User" : "Activate User"}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => handleEdit(u)} className="p-1.5 rounded-md text-indigo-400 hover:bg-indigo-400/10 transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleResetClick(u.id)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-400/10 transition-colors" title="Reset Password">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </button>
                        <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded-md text-rose-400 hover:bg-rose-400/10 transition-colors" title="Delete">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center text-slate-500 border border-white/5 rounded-2xl border-dashed">
            No users found matching your search.
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-800 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h2 className="text-lg font-bold text-white mb-6">
              {editTargetId ? 'Edit Account' : 'Create New Account'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label text-xs tracking-wider uppercase mb-2 block">Full Name</label>
                <input className="form-input bg-surface-900 border-white/5 w-full" placeholder="Display name" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
              </div>
              <div>
                <label className="form-label text-xs tracking-wider uppercase mb-2 block">Username *</label>
                <input required className="form-input bg-surface-900 border-white/5 w-full" placeholder="login username" value={form.username} onChange={e => setForm({...form, username: e.target.value})} />
              </div>
              {!editTargetId && (
                <div>
                  <label className="form-label text-xs tracking-wider uppercase mb-2 block">Password *</label>
                  <input required type="password" className="form-input bg-surface-900 border-white/5 w-full" placeholder="Initial password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                </div>
              )}
              <div>
                <label className="form-label text-xs tracking-wider uppercase mb-2 block">Role *</label>
                <select className="form-input bg-surface-900 border-white/5 w-full" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="employee">Employee (Portal only)</option>
                <option value="boss">Boss</option>
                <option value="manager">Manager</option>
                <option value="hr_manager">HR Manager</option>
                <option value="finance">Finance</option>
                <option value="admin">System Admin</option>
              </select>
              </div>
              <div>
                <label className="form-label text-xs tracking-wider uppercase mb-2 block">Link to Employee Record</label>
                <select className="form-input bg-surface-900 border-white/5 w-full" value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}>
                  <option value="">— Optional —</option>
                  {employees?.map(e => <option key={e.id} value={e.id}>{e.Full_name}</option>)}
                </select>
                <p className="text-[10px] text-slate-500 mt-2 leading-tight">Link employee accounts so they can see their own data in the portal.</p>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={handleCancelEdit} className="flex-1 py-3 border border-white/10 hover:bg-white/5 text-slate-400 font-bold rounded-xl transition-colors text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={addMutation.isPending || editMutation.isPending} className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl transition-colors text-sm shadow-lg shadow-indigo-500/20">
                  {editTargetId ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.username}
      />

      {/* Reset Password Modal */}
      {resetTargetId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-800 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-2">Reset Password</h3>
            <p className="text-slate-400 text-xs mb-6">Enter a new password for this user account.</p>

            <form onSubmit={handleConfirmReset}>
              <div className="mb-6">
                <input
                  type="text"
                  autoFocus
                  required
                  className="w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="New password..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetTargetId(null)}
                  className="flex-1 px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-400 text-sm font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetMutation.isPending || !newPassword.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
