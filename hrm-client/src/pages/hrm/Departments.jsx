import useCreateIntent from '../../hooks/useCreateIntent';
import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import { useLanguage } from '../../context/LanguageContext';

export default function Departments() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  useCreateIntent(setShowModal);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [staffTarget, setStaffTarget] = useState(null);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/departments', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['departments']}); setShowModal(false); },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }) => api.put(`/departments/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['departments']}); setEditTarget(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/departments/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['departments']}); setDeleteTarget(null); },
  });

  const handleSave = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    if (editTarget) {
      editMutation.mutate({ id: editTarget.id, body });
    } else {
      addMutation.mutate(body);
    }
  };

  const departments = data?.departments || [];

  const mapDepartmentName = (name) => {
    if (!name) return name;
    const key = name.toLowerCase().replace(/\s+/g, '');
    const translated = t(`hrm.departments.names.${key}`);
    if (translated && !translated.startsWith('hrm.')) return translated;
    return name;
  };

  return (
    <Layout title={t('hrm.departments.title')} subtitle={t('hrm.departments.subtitle')}>
      <div className="flex justify-between items-center mb-6">
        <span className="text-sm text-slate-400">{departments.length} {t('hrm.departments.count')}</span>
        {isAdmin() && (
          <button onClick={() => { setEditTarget(null); setShowModal(true); }} className="dept-btn-primary px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors">
            + {t('hrm.departments.newBtn')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          <div className="col-span-full py-16 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
        ) : departments.map(d => (
          <div key={d.id} className="dept-card rounded-2xl p-5 relative overflow-hidden group transition-all" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="dept-bg-blob absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-colors" />
            <span className="uyf-icon-tile"><Icon name="departments" size={22}/></span>
            <h3 className="dept-title text-lg font-bold text-white mb-1">{mapDepartmentName(d.Department_name)}</h3>
            <p className="dept-desc text-xs text-slate-400 line-clamp-2 mb-4">{d.Descriptions || t('hrm.departments.noDesc')}</p>
            <div className="flex items-center justify-between mt-auto">
              <button
                onClick={() => setStaffTarget(d)}
                className="dept-badge text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-400/10 text-slate-300 hover:bg-slate-400/20 hover:text-white transition-colors cursor-pointer"
              >
                {d.emp_count || 0} {t('hrm.departments.employees')}
              </button>
              {isAdmin() && (
                <div className="flex gap-3">
                  <button onClick={() => setEditTarget(d)} className="dept-action-edit text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors">{t('common.actions.edit')}</button>
                  <button onClick={() => setDeleteTarget(d)} className="dept-action-delete text-rose-400 hover:text-rose-300 text-xs font-medium transition-colors">{t('common.actions.delete')}</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {(showModal || editTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowModal(false); setEditTarget(null); }} />
          <div className="relative rounded-2xl w-full max-w-md m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-base font-bold text-white mb-4">{editTarget ? t('hrm.departments.modalEditTitle') : t('hrm.departments.modalNewTitle')}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div><label className="form-label">{t('hrm.departments.formName')}</label><input name="Department_name" defaultValue={editTarget?.Department_name || ''} required className="form-input" /></div>
              <div><label className="form-label">{t('hrm.departments.formDesc')}</label><textarea name="Descriptions" defaultValue={editTarget?.Descriptions || ''} className="form-input" rows="3" /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditTarget(null); }} className="dept-btn-cancel flex-1 px-4 py-2.5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300 transition-colors rounded-xl">{t('common.actions.cancel')}</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl">{t('common.actions.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        itemName={mapDepartmentName(deleteTarget?.Department_name)}
      />

      {staffTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStaffTarget(null)} />
          <div className="relative bg-surface-850 border border-white/10 rounded-2xl w-full max-w-md m-4 p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white">{mapDepartmentName(staffTarget.Department_name)}</h2>
                <p className="text-sm text-slate-400 mt-1">{staffTarget.emp_count} {t('hrm.departments.employees')}</p>
              </div>
              <button onClick={() => setStaffTarget(null)} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {(!staffTarget.staff || staffTarget.staff.length === 0) ? (
                <div className="py-8 text-center text-slate-500 text-sm italic">
                  {t('hrm.positions.noStaffAssigned') || 'No staff currently assigned to this department.'}
                </div>
              ) : (
                staffTarget.staff.map(emp => (
                  <div key={emp.id} className="flex items-center gap-4 p-3 rounded-xl bg-surface-800 border border-white/5 hover:border-white/10 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => navigate(`/employees/${emp.id}`)}>
                    {emp.avatar_url ? (
                      <img src={emp.avatar_url} alt={emp.Full_name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm uppercase">
                        {(emp.Full_name || '?').charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{emp.Full_name || '—'}</p>
                      <p className="text-xs text-slate-400 truncate">{emp.employee_id || '—'}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
