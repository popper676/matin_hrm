import useCreateIntent from '../../hooks/useCreateIntent';
import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import PositionAnnouncementModal from '../../components/positions/PositionAnnouncementModal';
import { useLanguage } from '../../context/LanguageContext';

export default function Positions() {
  const { t } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  useCreateIntent(setShowModal);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [announceTarget, setAnnounceTarget] = useState(null);
  const [staffTarget, setStaffTarget] = useState(null);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['positions'], queryFn: () => api.get('/positions').then(r => r.data) });

  const { data: fbConnection } = useQuery({
    queryKey: ['positions-fb-connection'],
    queryFn: () => api.get('/positions/facebook-connection').then(r => r.data),
    enabled: isAdmin(),
  });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/positions', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['positions']});
      setShowModal(false);
      toast.success(t('hrm.positions.toast.addSuccess') || 'Position added successfully');
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.positions.toast.addError') || 'Failed to add position')
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }) => api.put(`/positions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['positions']});
      setEditTarget(null);
      toast.success(t('hrm.positions.toast.editSuccess') || 'Position updated successfully');
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.positions.toast.editError') || 'Failed to update position')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/positions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['positions']});
      setDeleteTarget(null);
      toast.success(t('hrm.positions.toast.deleteSuccess') || 'Position deleted successfully');
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.positions.toast.deleteError') || 'Failed to delete position')
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

  const positions = data?.positions || [];

  const filteredPositions = positions.filter(p =>
    p.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.level?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedPositions = filteredPositions.reduce((acc, p) => {
    const level = p.level || 'Unassigned';
    if (!acc[level]) acc[level] = [];
    acc[level].push(p);
    return acc;
  }, {});

  const levelOrder = { Executive: 1, Manager: 2, Supervisor: 3, Senior: 4, Mid: 5, Junior: 6 };
  const sortedLevels = Object.keys(groupedPositions).sort((a, b) => {
    const orderA = levelOrder[a] || 99;
    const orderB = levelOrder[b] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  const levelColor = {
    Executive: 'text-amber-400 bg-amber-400/10',
    Manager: 'text-amber-400 bg-amber-400/10',
    Supervisor: 'text-emerald-400 bg-emerald-400/10',
    Senior: 'text-orange-400 bg-orange-400/10',
    Mid: 'text-indigo-400 bg-indigo-400/10',
    Junior: 'text-slate-400 bg-slate-400/10',
  };

  const mapLevel = (level) => {
    if (!level) return level;
    const key = level.toLowerCase();
    const translated = t(`hrm.positions.levels.${key}`);
    if (translated && !translated.startsWith('hrm.')) return translated;
    return level;
  };

  const mapPositionTitle = (title) => {
    if (!title) return title;
    const key = title.trim().toLowerCase().replace(/\s+/g, '');
    const translated = t(`hrm.positions.names.${key}`);
    if (translated && !translated.startsWith('hrm.')) return translated;
    return title;
  };

  return (
    <Layout title={t('hrm.positions.title')} subtitle={t('hrm.positions.subtitle')}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <span className="text-sm text-slate-400 whitespace-nowrap">{positions.length} {t('hrm.positions.count')}</span>
          <input
            type="text"
            placeholder={t('hrm.positions.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 bg-surface-800 text-slate-300 text-sm rounded-xl px-4 py-2 border border-white/5 outline-none focus:border-indigo-500"
          />
        </div>
        {isAdmin() && (
          <button onClick={() => { setEditTarget(null); setShowModal(true); }} className="px-4 py-2 bg-brand-green hover:bg-emerald-500 text-black text-sm font-semibold rounded-xl whitespace-nowrap">
            + {t('hrm.positions.newBtn')}
          </button>
        )}
      </div>

      {isAdmin() && fbConnection && (
        <div className={`pos-fb-notice mb-6 rounded-xl px-4 py-3 text-xs flex items-center gap-2 border ${
          fbConnection.configured && fbConnection.healthStatus !== 'error'
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
            : 'bg-amber-500/5 border-amber-500/30 text-amber-200'
        }`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span>
            {t('hrm.positions.facebookNotice')} <strong>{fbConnection.provider === 'zernio' ? 'Zernio' : fbConnection.provider === 'graph_api' ? 'Graph API' : '—'}</strong>
            {fbConnection.message ? ` — ${fbConnection.message}` : ` — ${t('hrm.positions.facebookSetKeys')}`}
          </span>
        </div>
      )}

      <div className="space-y-8">
        {isLoading ? (
          <div className="py-10 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : sortedLevels.length > 0 ? (
          sortedLevels.map(level => (
            <div key={level}>
              <h2 className="pos-level-header text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
                <span className={`pos-level-dot w-2 h-2 rounded-full ${levelColor[level] ? levelColor[level].split(' ')[1] : 'bg-slate-500'}`}></span>
                {mapLevel(level)} {t('hrm.positions.level')}
                <span className="pos-level-count text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">{groupedPositions[level].length}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedPositions[level].map(p => (
          <div key={p.id} className="pos-card p-6 rounded-2xl border border-white/5 bg-surface-800 hover:bg-white/5 transition-colors flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
              <div className="pos-icon-box w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditTarget(p)} className="pos-action-edit text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">{t('common.actions.edit')}</button>
                {isAdmin() && (
                  <button onClick={() => setDeleteTarget(p)} className="pos-action-delete text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors">
                    {t('common.actions.delete')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1">
              <span className="uyf-icon-tile"><Icon name="positions" size={22}/></span>
                      <h3 className="pos-title text-lg font-bold text-white mb-1">{mapPositionTitle(p.title)}</h3>
              <p className="pos-desc text-sm text-slate-400">
                {t('hrm.positions.level')}: {mapLevel(p.level)} <span className="mx-1">|</span> {t('hrm.positions.baseSalary')}: {Number(p.base_salary || 0).toLocaleString()} THB
              </p>
            </div>

            <div className="pos-footer mt-6 flex items-center justify-between border-t border-white/5 pt-4">
              <button
                onClick={() => setStaffTarget(p)}
                className="pos-staff-badge px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold rounded-full transition-colors cursor-pointer border border-indigo-500/20 hover:border-indigo-500/40"
              >
                {p.emp_count || 0} {t('hrm.positions.staff')}
              </button>
              <div className="flex items-center gap-3">
                {p.is_hiring && isAdmin() && (
                  <button
                    title={t('hrm.positions.composeFbAnnouncement')}
                    onClick={() => setAnnounceTarget(p)}
                    className="pos-action-announce flex items-center justify-center w-7 h-7 rounded-lg bg-brand-green/20 text-brand-green hover:bg-brand-green hover:text-black transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </button>
                )}
                <Link to="/recruitment" className="job-text-button">{t('common.recruitmentUpgrade.jobOpenings')} →</Link>
              </div>
            </div>
          </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-16 text-center text-slate-500 border border-white/5 rounded-2xl border-dashed">
            {t('hrm.positions.empty')}
          </div>
        )}
      </div>

      {(showModal || editTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowModal(false); setEditTarget(null); }} />
          <div className="relative rounded-2xl w-full max-w-md m-4 p-6 bg-surface-850 border border-white/10">
            <h2 className="text-base font-bold text-white mb-4">{editTarget ? t('hrm.positions.modalEditTitle') : t('hrm.positions.modalNewTitle')}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div><label className="form-label">{t('hrm.positions.formTitle')}</label><input name="title" required defaultValue={editTarget?.title || ''} className="form-input" /></div>
              <div>
                <label className="form-label">{t('hrm.positions.formLevel')}</label>
                <select name="level" className="form-input" defaultValue={editTarget?.level || 'Mid'}>
                  {Object.keys(levelColor).map(l => <option key={l} value={l}>{mapLevel(l)}</option>)}
                </select>
              </div>
              <div><label className="form-label">{t('hrm.positions.formSalary')}</label><input type="number" name="base_salary" defaultValue={editTarget?.base_salary || ''} className="form-input" /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditTarget(null); }} className="pos-btn-cancel flex-1 px-4 py-2.5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300 transition-colors rounded-xl">{t('common.actions.cancel')}</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-brand-green hover:bg-emerald-500 text-black font-semibold rounded-xl transition-colors">{t('common.actions.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {announceTarget && (
        <PositionAnnouncementModal
          position={announceTarget}
          connection={fbConnection}
          onClose={() => setAnnounceTarget(null)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-surface-800 border border-rose-500/30 rounded-2xl w-full max-w-sm m-4 p-6 shadow-2xl shadow-rose-900/20 text-center">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 flex items-center justify-center rounded-full mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">{t('hrm.positions.deleteTitle')}</h2>
            <p className="text-sm text-slate-400 mb-6">
              {t('hrm.positions.deleteDesc1')} <strong className="text-white">{mapPositionTitle(deleteTarget.title)}</strong> {t('hrm.positions.deleteDesc2')}
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteTarget(null)} className="pos-btn-cancel px-6 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-xl transition-colors">
                {t('common.actions.cancel')}
              </button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-600/20">
                {t('common.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {staffTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStaffTarget(null)} />
          <div className="relative bg-surface-850 border border-white/10 rounded-2xl w-full max-w-md m-4 p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white">{mapPositionTitle(staffTarget.title)}</h2>
                <p className="text-sm text-slate-400 mt-1">{staffTarget.emp_count} {t('hrm.positions.staff')}</p>
              </div>
              <button onClick={() => setStaffTarget(null)} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {(!staffTarget.staff || staffTarget.staff.length === 0) ? (
                <div className="py-8 text-center text-slate-500 text-sm italic">
                  {t('hrm.positions.noStaffAssigned') || 'No staff currently assigned to this position.'}
                </div>
              ) : (
                staffTarget.staff.map(emp => (
                  <div key={emp.id} className="flex items-center gap-4 p-3 rounded-xl bg-surface-800 border border-white/5 hover:border-white/10 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => window.location.href = `/employees/${emp.id}`}>
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
